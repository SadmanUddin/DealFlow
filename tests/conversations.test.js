import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.TEST_DATABASE_URL = 'postgresql://localhost:5432/dealflow_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-32-chars';
process.env.ARCJET_KEY = 'test-only-arcjet-key';

vi.mock('../src/config/database.js', async () => ({
  db: (await import('./helpers/mock-database.js')).db,
}));
vi.mock(
  '../src/models/user.model.js',
  async () => (await import('./helpers/mock-database.js')).modelTables
);
vi.mock('../src/models/listing.model.js', async () => ({
  businessListings: (await import('./helpers/mock-database.js')).modelTables
    .businessListings,
}));
vi.mock('../src/models/conversation.model.js', async () => {
  const { modelTables } = await import('./helpers/mock-database.js');
  return {
    conversations: modelTables.conversations,
    messages: modelTables.messages,
    conversationDocuments: modelTables.conversationDocuments,
  };
});
vi.mock('../src/config/arcjet.js', () => ({
  default: {
    withRule: () => ({ protect: async () => ({ isDenied: () => false }) }),
  },
}));
vi.mock('../src/config/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock(
  'drizzle-orm',
  async () => (await import('./helpers/mock-database.js')).drizzleOperators
);

const [{ default: app }, mock] = await Promise.all([
  import('../src/app.js'),
  import('./helpers/mock-database.js'),
]);

const password = 'A-strong-test-password-42';
const listingInput = {
  title: 'Established manufacturing business',
  description: 'A profitable operation with a long operating history.',
  industry: 'Manufacturing',
  location: 'Brussels, Belgium',
  asking_price: '1250000.00',
  annual_revenue: '800000.00',
  ebitda: '180000.00',
  currency: 'EUR',
};
const signUp = async (role, email) =>
  request(app)
    .post('/api/auth/sign-up')
    .send({ name: `Test ${role}`, email, password, role });
const credentialsFor = response => ({
  cookie: (response.headers['set-cookie'] ?? [])
    .map(value => value.split(';')[0])
    .join('; '),
  csrf: response.body.csrfToken,
});
const signed = (builder, credentials) =>
  builder
    .set('Cookie', credentials.cookie)
    .set('X-CSRF-Token', credentials.csrf);

let buyer;
let seller;
let outsider;
let listingId;

beforeEach(async () => {
  mock.resetDatabase();
  buyer = credentialsFor(await signUp('buyer', 'buyer@conversation.test'));
  seller = credentialsFor(await signUp('seller', 'seller@conversation.test'));
  outsider = credentialsFor(
    await signUp('buyer', 'outsider@conversation.test')
  );
  const listing = await signed(request(app).post('/api/listings'), seller).send(
    listingInput
  );
  listingId = listing.body.listing.id;
  const listingRow = mock.databaseState.business_listings[0];
  listingRow.status = 'published';
  listingRow.published_at = new Date();
});

const startConversation = credentials =>
  signed(request(app).post('/api/conversations'), credentials).send({
    listingId,
  });
const createConversation = async () => {
  const response = await startConversation(buyer);
  expect(response.status).toBe(201);
  return response.body.conversation.id;
};
const sendMessage = (conversationId, credentials, content) =>
  signed(
    request(app).post(`/api/conversations/${conversationId}/messages`),
    credentials
  ).send({ content });

describe('conversation creation and listing', () => {
  it('allows a buyer to initiate and returns the existing conversation on duplicates', async () => {
    const created = await startConversation(buyer);
    const duplicate = await startConversation(buyer);
    expect(created.status).toBe(201);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.conversation.id).toBe(created.body.conversation.id);
    expect(mock.databaseState.conversations).toHaveLength(1);
    expect(mock.databaseState.conversations[0]).toMatchObject({
      buyer_id: 1,
      seller_id: 2,
      listing_id: listingId,
    });
    expect(created.body.conversation).not.toHaveProperty('buyerId');
    expect(created.body.conversation).not.toHaveProperty('sellerId');
  });

  it('rejects seller initiation, unpublished listings, invalid bodies, and unauthenticated access', async () => {
    expect((await startConversation(seller)).status).toBe(403);
    const unpublished = await startConversation(buyer);
    expect(unpublished.status).toBe(201);
    mock.databaseState.business_listings[0].status = 'archived';
    const otherListing = await signed(
      request(app).post('/api/listings'),
      seller
    ).send({ ...listingInput, title: 'Another business listing' });
    const hiddenRow = mock.databaseState.business_listings.find(
      row => row.id === otherListing.body.listing.id
    );
    hiddenRow.status = 'draft';
    expect(
      (
        await signed(request(app).post('/api/conversations'), buyer).send({
          listingId: hiddenRow.id,
        })
      ).status
    ).toBe(404);
    expect(
      (await request(app).post('/api/conversations').send({ listingId })).status
    ).toBe(401);
    expect(
      (
        await signed(request(app).post('/api/conversations'), buyer).send({
          listingId,
          buyer_id: 99,
        })
      ).status
    ).toBe(400);
  });

  it('lists only participant conversations with standard pagination metadata', async () => {
    const conversationId = await createConversation();
    const buyerList = await request(app)
      .get('/api/conversations?page=1&limit=1')
      .set('Cookie', buyer.cookie);
    const sellerList = await request(app)
      .get('/api/conversations')
      .set('Cookie', seller.cookie);
    const outsiderList = await request(app)
      .get('/api/conversations')
      .set('Cookie', outsider.cookie);
    expect(buyerList.body.conversations.map(row => row.id)).toEqual([
      conversationId,
    ]);
    expect(buyerList.body.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 1,
      totalPages: 1,
    });
    expect(sellerList.body.conversations).toHaveLength(1);
    expect(outsiderList.body.conversations).toHaveLength(0);
    expect(
      (
        await request(app)
          .get('/api/conversations?limit=101')
          .set('Cookie', buyer.cookie)
      ).status
    ).toBe(400);
  });
});

describe('conversation messages and read status', () => {
  it('returns chronological cursor pages ordered by created_at and id', async () => {
    const conversationId = await createConversation();
    await sendMessage(conversationId, buyer, 'Buyer message one');
    await sendMessage(conversationId, seller, 'Seller message two');
    await sendMessage(conversationId, buyer, 'Buyer message three');
    await sendMessage(conversationId, seller, 'Seller message four');

    const firstPage = await request(app)
      .get(`/api/conversations/${conversationId}/messages?limit=2`)
      .set('Cookie', buyer.cookie);
    expect(firstPage.status, JSON.stringify(firstPage.body)).toBe(200);
    expect(firstPage.body.messages.map(row => row.content)).toEqual([
      'Buyer message one',
      'Seller message two',
    ]);
    expect(firstPage.body.pagination.hasMore).toBe(true);
    expect(firstPage.body.pagination.nextCursor).toBeTruthy();
    expect(firstPage.body.messages[0]).toHaveProperty('senderId');
    expect(firstPage.body.messages[0]).toHaveProperty('createdAt');
    expect(firstPage.body.messages[0].readAt).toBeNull();

    const cursor = encodeURIComponent(firstPage.body.pagination.nextCursor);
    const secondPage = await request(app)
      .get(
        `/api/conversations/${conversationId}/messages?limit=2&cursor=${cursor}`
      )
      .set('Cookie', buyer.cookie);
    expect(secondPage.body.messages.map(row => row.content)).toEqual([
      'Buyer message three',
      'Seller message four',
    ]);
    expect(secondPage.body.pagination).toEqual({
      limit: 2,
      hasMore: false,
      nextCursor: null,
    });
    expect(
      (
        await request(app)
          .get(
            `/api/conversations/${conversationId}/messages?cursor=not-a-json`
          )
          .set('Cookie', buyer.cookie)
      ).status
    ).toBe(400);
  });

  it('denies nonparticipants and applies per-message read timestamps to inbound messages only', async () => {
    const conversationId = await createConversation();
    await sendMessage(conversationId, buyer, 'Buyer message');
    await sendMessage(conversationId, seller, 'Seller message one');
    await sendMessage(conversationId, seller, 'Seller message two');

    expect(
      (
        await request(app)
          .get(`/api/conversations/${conversationId}/messages`)
          .set('Cookie', outsider.cookie)
      ).status
    ).toBe(404);
    expect(
      (await sendMessage(conversationId, outsider, 'Intrusion')).status
    ).toBe(404);
    expect(
      (
        await signed(
          request(app).patch(`/api/conversations/${conversationId}/read`),
          outsider
        ).send({})
      ).status
    ).toBe(404);

    const read = await signed(
      request(app).patch(`/api/conversations/${conversationId}/read`),
      buyer
    ).send({});
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    expect(read.body.readCount).toBe(2);
    const rows = mock.databaseState.messages;
    expect(rows[0].read_at).toBeNull();
    expect(rows[1].read_at).toBeInstanceOf(Date);
    expect(rows[2].read_at).toBeInstanceOf(Date);
    const repeated = await signed(
      request(app).patch(`/api/conversations/${conversationId}/read`),
      buyer
    ).send({});
    expect(repeated.body.readCount).toBe(0);
  });

  it('requires CSRF for writes and rejects empty or forged message fields', async () => {
    const conversationId = await createConversation();
    expect(
      (
        await request(app)
          .post(`/api/conversations/${conversationId}/messages`)
          .set('Cookie', buyer.cookie)
          .send({ content: 'No CSRF token' })
      ).status
    ).toBe(403);
    expect((await sendMessage(conversationId, buyer, '   ')).status).toBe(400);
    expect(
      (
        await signed(
          request(app).post(`/api/conversations/${conversationId}/messages`),
          buyer
        ).send({ content: 'Forged', sender_id: 99 })
      ).status
    ).toBe(400);
    const accepted = await sendMessage(
      conversationId,
      buyer,
      ' Valid content '
    );
    expect(accepted.status).toBe(201);
    expect(accepted.body.message.content).toBe('Valid content');
    expect(accepted.body.message.senderId).toBe(1);
  });

  it('keeps existing conversations accessible after listing archival', async () => {
    const conversationId = await createConversation();
    mock.databaseState.business_listings[0].status = 'archived';
    const message = await sendMessage(
      conversationId,
      seller,
      'Still available'
    );
    const history = await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set('Cookie', buyer.cookie);
    expect(message.status).toBe(201);
    expect(history.status, JSON.stringify(history.body)).toBe(200);
    expect(history.body.messages.map(row => row.content)).toEqual([
      'Still available',
    ]);
  });
});
