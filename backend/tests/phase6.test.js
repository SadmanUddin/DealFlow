import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import request from 'supertest';

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
vi.mock('#models/listing.model.js', async () => ({
  businessListings: (await import('./helpers/mock-database.js')).modelTables
    .businessListings,
}));
vi.mock('#models/conversation.model.js', async () => {
  const tables = (await import('./helpers/mock-database.js')).modelTables;
  return {
    conversations: tables.conversations,
    messages: tables.messages,
    conversationDocuments: tables.conversationDocuments,
  };
});
vi.mock(
  '#models/phase6.model.js',
  async () => (await import('./helpers/mock-database.js')).phase6Tables
);
vi.mock('#config/arcjet.js', () => {
  const client = {
    withRule: () => client,
    protect: async () => ({ isDenied: () => false }),
  };
  return { default: client };
});
vi.mock('#config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn((_message, details) => {
      process.env.PHASE6_LAST_ERROR = details?.error;
    }),
  },
}));
vi.mock('#services/email/email.adapter.js', () => ({
  sendEmail: vi.fn(async () => ({ id: 'mock' })),
}));

const { databaseState, resetDatabase } =
  await import('./helpers/mock-database.js');
const { default: app } = await import('../src/app.js');
const {
  processOutboxEvent,
  failOutboxEvent,
  createOutboxLeaseGuard,
  finishOutboxEvent,
} = await import('#services/outbox.service.js');
const { sendEmail } = await import('#services/email/email.adapter.js');
const { sendResendEmail } =
  await import('../src/services/email/resend.provider.js');
const password = 'StrongTestPassword!123';
const listingInput = {
  title: 'A tested business listing',
  description: 'A detailed description suitable for the test listing.',
  industry: 'Retail',
  location: 'Brussels',
  asking_price: '100000.00',
  currency: 'EUR',
};
const credentials = response => ({
  cookie: response.headers['set-cookie']
    .map(value => value.split(';')[0])
    .join('; '),
  csrf: response.body.csrfToken,
});
const signed = (builder, user) =>
  builder.set('Cookie', user.cookie).set('X-CSRF-Token', user.csrf);
const signup = async (role, email) =>
  credentials(
    await request(app)
      .post('/api/auth/sign-up')
      .send({ name: role, email, password, role })
  );

let buyer;
let seller;
let outsider;
let listingId;
beforeEach(async () => {
  resetDatabase();
  sendEmail.mockReset().mockResolvedValue({ id: 'mock' });
  buyer = await signup('buyer', 'buyer@phase6.test');
  seller = await signup('seller', 'seller@phase6.test');
  outsider = await signup('seller', 'outsider@phase6.test');
  const listing = await signed(request(app).post('/api/listings'), seller).send(
    listingInput
  );
  listingId = listing.body.listing.id;
  Object.assign(databaseState.business_listings[0], {
    status: 'published',
    published_at: new Date(),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('Phase 6 inquiry lifecycle', () => {
  it('starts pending, permits seller transitions and blocks buyers, other sellers, and invalid transitions', async () => {
    const started = await signed(
      request(app).post('/api/conversations'),
      buyer
    ).send({ listingId });
    expect(started.status).toBe(201);
    expect(started.body.conversation.status).toBe('pending');
    const id = started.body.conversation.id;
    expect(databaseState.conversations[0].status).toBe('pending');
    expect(databaseState.conversations[0].status_updated_at).toBeInstanceOf(
      Date
    );
    let conversationList = await request(app)
      .get('/api/conversations')
      .set('Cookie', buyer.cookie);
    expect(conversationList.body.conversations[0]).toMatchObject({
      status: 'pending',
      statusUpdatedAt:
        databaseState.conversations[0].status_updated_at.toISOString(),
    });
    const latestStatusDate = new Date(Date.now() + 1000);
    Object.assign(databaseState.conversations[0], {
      status: 'in_review',
      status_updated_at: latestStatusDate,
    });
    conversationList = await request(app)
      .get('/api/conversations')
      .set('Cookie', buyer.cookie);
    expect(conversationList.body.conversations[0]).toMatchObject({
      status: 'in_review',
      statusUpdatedAt: latestStatusDate.toISOString(),
    });
    Object.assign(databaseState.conversations[0], {
      status: 'pending',
      status_updated_at: new Date(),
    });
    const legacyUpdatedAt = new Date('2024-01-01T00:00:00.000Z');
    databaseState.conversations.push({
      id: 500,
      listing_id: listingId,
      buyer_id: 1,
      seller_id: 2,
      status: 'pending',
      status_updated_at: legacyUpdatedAt,
      created_at: legacyUpdatedAt,
    });
    conversationList = await request(app)
      .get('/api/conversations')
      .set('Cookie', buyer.cookie);
    expect(
      conversationList.body.conversations.find(
        conversation => conversation.id === 500
      )
    ).toMatchObject({
      status: 'pending',
      statusUpdatedAt: legacyUpdatedAt.toISOString(),
    });
    expect(
      (
        await signed(
          request(app).patch(`/api/conversations/${id}/status`),
          buyer
        ).send({ status: 'accepted' })
      ).status
    ).toBe(403);
    const unrelated = await signed(
      request(app).patch(`/api/conversations/${id}/status`),
      outsider
    ).send({ status: 'accepted' });
    expect(
      unrelated.status,
      `${JSON.stringify(unrelated.body)} ${process.env.PHASE6_LAST_ERROR}`
    ).toBe(404);
    expect(
      (
        await signed(
          request(app).patch(`/api/conversations/${id}/status`),
          seller
        ).send({ status: 'in_review' })
      ).status
    ).toBe(200);
    expect(
      (
        await signed(
          request(app).patch(`/api/conversations/${id}/status`),
          seller
        ).send({ status: 'pending' })
      ).status
    ).toBe(409);
    expect(
      (
        await signed(
          request(app).patch(`/api/conversations/${id}/status`),
          seller
        ).send({ status: 'accepted' })
      ).status
    ).toBe(200);
  });
});

describe('Phase 6 favorites and notifications', () => {
  it('enforces buyer ownership, unique favorites, and listing eligibility', async () => {
    expect(
      (await signed(request(app).post(`/api/favorites/${listingId}`), buyer))
        .status
    ).toBe(201);
    expect(
      (await signed(request(app).post(`/api/favorites/${listingId}`), buyer))
        .status
    ).toBe(200);
    expect(databaseState.favorites).toHaveLength(1);
    expect(
      (await request(app).get('/api/favorites').set('Cookie', buyer.cookie))
        .body.favorites
    ).toHaveLength(1);
    expect(
      (await signed(request(app).post(`/api/favorites/${listingId}`), seller))
        .status
    ).toBe(403);
    expect(
      (await signed(request(app).delete(`/api/favorites/${listingId}`), buyer))
        .status
    ).toBe(200);
    expect(databaseState.favorites).toHaveLength(0);
    databaseState.business_listings.push({
      ...databaseState.business_listings[0],
      id: 99,
      seller_id: 1,
      status: 'published',
    });
    expect(
      (await signed(request(app).post('/api/favorites/99'), buyer).send({}))
        .status
    ).toBe(403);
  });

  it('returns only published favorite listings and paginates after filtering', async () => {
    const statuses = [
      'published',
      'published',
      'pending',
      'rejected',
      'archived',
    ];
    const rows = statuses.map((status, index) => ({
      ...databaseState.business_listings[0],
      id: index === 0 ? listingId : 100 + index,
      title: `Private fixture ${status} ${index}`,
      description: `Private details for ${status} listing ${index}.`,
      status,
      asking_price: `${100 + index}.00`,
      published_at: status === 'published' ? new Date() : null,
    }));
    Object.assign(databaseState.business_listings[0], rows[0]);
    for (const row of rows.slice(1)) databaseState.business_listings.push(row);
    rows.forEach((row, index) =>
      databaseState.favorites.push({
        id: 200 + index,
        user_id: 1,
        listing_id: row.id,
        created_at: new Date(Date.now() + index),
      })
    );

    const pageOne = await request(app)
      .get('/api/favorites?page=1&limit=1')
      .set('Cookie', buyer.cookie);
    const pageTwo = await request(app)
      .get('/api/favorites?page=2&limit=1')
      .set('Cookie', buyer.cookie);
    expect(pageOne.body.pagination).toMatchObject({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
    expect(pageTwo.body.pagination).toMatchObject({
      page: 2,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
    expect(
      [...pageOne.body.favorites, ...pageTwo.body.favorites]
        .map(favorite => favorite.listingId)
        .sort()
    ).toEqual([listingId, 101].sort());
    expect(
      [...pageOne.body.favorites, ...pageTwo.body.favorites].every(favorite =>
        favorite.title.startsWith('Private fixture published')
      )
    ).toBe(true);
    expect(databaseState.favorites).toHaveLength(5);
    for (const favorite of [
      ...pageOne.body.favorites,
      ...pageTwo.body.favorites,
    ]) {
      expect(favorite).not.toHaveProperty('privateListing');
      expect(favorite.status).toBeUndefined();
    }
  });

  it('paginates and isolates notification read, bulk read, deletion, and preferences', async () => {
    databaseState.notifications.push({
      id: 1,
      user_id: 1,
      type: 'listing.approved',
      payload: { listingId },
      read_at: null,
      created_at: new Date(),
    });
    databaseState.notifications.push({
      id: 2,
      user_id: 2,
      type: 'listing.archived',
      payload: { listingId },
      read_at: null,
      created_at: new Date(),
    });
    const listed = await request(app)
      .get('/api/notifications?unread=true')
      .set('Cookie', buyer.cookie);
    expect(listed.body.notifications).toHaveLength(1);
    expect(
      (
        await signed(
          request(app).patch('/api/notifications/2/read'),
          buyer
        ).send({})
      ).status
    ).toBe(404);
    expect(
      (
        await signed(
          request(app).patch('/api/notifications/1/read'),
          buyer
        ).send({})
      ).status
    ).toBe(200);
    expect(
      (
        await signed(request(app).patch('/api/notifications/read'), buyer).send(
          {}
        )
      ).body.updatedCount
    ).toBe(0);
    expect(
      (await signed(request(app).delete('/api/notifications/1'), buyer)).status
    ).toBe(200);
    expect(
      (
        await request(app)
          .get('/api/notifications/preferences/email')
          .set('Cookie', buyer.cookie)
      ).body.preferences
    ).toMatchObject({
      listingStatus: true,
      listingPrice: true,
      listingDetails: true,
    });
    expect(
      (
        await signed(
          request(app).patch('/api/notifications/preferences/email'),
          buyer
        ).send({ listingPrice: false })
      ).body.preferences.listingPrice
    ).toBe(false);
    const partialUpdate = await signed(
      request(app).patch('/api/notifications/preferences/email'),
      buyer
    ).send({ listingDetails: false });
    expect(partialUpdate.body.preferences).toMatchObject({
      listingPrice: false,
      listingDetails: false,
    });
  });

  it('creates listing event notifications idempotently for favoriting users', async () => {
    databaseState.users[0].email_verified = true;
    const event = {
      id: 77,
      eventKey: 'listing:1:approved:event',
      type: 'listing.approved',
      payload: { listingId, title: 'Public title', userIds: [1] },
      attempts: 1,
    };
    await processOutboxEvent(event);
    await processOutboxEvent(event);
    expect(databaseState.notifications).toHaveLength(1);
    expect(databaseState.notifications[0]).toMatchObject({
      user_id: 1,
      type: 'listing.approved',
      payload: { listingId, title: 'Public title' },
    });
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail.mock.calls[0][0].idempotencyKey).toBe(
      sendEmail.mock.calls[1][0].idempotencyKey
    );
  });

  it('keeps in-app notifications enabled when email is opted out and retries transient email failures', async () => {
    databaseState.users[0].email_verified = true;
    databaseState.notification_email_preferences.push({
      user_id: 1,
      listing_status: false,
      listing_price: true,
      listing_details: true,
    });
    const optedOutEvent = {
      id: 78,
      eventKey: 'listing:2:approved:event',
      type: 'listing.approved',
      payload: { listingId, title: 'Public title', userIds: [1] },
      attempts: 1,
    };
    await processOutboxEvent(optedOutEvent);
    expect(databaseState.notifications).toHaveLength(1);
    expect(sendEmail).not.toHaveBeenCalled();

    databaseState.notification_email_preferences.length = 0;
    sendEmail.mockRejectedValueOnce(new Error('temporary network issue'));
    await expect(
      processOutboxEvent({
        ...optedOutEvent,
        eventKey: 'listing:3:approved:event',
      })
    ).rejects.toThrow('temporary network issue');
    await expect(
      processOutboxEvent({
        ...optedOutEvent,
        eventKey: 'listing:3:approved:event',
      })
    ).resolves.toBeUndefined();
    expect(databaseState.notifications).toHaveLength(2);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it('records the in-app notification and does not retry permanent email failures', async () => {
    databaseState.users[0].email_verified = true;
    const permanent = new Error('Invalid recipient');
    permanent.permanent = true;
    sendEmail.mockRejectedValueOnce(permanent);
    const event = {
      id: 79,
      eventKey: 'listing:4:approved:event',
      type: 'listing.approved',
      payload: { listingId, title: 'Public title', userIds: [1] },
      attempts: 1,
    };
    await expect(processOutboxEvent(event)).resolves.toBeUndefined();
    expect(databaseState.notifications).toHaveLength(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('backs off transient failures and dead-letters exhausted or permanent events', async () => {
    databaseState.outbox_events.push({
      id: 90,
      status: 'processing',
      attempts: 1,
      lock_token: 'lease-a',
      locked_at: new Date(),
    });
    await failOutboxEvent(
      { id: 90, attempts: 1, lockToken: 'lease-a', type: 'listing.approved' },
      new Error('Temporary provider issue')
    );
    expect(databaseState.outbox_events[0].status).toBe('pending');
    databaseState.outbox_events[0].status = 'processing';
    databaseState.outbox_events[0].attempts = 8;
    databaseState.outbox_events[0].lock_token = 'lease-b';
    databaseState.outbox_events[0].locked_at = new Date();
    await failOutboxEvent(
      { id: 90, attempts: 8, lockToken: 'lease-b', type: 'listing.approved' },
      new Error('Repeated failure')
    );
    expect(databaseState.outbox_events[0].status).toBe('dead');
  });

  it('stops work on expired or failed leases and prevents stale workers from finalizing', async () => {
    let aborted = false;
    const expired = createOutboxLeaseGuard(
      async () => false,
      () => {
        aborted = true;
      }
    );
    await expect(expired.assertLease()).rejects.toThrow(
      'lease is no longer owned'
    );
    expect(expired.lost).toBe(true);
    expect(aborted).toBe(true);

    const heartbeatFailure = createOutboxLeaseGuard(async () => {
      throw new Error('database unavailable');
    });
    await expect(heartbeatFailure.assertLease()).rejects.toThrow(
      'database unavailable'
    );
    expect(heartbeatFailure.lost).toBe(true);

    databaseState.outbox_events.push({
      id: 91,
      status: 'processing',
      attempts: 1,
      lock_token: 'new-owner',
      locked_at: new Date(),
    });
    const staleFinished = await finishOutboxEvent({
      id: 91,
      lockToken: 'old-owner',
    });
    expect(staleFinished).toBe(false);
    expect(databaseState.outbox_events[0]).toMatchObject({
      status: 'processing',
      lock_token: 'new-owner',
    });
    expect(await finishOutboxEvent({ id: 91, lockToken: 'new-owner' })).toBe(
      true
    );
    expect(databaseState.outbox_events[0].status).toBe('processed');
  });

  it('allows only the current mocked lease owner to continue and deduplicates logical event delivery', async () => {
    let owner = 'worker-a';
    const workerA = createOutboxLeaseGuard(async () => owner === 'worker-a');
    const workerB = createOutboxLeaseGuard(async () => owner === 'worker-b');
    await workerA.assertLease();
    await expect(workerB.assertLease()).rejects.toThrow(
      'lease is no longer owned'
    );
    owner = 'worker-b';
    await expect(workerA.assertLease()).rejects.toThrow(
      'lease is no longer owned'
    );
    const newWorkerB = createOutboxLeaseGuard(async () => owner === 'worker-b');
    await expect(newWorkerB.assertLease()).resolves.toBeUndefined();

    databaseState.users[0].email_verified = false;
    const base = {
      id: 92,
      type: 'listing.price_changed',
      payload: {
        listingId,
        title: 'Public title',
        askingPrice: '200.00',
        currency: 'EUR',
        priceChanged: true,
        userIds: [1],
      },
      attempts: 1,
    };
    await processOutboxEvent({ ...base, eventKey: 'listing:1:price:time-a' });
    await processOutboxEvent({ ...base, eventKey: 'listing:1:price:time-a' });
    expect(databaseState.notifications).toHaveLength(1);
    await processOutboxEvent({ ...base, eventKey: 'listing:1:price:time-b' });
    expect(databaseState.notifications).toHaveLength(2);
    await processOutboxEvent({
      ...base,
      eventKey: 'listing:700:price:time-a',
      payload: { ...base.payload, listingId: 700 },
    });
    expect(databaseState.notifications).toHaveLength(3);
  });

  it('keeps quarantined events outside worker claims and protects their state from stale workers', async () => {
    const workerSource = await readFile(
      new URL('../src/services/outbox.service.js', import.meta.url),
      'utf8'
    );
    expect(workerSource).toContain('WHERE status <> \'quarantined\'');
    expect(workerSource).toContain('eq(outboxEvents.status, \'processing\')');

    const row = {
      id: 93,
      status: 'quarantined',
      attempts: 0,
      lock_token: null,
      locked_at: null,
      last_error: null,
    };
    databaseState.outbox_events.push(row);
    expect(await finishOutboxEvent({ id: 93, lockToken: 'stale-owner' })).toBe(
      false
    );
    expect(
      await failOutboxEvent(
        {
          id: 93,
          attempts: 1,
          lockToken: 'stale-owner',
          type: 'listing.approved',
        },
        new Error('late failure')
      )
    ).toBe(false);
    expect(row.status).toBe('quarantined');
    expect(row.lock_token).toBeNull();
  });

  it('encodes conservative legacy event recovery and quarantine rules in migration 0010', async () => {
    const initialMigration = await readFile(
      new URL(
        '../drizzle/0008_phase6_notifications_outbox.sql',
        import.meta.url
      ),
      'utf8'
    );
    const migration = await readFile(
      new URL(
        '../drizzle/0010_phase6_legacy_outbox_quarantine.sql',
        import.meta.url
      ),
      'utf8'
    );
    expect(initialMigration).toContain(
      'CONSTRAINT outbox_events_status_valid CHECK'
    );
    expect(migration).toContain('DROP CONSTRAINT outbox_events_status_valid');
    expect(migration).toContain(
      'CHECK (status IN (\'pending\', \'processing\', \'processed\', \'dead\', \'quarantined\'))'
    );
    expect(migration).toContain('event.type = \'listing.approved\'');
    expect(migration).toContain('event.attempts = 0');
    expect(migration).toContain('AND NOT EXISTS (');
    expect(migration).toContain('event.type = \'listing.price_changed\' THEN');
    expect(migration).toContain('event.type = \'listing.details_changed\' THEN');
    expect(migration).toContain('event.type = \'listing.rejected\' THEN');
    expect(migration).toContain('event.type = \'listing.archived\' THEN');
    expect(migration).toContain('event.attempts > 0');
    expect(migration).toContain('event_key ~ \'^listing:[0-9]+:');
    expect(migration).not.toMatch(/\bDELETE\s+FROM\s+outbox_events/i);
    expect(migration).not.toMatch(/\bINSERT\s+INTO\s+outbox_events/i);
    expect(migration).not.toContain('UPDATE outbox_events SET event_key');
  });

  it('uses Resend idempotency headers and classifies transient provider responses for retry', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: { name: 'concurrent_idempotent_requests' } }),
    });
    vi.stubGlobal('fetch', fetch);
    const message = {
      to: 'buyer@example.test',
      subject: 'Test',
      html: '<p>Test</p>',
      text: 'Test',
      idempotencyKey: 'listing:event:user',
    };
    await expect(
      sendResendEmail(message, {
        RESEND_API_KEY: 'test-key',
        EMAIL_FROM: 'notifications@example.test',
      })
    ).rejects.toMatchObject({ permanent: false });
    expect(fetch.mock.calls[0][1].headers['Idempotency-Key']).toBe(
      message.idempotencyKey
    );

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 408,
      json: async () => ({}),
    });
    await expect(
      sendResendEmail(message, {
        RESEND_API_KEY: 'test-key',
        EMAIL_FROM: 'notifications@example.test',
      })
    ).rejects.toMatchObject({ permanent: false });
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ name: 'invalid_idempotent_request' }),
    });
    await expect(
      sendResendEmail(message, {
        RESEND_API_KEY: 'test-key',
        EMAIL_FROM: 'notifications@example.test',
      })
    ).rejects.toMatchObject({ permanent: true });
  });
});
