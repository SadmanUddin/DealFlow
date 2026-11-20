import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://localhost:5432/dealflow_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-32-chars';
process.env.ARCJET_KEY = 'test-only-arcjet-key';
process.env.EMAIL_PROVIDER = 'mock';

vi.mock('#config/database.js', async () => ({
  db: (await import('./helpers/mock-database.js')).db,
}));
vi.mock(
  'drizzle-orm',
  async () => (await import('./helpers/mock-database.js')).drizzleOperators
);
vi.mock(
  '#models/user.model.js',
  async () => (await import('./helpers/mock-database.js')).modelTables
);
vi.mock(
  '#models/phase6.model.js',
  async () => (await import('./helpers/mock-database.js')).phase6Tables
);
vi.mock('#config/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('#services/email/email.adapter.js', () => ({
  sendEmail: vi.fn(async () => ({ id: 'mock' })),
}));

const { databaseState, resetDatabase } =
  await import('./helpers/mock-database.js');
const { processOutboxEvent } = await import('#services/outbox.service.js');
const { sendEmail } = await import('#services/email/email.adapter.js');

describe('Phase 8 deal outbox email preferences', () => {
  beforeEach(() => {
    resetDatabase();
    sendEmail.mockReset().mockResolvedValue({ id: 'mock' });
    databaseState.users.push({
      id: 5,
      email: 'buyer@example.test',
      email_verified: true,
      is_active: true,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends deal email only when deal updates are enabled', async () => {
    await processOutboxEvent({
      id: 1,
      eventKey: 'deal:9:created',
      type: 'deal.created',
      payload: { dealId: 9, recipientIds: [5] },
    });
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail.mock.calls[0][0]).toMatchObject({
      to: 'buyer@example.test',
      idempotencyKey: 'deal:9:created:email:5',
    });

    databaseState.notification_email_preferences.push({
      user_id: 5,
      deal_updates: false,
    });
    sendEmail.mockClear();
    await processOutboxEvent({
      id: 2,
      eventKey: 'deal:9:offer:2',
      type: 'deal.offer',
      payload: { dealId: 9, recipientIds: [5] },
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('rejects malformed deal events as permanent failures', async () => {
    await expect(
      processOutboxEvent({
        id: 3,
        eventKey: 'invalid',
        type: 'deal.created',
        payload: {},
      })
    ).rejects.toMatchObject({ permanent: true });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
