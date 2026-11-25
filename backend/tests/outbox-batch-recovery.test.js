import { PgDialect } from 'drizzle-orm/pg-core';
import { expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({ execute: vi.fn(), update: vi.fn() }));
vi.mock('#config/database.js', () => ({ db: database }));

const { processOutboxBatch } = await import('#services/outbox.service.js');

it('waits for a sibling job to settle when a worker loses its database connection', async () => {
  const fault = new Error('Synthetic database interruption');
  const dialect = new PgDialect();
  const jobs = [11, 22].map(id => ({
    id,
    eventKey: 'test-' + id,
    type: 'listing.details_changed',
    attempts: 1,
    lockToken: 'test-lease',
    payload: { title: 'Synthetic listing', listingId: 1, userIds: [] },
  }));
  database.execute.mockResolvedValue({ rows: jobs });
  const sibling = Promise.withResolvers();
  const siblingFinishing = Promise.withResolvers();
  const failureRecording = Promise.withResolvers();
  database.update.mockReturnValue({
    set: values => ({
      where: condition => ({
        returning: async () => {
          const [id] = dialect.sqlToQuery(condition).params;
          if (values.status === 'processed' && id === 22) {
            siblingFinishing.resolve();
            await sibling.promise;
          }
          if (values.status === 'processed' && id === 11) throw fault;
          if (values.status === 'pending' && id === 11) {
            failureRecording.resolve();
            throw fault;
          }
          return [{ id }];
        },
      }),
    }),
  });

  let settled = false;
  const batch = processOutboxBatch().finally(() => {
    settled = true;
  });
  const rejected = expect(batch).rejects.toBe(fault);
  try {
    await Promise.all([siblingFinishing.promise, failureRecording.promise]);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(settled).toBe(false);
  } finally {
    sibling.resolve();
    await rejected;
  }
});
