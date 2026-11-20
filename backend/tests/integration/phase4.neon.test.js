import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { neon } from '@neondatabase/serverless';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'phase4-neon-integration-secret-32-chars-minimum';
process.env.ARCJET_KEY = 'phase4-neon-integration-key';

vi.mock('../../src/config/arcjet.js', () => ({
  default: {
    withRule: () => ({
      protect: async () => ({ isDenied: () => false }),
    }),
  },
}));
vi.mock('../../src/config/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const expectedTarget = {
  hostname: 'ep-super-king-b9pem88j-pooler.c-7.eu-central-1.aws.neon.tech',
  projectId: 'icy-cloud-01728765',
  endpointId: 'ep-super-king-b9pem88j',
  database: 'neondb',
  role: 'neondb_owner',
};
const expectedMigrations = [
  ['1', '1793816872035'],
  ['2', '1794749410776'],
  ['3', '1794763955729'],
  ['4', '1794832534232'],
  ['5', '1794832660145'],
  ['6', '1794838631851'],
];
const requiredIndexes = [
  'business_listings_id_seller_id_uidx',
  'conversations_listing_buyer_uidx',
  'conversations_buyer_created_idx',
  'conversations_seller_created_idx',
  'messages_conversation_created_id_idx',
  'messages_conversation_unread_sender_idx',
];
const runId = randomUUID();
const marker = `PHASE4-${runId}`;
const password = `Phase4-${runId}-Integration-Password!`;
const testEmails = ['buyer', 'seller', 'outsider'].map(
  role => `phase4-${runId}-${role}@integration.test`
);
const createdListingIds = [];
const createdConversationIds = [];
const createdMessageIds = [];
let sql;
let app;
let buyer;
let seller;
let outsider;

const credentials = response => {
  const cookie = (response.headers['set-cookie'] ?? [])
    .map(value => value.split(';')[0])
    .join('; ');
  if (!cookie || !response.body.csrfToken)
    throw new Error(`Signup failed with HTTP ${response.status}`);
  return { cookie, csrf: response.body.csrfToken, id: response.body.user.id };
};
const signed = (builder, user) =>
  builder.set('Cookie', user.cookie).set('X-CSRF-Token', user.csrf);
const signUp = async (email, role) => {
  const response = await request(app)
    .post('/api/auth/sign-up')
    .send({ name: `Phase 4 ${role}`, email, password, role });
  expect(response.status).toBe(201);
  return credentials(response);
};
const createListing = async (sellerUser, status, suffix) => {
  const [row] = await sql`
    insert into public.business_listings
      (seller_id, title, description, currency, status, published_at)
    values
      (${sellerUser.id}, ${`${marker} ${suffix}`}, ${`Integration fixture ${marker}`},
       'EUR', ${status}, ${status === 'published' ? new Date() : null})
    returning id
  `;
  createdListingIds.push(row.id);
  return row.id;
};
const startConversation = async (buyerUser, listingId) => {
  const response = await signed(
    request(app).post('/api/conversations'),
    buyerUser
  ).send({ listingId });
  if (response.status === 201 || response.status === 200)
    createdConversationIds.push(response.body.conversation.id);
  return response;
};
const sendMessage = async (user, conversationId, content) => {
  const response = await signed(
    request(app).post(`/api/conversations/${conversationId}/messages`),
    user
  ).send({ content });
  if (response.status === 201) createdMessageIds.push(response.body.message.id);
  return response;
};

const cleanup = async () => {
  if (!sql) return;
  for (const email of testEmails) {
    await sql`delete from public.users where email = ${email}`;
  }
  const [usersRemaining] = await sql`
    select count(*)::int as count from public.users where email = any(${testEmails})
  `;
  const [listingsRemaining] = await sql`
    select count(*)::int as count from public.business_listings
    where id = any(${createdListingIds})
  `;
  const [conversationsRemaining] = await sql`
    select count(*)::int as count from public.conversations
    where id = any(${createdConversationIds})
  `;
  const [messagesRemaining] = await sql`
    select count(*)::int as count from public.messages
    where id = any(${createdMessageIds})
  `;
  if (
    usersRemaining.count ||
    listingsRemaining.count ||
    conversationsRemaining.count ||
    messagesRemaining.count
  ) {
    throw new Error('Phase 4 Neon test cleanup verification failed');
  }
};

describe('Phase 4 Neon conversations and messaging', () => {
  beforeAll(async () => {
    const testUrl = process.env.TEST_DATABASE_URL;
    if (!testUrl) throw new Error('TEST_DATABASE_URL is required');
    const parsed = new URL(testUrl);
    if (
      parsed.hostname !== expectedTarget.hostname ||
      decodeURIComponent(parsed.pathname.slice(1)) !==
        expectedTarget.database ||
      decodeURIComponent(parsed.username) !== expectedTarget.role
    ) {
      throw new Error(
        'TEST_DATABASE_URL URL target failed the Neon safety guard'
      );
    }
    sql = neon(testUrl);
    const [identity] = await sql`
      select current_database() as database_name,
             current_user as database_role,
             current_setting(${'neon.project_id'}, true) as project_id,
             current_setting(${'neon.endpoint_id'}, true) as endpoint_id
    `;
    if (
      identity.database_name !== expectedTarget.database ||
      identity.database_role !== expectedTarget.role ||
      identity.project_id !== expectedTarget.projectId ||
      identity.endpoint_id !== expectedTarget.endpointId
    ) {
      throw new Error(
        'TEST_DATABASE_URL Neon identity failed the safety guard'
      );
    }
    const migrations = await sql`
      select id::text as id, created_at::text as created_at
      from drizzle.__drizzle_migrations order by created_at
    `;
    if (
      JSON.stringify(
        migrations.map(({ id, created_at }) => [id, created_at])
      ) !== JSON.stringify(expectedMigrations)
    ) {
      throw new Error(
        'Phase 4 migration is not applied to the Neon test database'
      );
    }
    const indexes = await sql`
      select indexname from pg_indexes
      where schemaname = ${'public'}
    `;
    const indexNames = new Set(indexes.map(({ indexname }) => indexname));
    if (!requiredIndexes.every(index => indexNames.has(index)))
      throw new Error('Phase 4 database indexes are missing');

    const imported = await import('../../src/app.js');
    app = imported.default;
    buyer = await signUp(testEmails[0], 'buyer');
    seller = await signUp(testEmails[1], 'seller');
    outsider = await signUp(testEmails[2], 'buyer');
    await createListing(seller, 'published', 'Published One');
    await createListing(seller, 'published', 'Published Two');
    await createListing(seller, 'draft', 'Draft Listing');
  }, 60000);

  afterAll(async () => {
    await cleanup();
  }, 60000);

  it('enforces PostgreSQL constraints and safely deduplicates concurrent conversations', async () => {
    const [firstListingId, secondListingId] = createdListingIds;
    const created = await startConversation(buyer, firstListingId);
    expect(created.status).toBe(201);
    const duplicate = await startConversation(buyer, firstListingId);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.conversation.id).toBe(created.body.conversation.id);

    const concurrent = await Promise.all([
      startConversation(buyer, secondListingId),
      startConversation(buyer, secondListingId),
    ]);
    expect(concurrent.map(response => response.status).sort()).toEqual([
      200, 201,
    ]);
    expect(concurrent[0].body.conversation.id).toBe(
      concurrent[1].body.conversation.id
    );
    const [duplicates] = await sql`
      select count(*)::int as count from public.conversations
      where listing_id = ${secondListingId} and buyer_id = ${buyer.id}
    `;
    expect(duplicates.count).toBe(1);

    await expect(sql`
      insert into public.conversations (listing_id, buyer_id, seller_id)
      values (${firstListingId}, ${buyer.id}, ${seller.id})
    `).rejects.toThrow();
    await expect(sql`
      insert into public.conversations (listing_id, buyer_id, seller_id)
      values (${secondListingId}, ${seller.id}, ${seller.id})
    `).rejects.toThrow();
    await expect(sql`
      insert into public.conversations (listing_id, buyer_id, seller_id)
      values (${firstListingId}, ${outsider.id}, ${buyer.id})
    `).rejects.toThrow();
    await expect(sql`
      insert into public.conversations (listing_id, buyer_id, seller_id)
      values (${secondListingId}, ${2147483647}, ${seller.id})
    `).rejects.toThrow();
    const [indexes] = await sql`
      select count(*)::int as count from pg_indexes
      where schemaname = ${'public'} and indexname = any(${requiredIndexes})
    `;
    expect(indexes.count).toBe(requiredIndexes.length);
  }, 60000);

  it('persists chronological cursor pages, recipient read receipts, participant privacy, and cascades', async () => {
    const [firstListingId] = createdListingIds;
    const started = await startConversation(buyer, firstListingId);
    const conversationId = started.body.conversation.id;
    const first = await sendMessage(
      buyer,
      conversationId,
      'Buyer asks about the business'
    );
    const second = await sendMessage(seller, conversationId, 'Seller replies');
    const third = await sendMessage(
      seller,
      conversationId,
      'Seller sends another detail'
    );
    expect([first.status, second.status, third.status]).toEqual([
      201, 201, 201,
    ]);

    const firstPage = await request(app)
      .get(`/api/conversations/${conversationId}/messages?limit=2`)
      .set('Cookie', buyer.cookie);
    expect(firstPage.body.messages.map(message => message.content)).toEqual([
      'Buyer asks about the business',
      'Seller replies',
    ]);
    expect(firstPage.body.pagination.hasMore).toBe(true);
    const secondPage = await request(app)
      .get(
        `/api/conversations/${conversationId}/messages?limit=2&cursor=${encodeURIComponent(firstPage.body.pagination.nextCursor)}`
      )
      .set('Cookie', buyer.cookie);
    expect(secondPage.body.messages.map(message => message.content)).toEqual([
      'Seller sends another detail',
    ]);
    expect(secondPage.body.pagination.hasMore).toBe(false);

    const read = await signed(
      request(app).patch(`/api/conversations/${conversationId}/read`),
      buyer
    ).send({});
    expect(read.status).toBe(200);
    expect(read.body.readCount).toBe(2);
    const stored = await sql`
      select sender_id, read_at from public.messages
      where conversation_id = ${conversationId} order by created_at, id
    `;
    expect(stored[0].read_at).toBeNull();
    expect(stored[1].read_at).toBeTruthy();
    expect(stored[2].read_at).toBeTruthy();

    expect(
      (
        await request(app)
          .get(`/api/conversations/${conversationId}/messages`)
          .set('Cookie', outsider.cookie)
      ).status
    ).toBe(404);
    expect(
      (await sendMessage(outsider, conversationId, 'Not allowed')).status
    ).toBe(404);

    await sql`
      update public.business_listings set status = 'archived'
      where id = ${firstListingId} and seller_id = ${seller.id}
    `;
    expect(
      (
        await request(app)
          .get(`/api/conversations/${conversationId}/messages`)
          .set('Cookie', buyer.cookie)
      ).status
    ).toBe(200);

    await expect(sql`
      insert into public.messages (conversation_id, sender_id, content)
      values (${conversationId}, ${buyer.id}, ${''})
    `).rejects.toThrow();
    await expect(sql`
      insert into public.messages (conversation_id, sender_id, content)
      values (${2147483647}, ${buyer.id}, ${'Broken foreign key'})
    `).rejects.toThrow();
  }, 60000);
});
