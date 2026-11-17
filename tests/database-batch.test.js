import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '#utils/app-error.js';
import { databaseState, db, modelTables, resetDatabase } from './helpers/mock-database.js';

vi.mock('#config/database.js', async () => {
  const mock = await import('./helpers/mock-database.js');
  return { db: mock.db };
});
vi.mock('#config/logger.js', () => ({
  default: { error: vi.fn() },
}));

const { executeDatabaseBatch } = await import('#services/database-batch.service.js');

describe('database batch service', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('uses the database batch API for supported Drizzle operations', async () => {
    const insert = db.insert(modelTables.users).values({
      name: 'Batch User',
      email: 'batch@example.test',
      password: 'hash',
      role: 'buyer',
    }).returning({ id: modelTables.users.id });
    const select = db.select({ id: modelTables.users.id }).from(modelTables.users);

    const result = await executeDatabaseBatch([insert, select]);

    expect(databaseState.batchCalls).toBe(1);
    expect(databaseState.users).toHaveLength(1);
    expect(result).toEqual([[{ id: 1 }], [{ id: 1 }]]);
  });

  it('maps failed batches to the application database error', async () => {
    databaseState.failNext = new Error('database connection detail');
    databaseState.failOn = {
      table: 'users',
      operation: 'insert',
    };
    const insert = db.insert(modelTables.users).values({
      name: 'Batch User',
      email: 'batch@example.test',
      password: 'hash',
    });

    await expect(executeDatabaseBatch([insert])).rejects.toMatchObject(
      {
        status: 503,
        code: 'DATABASE_BATCH_FAILED',
        message: 'Database operations are temporarily unavailable',
      }
    );
    expect(databaseState.batchCalls).toBe(1);
  });

  it('rolls back prior mock operations when a later batch operation fails', async () => {
    const insert = db.insert(modelTables.users).values({
      name: 'Batch User',
      email: 'batch@example.test',
      password: 'hash',
    });
    const select = db.select({ id: modelTables.users.id }).from(modelTables.users);
    databaseState.failNext = new Error('query failed');
    databaseState.failOn = {
      table: 'users',
      operation: 'select',
    };

    await expect(executeDatabaseBatch([insert, select])).rejects.toBeInstanceOf(
      AppError
    );
    expect(databaseState.users).toHaveLength(0);
    expect(databaseState.nextUserId).toBe(1);
  });
});
