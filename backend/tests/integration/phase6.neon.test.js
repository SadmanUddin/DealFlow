import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { neon } from '@neondatabase/serverless';

process.env.NODE_ENV = 'test';
process.env.EMAIL_PROVIDER = 'mock';
const marker = `phase6-${randomUUID()}`;
const expectedTarget = {
  hostname: 'ep-super-king-b9pem88j-pooler.c-7.eu-central-1.aws.neon.tech',
  projectId: 'icy-cloud-01728765',
  endpointId: 'ep-super-king-b9pem88j',
  database: 'neondb',
  role: 'neondb_owner',
};
let sql;
let userId;
let sellerId;
let listingId;
let outboxModule;

describe('Phase 6 Neon outbox integration', () => {
  beforeAll(async () => {
    const testUrl = process.env.TEST_DATABASE_URL;
    if (!testUrl) throw new Error('TEST_DATABASE_URL is required');
    const parsed = new URL(testUrl);
    if (
      parsed.hostname !== expectedTarget.hostname ||
      decodeURIComponent(parsed.pathname.slice(1)) !==
        expectedTarget.database ||
      decodeURIComponent(parsed.username) !== expectedTarget.role
    )
      throw new Error(
        'TEST_DATABASE_URL URL target failed the Phase 6 Neon safety guard'
      );
    sql = neon(testUrl);
    const [identity] = await sql`
      select current_database() as database_name, current_user as database_role,
             current_setting(${'neon.project_id'}, true) as project_id,
             current_setting(${'neon.endpoint_id'}, true) as endpoint_id
    `;
    if (
      identity.database_name !== expectedTarget.database ||
      identity.database_role !== expectedTarget.role ||
      identity.project_id !== expectedTarget.projectId ||
      identity.endpoint_id !== expectedTarget.endpointId
    )
      throw new Error(
        'TEST_DATABASE_URL Neon identity failed the Phase 6 safety guard'
      );
    const migrations =
      await sql`select created_at::text as created_at from drizzle.__drizzle_migrations order by created_at`;
    if (
      migrations.length !== 9 ||
      migrations.at(-1)?.created_at !== '1795030000000'
    )
      throw new Error(
        'Phase 6 migration 0008 must be applied to the designated Neon test database before running this integration test'
      );
    const [user] = await sql`
      insert into public.users (name, email, password, role)
      values (${marker}, ${`${marker}@integration.test`}, 'integration-only-hash', 'buyer')
      returning id
    `;
    userId = user.id;
    const [seller] = await sql`
      insert into public.users (name, email, password, role)
      values (${`${marker}-seller`}, ${`${marker}-seller@integration.test`}, 'integration-only-hash', 'seller')
      returning id
    `;
    sellerId = seller.id;
    const [listing] = await sql`
      insert into public.business_listings (seller_id, title, description, currency, status, asking_price)
      values (${sellerId}, ${marker}, 'Phase 6 outbox integration fixture description', 'EUR', 'pending', '100.00')
      returning id
    `;
    listingId = listing.id;
    await sql`insert into public.favorites (user_id, listing_id) values (${userId}, ${listingId})`;
    outboxModule = await import('../../src/services/outbox.service.js');
  }, 30000);

  afterAll(async () => {
    if (!sql) return;
    if (listingId)
      await sql`delete from public.business_listings where id = ${listingId}`;
    if (userId) await sql`delete from public.users where id = ${userId}`;
    if (listingId)
      await sql`delete from public.outbox_events where payload->>'listingId' = ${String(listingId)}`;
    if (sellerId) await sql`delete from public.users where id = ${sellerId}`;
  }, 30000);

  it('atomically enqueues a favorite-recipient snapshot and safely claims the event', async () => {
    await sql`update public.business_listings set status = 'published', published_at = now(), updated_at = now() where id = ${listingId}`;
    const [event] = await sql`
      select id, event_key, type, payload from public.outbox_events
      where payload->>'listingId' = ${String(listingId)} and type = 'listing.approved'
    `;
    expect(event).toBeTruthy();
    expect(event.payload.userIds).toContain(userId);
    const claimed = await outboxModule.claimOutboxBatch(1, {
      eventId: Number(event.id),
    });
    expect(claimed.some(row => Number(row.id) === Number(event.id))).toBe(true);
  });
});
