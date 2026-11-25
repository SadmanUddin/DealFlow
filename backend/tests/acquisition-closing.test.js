import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { drizzle } from 'drizzle-orm/pglite';
import request from 'supertest';
import { Secret, TOTP } from 'otpauth';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let engine;
let database;
vi.mock('#config/database.js', () => ({
  get db() {
    return database;
  },
}));

vi.mock('#config/arcjet.js', () => {
  const protector = {
    withRule: () => protector,
    protect: async () => ({ conclusion: 'ALLOW', isDenied: () => false }),
  };
  return { default: protector };
});
const { default: app } = await import('../src/app.js');
const { createSession, authenticateUser, hashPassword } =
  await import('#services/auth.service.js');

const {
  createDeal,
  createOffer,
  respondToOffer,
  getDeal,
  listDeals,
  listDealActivities,
  listDealDocuments,
  updateAcquisitionClosing,
  updateDealStatus,
} = await import('#services/deal.service.js');
const { startConversation, getDealConversation } =
  await import('#services/conversation.service.js');
const { getPublicListings, getPublishedListing, getMyListings } =
  await import('#services/listing.service.js');
const { closingActionSchema, dealStatusSchema } =
  await import('#validations/deal.validation.js');

const buyer = 1;
const seller = 2;
const otherBuyer = 3;
const browse = { page: 1, limit: 20 };

beforeAll(async () => {
  engine = new PGlite({ extensions: { pg_trgm } });
  database = drizzle(engine);
  const root = new URL('../drizzle/', import.meta.url);
  const journal = JSON.parse(
    readFileSync(new URL('meta/_journal.json', root), 'utf8')
  );
  for (const { tag } of journal.entries) {
    await engine.exec(readFileSync(new URL(tag + '.sql', root), 'utf8'));
  }
  await engine.exec(`
    INSERT INTO users (id, name, email, password, role, email_verified) VALUES
      (1, 'Buyer', 'buyer@example.test', 'fixture', 'buyer', true),
      (2, 'Seller', 'seller@example.test', 'fixture', 'seller', true),
      (3, 'Other Buyer', 'other@example.test', 'fixture', 'buyer', true),
      (4, 'New Buyer', 'new@example.test', 'fixture', 'buyer', true),
      (5, 'Admin', 'admin@example.test', 'fixture', 'admin', true);
  `);
}, 30000);

afterAll(async () => {
  await engine?.close();
});

async function listing(status = 'published', title = 'Test business') {
  const { rows } = await engine.query(
    `
    INSERT INTO business_listings (seller_id, title, description, status, asking_price, currency, published_at)
    VALUES (2, $1, 'Isolated closing fixture', $2, 125000, 'EUR', now()) RETURNING id
  `,
    [title, status]
  );
  return rows[0].id;
}

async function accepted(listingId, buyerId = buyer) {
  const deal = (await createDeal(buyerId, listingId)).deal;
  const offer = await createOffer(deal.id, buyerId, {
    amount: '110000',
    currency: 'EUR',
  });
  const counter = await createOffer(deal.id, seller, {
    amount: '115000',
    currency: 'EUR',
    parentOfferId: offer.id,
  });
  await respondToOffer(deal.id, counter.id, buyerId, 'accept');
  return deal.id;
}

const act = (id, userId, action, revision, extra = {}) =>
  updateAcquisitionClosing(
    id,
    userId,
    closingActionSchema.parse({ action, revision, ...extra })
  );
const confirm = (id, userId, revision, publicPriceConsent) =>
  act(id, userId, 'confirm', revision, { publicPriceConsent });

describe('acquisition closing on the migrated PostgreSQL schema', () => {
  it('requires agreement and both confirmations, pauses on dispute, and preserves private history', async () => {
    const listingId = await listing('published', 'Private closing fixture');
    const dealId = await accepted(listingId);
    const competingDeal = (await createDeal(otherBuyer, listingId)).deal;
    const competingOffer = await createOffer(competingDeal.id, otherBuyer, {
      amount: '17000',
      currency: 'EUR',
    });
    const { conversation } = await startConversation(buyer, listingId);
    await startConversation(otherBuyer, listingId);
    await engine.query(
      `
      WITH document AS (
        INSERT INTO conversation_documents(conversation_id, uploaded_by, storage_key, original_filename, mime_type, size_bytes, sha256, status)
        VALUES ($1, 2, 'test/private', 'contract.pdf', 'application/pdf', 100, repeat('a', 64), 'available') RETURNING id
      )
      INSERT INTO deal_documents(deal_id, conversation_document_id, linked_by)
      SELECT $2, id, 2 FROM document
    `,
      [conversation.id, dealId]
    );

    expect((await getDeal(dealId, buyer)).status).toBe('accepted');
    expect((await getPublishedListing(listingId)).status).toBe('published');
    expect(dealStatusSchema.safeParse({ status: 'completed' }).success).toBe(
      false
    );
    await expect(
      updateDealStatus(dealId, buyer, 'buyer', 'completed')
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      engine.query('UPDATE deals SET status = \'completed\' WHERE id = $1', [
        dealId,
      ])
    ).rejects.toMatchObject({ code: '23514' });
    await expect(confirm(dealId, otherBuyer, 0, true)).rejects.toMatchObject({
      status: 404,
    });

    await act(dealId, buyer, 'propose', 0, { amount: '113200.37' });
    await expect(act(dealId, buyer, 'agree', 1)).rejects.toMatchObject({
      status: 409,
    });
    await expect(confirm(dealId, seller, 1, false)).rejects.toMatchObject({
      status: 409,
    });
    await act(dealId, seller, 'propose', 1, { amount: '114300.25' });
    await expect(act(dealId, buyer, 'agree', 1)).rejects.toMatchObject({
      status: 409,
    });
    await act(dealId, buyer, 'agree', 2);
    await expect(
      act(dealId, buyer, 'propose', 2, { amount: '100000' })
    ).rejects.toMatchObject({ status: 409 });

    const first = await confirm(dealId, buyer, 2, true);
    expect(first).toMatchObject({
      status: 'accepted',
      seller_confirmed_at: null,
    });
    expect(first.buyer_confirmed_at).toBeTruthy();
    expect((await getPublishedListing(listingId)).status).toBe('published');
    const repeat = await confirm(dealId, buyer, 2, false);
    expect(repeat.buyer_price_consent).toBe(true);
    const beforeDispute = await listDealActivities(
      dealId,
      buyer,
      false,
      browse
    );
    expect(
      beforeDispute.activities.filter(
        event => event.event_type === 'deal.closing_confirmed'
      )
    ).toHaveLength(1);
    await act(dealId, seller, 'dispute', 2);
    await expect(confirm(dealId, seller, 3, false)).rejects.toMatchObject({
      status: 409,
    });
    await expect(act(dealId, buyer, 'resolve', 3)).rejects.toMatchObject({
      status: 409,
    });
    await act(dealId, seller, 'resolve', 3);
    expect((await getDeal(dealId, buyer)).buyer_confirmed_at).toBeNull();

    await act(dealId, seller, 'propose', 4, { amount: '114300.25' });
    await act(dealId, buyer, 'agree', 5);
    const [sellerResult, buyerResult] = await Promise.all([
      confirm(dealId, seller, 5, false),
      confirm(dealId, buyer, 5, true),
    ]);
    expect(sellerResult.seller_confirmed_at).toBeTruthy();
    expect(buyerResult.buyer_confirmed_at).toBeTruthy();
    await confirm(dealId, buyer, 5, true);
    const afterCompletion = await listDealActivities(
      dealId,
      buyer,
      false,
      browse
    );
    expect(
      afterCompletion.activities.filter(
        event =>
          event.event_type === 'deal.status_changed' &&
          event.metadata.to === 'completed'
      )
    ).toHaveLength(1);
    expect(await getDeal(dealId, seller)).toMatchObject({
      status: 'completed',
      closing_amount: '114300.25',
    });
    expect(
      (await listDeals(buyer, { ...browse, view: 'completed' })).deals.map(
        deal => deal.id
      )
    ).toContain(dealId);
    expect((await getMyListings(seller, browse)).soldCount).toBeGreaterThan(0);
    const sold = await getPublishedListing(listingId);
    expect(sold).toMatchObject({
      status: 'sold',
      askingPrice: '125000.00',
      publicSalePrice: null,
      publicSaleCurrency: null,
    });
    expect(sold.soldAt).toBeTruthy();
    expect(JSON.stringify(sold)).not.toContain('114300');
    expect((await getDeal(competingDeal.id, otherBuyer)).status).toBe(
      'cancelled'
    );
    await expect(
      createOffer(competingDeal.id, otherBuyer, {
        amount: '100000',
        currency: 'EUR',
      })
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      respondToOffer(competingDeal.id, competingOffer.id, seller, 'accept')
    ).rejects.toMatchObject({ status: 409 });
    await expect(startConversation(4, listingId)).rejects.toMatchObject({
      status: 404,
    });
    await expect(createDeal(4, listingId)).rejects.toMatchObject({
      status: 404,
    });
    expect((await getDealConversation(dealId, seller)).id).toBe(
      conversation.id
    );
    expect(
      (await listDealDocuments(dealId, buyer, browse)).documents[0].filename
    ).toBe('contract.pdf');
    await expect(
      listDealDocuments(dealId, otherBuyer, browse)
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      engine.query(
        'UPDATE business_listings SET status = \'published\' WHERE id = $1',
        [listingId]
      )
    ).rejects.toMatchObject({ code: '23514' });

    const { rows: notifications } = await engine.query(
      'SELECT user_id, type, payload FROM notifications'
    );
    expect(
      notifications.filter(
        n => n.type === 'deal.completed' && n.payload.dealId === dealId
      )
    ).toHaveLength(2);
    expect(
      notifications.filter(
        n => n.type === 'deal.closing_disputed' && n.payload.dealId === dealId
      )
    ).toHaveLength(1);
    expect(
      notifications.filter(
        n =>
          n.type === 'listing.sold' &&
          n.user_id === otherBuyer &&
          n.payload.listingId === listingId
      )
    ).toHaveLength(1);
  }, 15000);

  it('allows only one closing on a listing, publishes the mutually authorized price, and filters before pagination', async () => {
    const listingId = await listing('published', 'Marketplace filter fixture');
    const liveId = await listing(
      'published',
      'Marketplace filter fixture available'
    );
    await listing('draft', 'Marketplace filter fixture draft');
    await listing('archived', 'Marketplace filter fixture archived');
    const firstId = await accepted(listingId);
    const secondId = await accepted(listingId, otherBuyer);

    for (const [id, actor] of [
      [firstId, buyer],
      [secondId, otherBuyer],
    ]) {
      await act(id, actor, 'propose', 0, { amount: '112222.45' });
      await act(id, seller, 'agree', 1);
      await confirm(id, actor, 1, true);
    }
    const results = await Promise.allSettled([
      confirm(firstId, seller, 1, true),
      confirm(secondId, seller, 1, true),
    ]);
    expect(results.map(result => result.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    const sold = await getPublishedListing(listingId);
    expect(sold).toMatchObject({
      publicSalePrice: '112222.45',
      publicSaleCurrency: 'EUR',
    });

    const search = {
      ...browse,
      q: 'Marketplace filter fixture',
      limit: 1,
      minPrice: '120000',
    };
    const soldPage = await getPublicListings({
      ...search,
      availability: 'sold',
    });
    expect(soldPage.pagination.total).toBe(1);
    expect(soldPage.listings.map(row => row.id)).toEqual([listingId]);
    const availablePage = await getPublicListings(search);
    expect(availablePage.pagination.total).toBe(1);
    expect(availablePage.listings.map(row => row.id)).toEqual([liveId]);
    const allPage = await getPublicListings({
      ...search,
      availability: 'all',
      page: 2,
    });
    expect(allPage.pagination.total).toBe(2);
    expect(allPage.listings).toHaveLength(1);
  }, 15000);
});

it('enforces session, CSRF, participant and admin boundaries through the API', async () => {
  const listingId = await listing();
  const dealId = await accepted(listingId);
  const { conversation } = await startConversation(buyer, listingId);
  const password = 'Fixture-Only-Password';
  const hashed = await hashPassword(password);
  await engine.query('UPDATE users SET password = $1 WHERE id IN (1, 3)', [
    hashed,
  ]);
  const owner = await createSession(
    await authenticateUser({ email: 'buyer@example.test', password })
  );
  const outsider = await createSession(
    await authenticateUser({ email: 'other@example.test', password })
  );
  const ownerCookie = `token=${owner.accessToken}`;
  const outsiderCookie = `token=${outsider.accessToken}`;
  const dealUrl = `/api/deals/${dealId}`;
  const proposal = { action: 'propose', revision: 0, amount: '115000' };
  expect((await request(app).get(dealUrl)).status).toBe(401);
  expect(
    (
      await request(app)
        .post(`${dealUrl}/closing`)
        .set('Cookie', ownerCookie)
        .send(proposal)
    ).status
  ).toBe(403);
  expect(
    (
      await request(app)
        .post(`${dealUrl}/closing`)
        .set('Cookie', outsiderCookie)
        .set('X-CSRF-Token', outsider.csrfToken)
        .send(proposal)
    ).status
  ).toBe(404);
  for (const url of [
    dealUrl,
    `${dealUrl}/offers`,
    `${dealUrl}/documents/1/download`,
    `/api/conversations/${conversation.id}/messages`,
  ]) {
    expect(
      (await request(app).get(url).set('Cookie', outsiderCookie)).status
    ).toBe(404);
  }
  expect(
    (await request(app).get('/api/admin/users').set('Cookie', outsiderCookie))
      .status
  ).toBe(403);
  const result = await request(app)
    .post(`${dealUrl}/closing`)
    .set('Cookie', ownerCookie)
    .set('X-CSRF-Token', owner.csrfToken)
    .send(proposal);
  expect(result.status).toBe(200);
  expect(result.body.deal).toMatchObject({
    status: 'accepted',
    closing_amount: '115000.00',
  });
});

it('mounts administrator MFA status and distinguishes anonymous and authorized sessions', async () => {
  vi.stubEnv('ADMIN_MFA_ENCRYPTION_KEY', undefined);
  vi.stubEnv('ADMIN_MFA_REQUIRED', 'false');
  try {
    for (const route of ['/api/auth/admin-mfa', '/api/auth/me']) {
      const response = await request(app).get(route);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    }

    const password = 'Mfa-Fixture-Password-Only';
    await engine.query('UPDATE users SET password = $1 WHERE id = 5', [
      await hashPassword(password),
    ]);
    const signIn = await request(app)
      .post('/api/auth/sign-in')
      .send({ email: 'admin@example.test', password });
    expect(signIn.status).toBe(200);
    const cookie = signIn.headers['set-cookie'][0].split(';')[0];
    const status = await request(app)
      .get('/api/auth/admin-mfa')
      .set('Cookie', cookie);
    expect(status.status).toBe(200);
    expect(status.body).toEqual({
      enrolled: false,
      required: false,
      configured: false,
    });
    expect(status.headers['cache-control']).toContain('no-store');
    const session = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(session.status).toBe(200);
    expect(session.body.user.role).toBe('admin');

    const logout = await request(app)
      .post('/api/auth/sign-out')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', signIn.body.csrfToken);
    expect(logout.status).toBe(200);
    const revoked = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(revoked.status).toBe(401);
    expect(revoked.body.error.code).toBe('INVALID_SESSION');
  } finally {
    vi.unstubAllEnvs();
  }
});

it('reads editor and moderation data from the migrated listing schema', async () => {
  const id = await listing('pending', 'Marketplace review fixture');
  await engine.query(
    `UPDATE business_listings
     SET image_key = 'private/image.webp', image_mime_type = 'image/webp',
         annual_revenue = 89000.50
     WHERE id = $1`,
    [id]
  );
  const password = 'Listing-review-fixture-password';
  await engine.query('UPDATE users SET password = $1 WHERE id IN (2, 5)', [
    await hashPassword(password),
  ]);
  const ownerSession = await createSession(
    await authenticateUser({ email: 'seller@example.test', password })
  );
  const adminSession = await createSession(
    await authenticateUser({ email: 'admin@example.test', password })
  );
  const owner = await request(app)
    .get(`/api/listings/mine/${id}`)
    .set('Cookie', `token=${ownerSession.accessToken}`);
  expect(owner.status).toBe(200);
  expect(owner.body.listing).toMatchObject({
    id,
    imageUrl: expect.stringContaining(`/api/listings/${id}/image`),
    annualRevenue: '89000.50',
  });
  const queue = await request(app)
    .get('/api/admin/listings?status=pending&q=Marketplace')
    .set('Cookie', `token=${adminSession.accessToken}`);
  expect(queue.status).toBe(200);
  expect(queue.body.listings).toEqual([
    expect.objectContaining({ id, hasImage: true, annualRevenue: '89000.50' }),
  ]);
  expect(JSON.stringify(queue.body)).not.toContain('private/image.webp');
  expect((await request(app).get(`/api/listings/${id}`)).status).toBe(404);
});

it('tracks diligence and document review atomically without gating disputed or incomplete closing', async () => {
  const listingId = await listing('published', 'Diligence fixture');
  const dealId = await accepted(listingId);
  const url = `/api/deals/${dealId}/diligence`;
  const password = 'Diligence-local-fixture-password';
  await engine.query(
    'UPDATE users SET password = $1 WHERE id IN (1, 2, 3, 5)',
    [await hashPassword(password)]
  );
  const session = async email =>
    createSession(await authenticateUser({ email, password }));
  const [buyerSession, sellerSession, outsider, admin] = await Promise.all(
    ['buyer', 'seller', 'other', 'admin'].map(name =>
      session(`${name}@example.test`)
    )
  );
  const auth = (builder, current) =>
    builder
      .set('Cookie', `token=${current.accessToken}`)
      .set('X-CSRF-Token', current.csrfToken);
  const read = (current = buyerSession, query = '') =>
    auth(request(app).get(url + query), current);
  const post = (subpath, current, body) =>
    auth(request(app).post(url + subpath), current).send(body);
  const patch = (subpath, current, body) =>
    auth(request(app).patch(url + subpath), current).send(body);
  expect((await request(app).get(url)).status).toBe(401);
  expect((await read(outsider)).status).toBe(404);
  expect((await read(admin)).status).toBe(404);
  expect(
    (
      await auth(
        request(app).get('/api/deals/2147483647/diligence'),
        buyerSession
      )
    ).status
  ).toBe(404);
  const empty = await read();
  expect(empty.status).toBe(200);
  expect(empty.body.progress).toMatchObject({
    total: 0,
    completed: 0,
    outstandingRequests: 0,
  });
  expect(empty.body.startedAt).toBeNull();

  const input = {
    title: 'Reconcile statements',
    description: 'Compare revenue to supporting statements.',
    category: 'financial',
    assignedTo: 'seller',
    dueDate: '2000-01-01',
    creationKey: randomUUID(),
  };
  expect(
    (
      await post('/checklist', buyerSession, {
        ...input,
        assignedTo: 'unrelated',
      })
    ).status
  ).toBe(400);
  expect((await post('/checklist', outsider, input)).status).toBe(404);
  expect(
    (
      await request(app)
        .post(url + '/checklist')
        .set('Cookie', `token=${buyerSession.accessToken}`)
        .send(input)
    ).status
  ).toBe(403);
  for (const invalid of [
    { dueDate: '0000-01-01' },
    { description: 'Null\0character' },
    { title: 'Invalid Unicode \uD800' },
  ]) {
    expect(
      (await post('/checklist', buyerSession, { ...input, ...invalid })).status
    ).toBe(400);
  }
  const created = await post('/checklist', buyerSession, input);
  expect(created.status).toBe(201);
  const task = '/checklist/' + created.body.id;
  expect((await post('/checklist', buyerSession, input)).status).toBe(409);
  expect(
    (await patch(task, outsider, { status: 'completed', revision: 0 })).status
  ).toBe(404);
  const filtered = await read(
    sellerSession,
    '?assignment=mine&category=financial&status=pending'
  );
  expect(filtered.body.checklist).toEqual([
    expect.objectContaining({ overdue: true, created_by: buyer }),
  ]);
  expect(filtered.body.progress).toMatchObject({
    total: 1,
    pending: 1,
    overdue: 1,
  });
  expect(filtered.body.startedAt).toBeTruthy();
  expect(
    (await patch(task, sellerSession, { status: 'completed', revision: 0 }))
      .status
  ).toBe(200);
  expect(
    (await patch(task, sellerSession, { status: 'blocked', revision: 0 }))
      .status
  ).toBe(409);
  const completed = await read();
  expect(completed.body.checklist[0].completed_at).toBeTruthy();
  expect(completed.body.progress).toMatchObject({ completed: 1, overdue: 0 });
  expect(
    (
      await patch(task, sellerSession, {
        status: 'blocked',
        revision: 1,
        assignedTo: 'buyer',
      })
    ).status
  ).toBe(200);
  expect((await read()).body.checklist[0].completed_at).toBeNull();

  const requestInput = {
    title: 'Financial statements',
    description: '',
    dueDate: null,
    creationKey: randomUUID(),
  };
  const requested = await post('/requests', buyerSession, requestInput);
  expect(requested.status).toBe(201);
  const requestPath = '/requests/' + requested.body.id;
  expect((await post('/requests', buyerSession, requestInput)).status).toBe(
    409
  );
  const { conversation } = await startConversation(buyer, listingId);
  const insertFile = async (filename, status, uploader = seller) => {
    const { rows } = await engine.query(
      `INSERT INTO conversation_documents(conversation_id, uploaded_by, storage_key, original_filename, mime_type, size_bytes, sha256, status)
       VALUES ($1, $2, $3, $4, 'application/pdf', 100, repeat('a', 64), $5) RETURNING id`,
      [conversation.id, uploader, `private/${filename}`, filename, status]
    );
    return rows[0].id;
  };
  const first = await insertFile('first.pdf', 'available');
  const revised = await insertFile('revised.pdf', 'available');
  const quarantined = await insertFile('pending.pdf', 'pending');
  const buyerFile = await insertFile('buyer.pdf', 'available', buyer);
  const otherDeal = (await createDeal(otherBuyer, listingId)).deal.id;
  await engine.query(
    'INSERT INTO deal_documents(deal_id, conversation_document_id, linked_by) VALUES ($1,$2,$3), ($1,$4,$3), ($1,$5,$3), ($6,$7,$3)',
    [dealId, first, seller, quarantined, buyerFile, otherDeal, revised]
  );
  const actOnRequest = (current, body) => patch(requestPath, current, body);
  expect(
    (
      await actOnRequest(buyerSession, {
        action: 'submit',
        documentId: first,
        revision: 0,
      })
    ).status
  ).toBe(403);
  for (const documentId of [revised, quarantined, buyerFile]) {
    expect(
      (
        await actOnRequest(sellerSession, {
          action: 'submit',
          documentId,
          revision: 0,
        })
      ).status
    ).toBe(409);
  }
  expect(
    (
      await actOnRequest(sellerSession, {
        action: 'submit',
        documentId: first,
        revision: 0,
      })
    ).status
  ).toBe(200);
  expect(
    (await actOnRequest(sellerSession, { action: 'review', revision: 1 }))
      .status
  ).toBe(403);
  expect(
    (await actOnRequest(buyerSession, { action: 'accept', revision: 1 })).status
  ).toBe(409);
  await engine.query(
    'UPDATE conversation_documents SET status = \'deleted\', deleted_at = now() WHERE id = $1',
    [first]
  );
  expect(
    (await actOnRequest(buyerSession, { action: 'review', revision: 1 })).status
  ).toBe(200);
  expect(
    (await actOnRequest(buyerSession, { action: 'accept', revision: 2 })).status
  ).toBe(409);
  expect(
    (
      await actOnRequest(buyerSession, {
        action: 'request_changes',
        revision: 2,
        feedback: 'Include the full year.',
      })
    ).status
  ).toBe(200);
  const reviewed = await read(sellerSession);
  expect(reviewed.body.requests[0]).toMatchObject({
    reviewed_by: buyer,
    status: 'changes_requested',
    feedback: 'Include the full year.',
  });
  expect(reviewed.body.requests[0].reviewed_at).toBeTruthy();
  expect(JSON.stringify(reviewed.body)).not.toContain('private/');
  await engine.query(
    'INSERT INTO deal_documents(deal_id, conversation_document_id, linked_by) VALUES ($1,$2,$3)',
    [dealId, revised, seller]
  );
  expect(
    (
      await actOnRequest(sellerSession, {
        action: 'submit',
        documentId: revised,
        revision: 3,
      })
    ).status
  ).toBe(200);
  expect(
    (await actOnRequest(buyerSession, { action: 'review', revision: 4 })).status
  ).toBe(200);
  expect(
    (await actOnRequest(buyerSession, { action: 'accept', revision: 5 })).status
  ).toBe(200);
  expect(
    (await actOnRequest(buyerSession, { action: 'accept', revision: 5 })).status
  ).toBe(409);
  await engine.query(
    'UPDATE conversation_documents SET status = \'deleted\', deleted_at = now() WHERE id = $1',
    [revised]
  );
  const final = await read();
  expect(final.body.requests[0]).toMatchObject({
    status: 'accepted',
    document_filename: null,
  });
  expect(final.body.progress).toMatchObject({
    outstandingRequests: 0,
    blocked: 1,
  });
  expect(final.body.firstDocumentAcceptedAt).toBeTruthy();

  const activity = await auth(
    request(app).get(`/api/deals/${dealId}/history`),
    buyerSession
  );
  expect(activity.body.activities.map(event => event.event_type)).toEqual(
    expect.arrayContaining([
      'deal.checklist_created',
      'deal.task_assigned',
      'deal.task_completed',
      'deal.document_requested',
      'deal.document_submitted',
      'deal.document_changes_requested',
      'deal.document_accepted',
    ])
  );
  expect(
    activity.body.activities.find(
      event => event.event_type === 'deal.document_changes_requested'
    ).metadata.feedback
  ).toBe('Include the full year.');
  const adminHistory = await auth(
    request(app).get(`/api/deals/${dealId}/history`),
    admin
  );
  expect(adminHistory.status).toBe(200);
  expect(adminHistory.body.activities.length).toBeGreaterThan(0);
  expect(JSON.stringify(adminHistory.body)).not.toContain(
    'Include the full year.'
  );
  expect(
    adminHistory.body.activities.some(
      event => event.event_type === 'deal.document_requested'
    )
  ).toBe(false);
  const { rows: deliveries } = await engine.query(
    `SELECT n.user_id, n.type FROM notifications n JOIN outbox_events e ON n.dedupe_key = e.event_key
     AND NOT (n.payload ? 'feedback') AND NOT (e.payload ? 'feedback')
     WHERE n.payload->>'dealId' = $1 AND n.dedupe_key LIKE 'deal:activity:%' ORDER BY n.id`,
    [String(dealId)]
  );
  expect(deliveries).toEqual([
    { user_id: seller, type: 'deal.task_assigned' },
    { user_id: buyer, type: 'deal.task_assigned' },
    { user_id: seller, type: 'deal.document_requested' },
    { user_id: buyer, type: 'deal.document_submitted' },
    { user_id: seller, type: 'deal.document_changes_requested' },
    { user_id: buyer, type: 'deal.document_submitted' },
    { user_id: seller, type: 'deal.document_accepted' },
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const sellerCreated = await post('/checklist', sellerSession, {
    ...input,
    title: 'Buyer follow-up',
    assignedTo: 'buyer',
    dueDate: today,
    creationKey: randomUUID(),
  });
  expect(sellerCreated.status).toBe(201);
  const followUp = '/checklist/' + sellerCreated.body.id;
  const sellerItem = (await read()).body.checklist.find(
    item => item.id === sellerCreated.body.id
  );
  expect(sellerItem).toMatchObject({
    assigned_to: 'buyer', created_by: seller, due_date: today, overdue: false,
  });
  const competingUpdates = await Promise.all([
    patch(followUp, buyerSession, { status: 'completed', revision: 0 }),
    patch(followUp, sellerSession, { status: 'completed', revision: 0 }),
  ]);
  expect(competingUpdates.map(response => response.status).sort()).toEqual([
    200, 409,
  ]);
  expect((await read()).body.progress).toMatchObject({
    completed: 1, blocked: 1, overdue: 1,
  });
  expect((await getDeal(dealId, buyer)).status).toBe('accepted');
  await act(dealId, seller, 'dispute', 0);
  await expect(confirm(dealId, buyer, 1, false)).rejects.toMatchObject({
    status: 409,
  });
  await act(dealId, seller, 'resolve', 1);
  await act(dealId, buyer, 'propose', 2, { amount: '115000' });
  await act(dealId, seller, 'agree', 3);
  await confirm(dealId, buyer, 3, false);
  await confirm(dealId, seller, 3, false);
  expect((await getDeal(dealId, buyer)).status).toBe('completed');
  expect((await getPublishedListing(listingId)).status).toBe('sold');
  expect(
    (await patch(task, buyerSession, { status: 'completed', revision: 2 }))
      .status
  ).toBe(409);
}, 20000);

it('enrolls administrator MFA and enforces fresh factors and single-use recovery', async () => {
  const password = 'Mfa-Fixture-Password-Only';
  vi.stubEnv('ADMIN_MFA_ENCRYPTION_KEY', 'ab'.repeat(32));
  try {
    await engine.query('UPDATE users SET password = $1 WHERE id = 5', [
      await hashPassword(password),
    ]);
    const input = { email: 'admin@example.test', password };
    const signIn = mfaCode =>
      request(app)
        .post('/api/auth/sign-in')
        .send({ ...input, ...(mfaCode ? { mfaCode } : {}) });
    const auth = response => ({
      cookie: response.headers['set-cookie'][0].split(';')[0],
      csrf: response.body.csrfToken,
    });
    const post = (path, session, values) =>
      request(app)
        .post(`/api/auth/admin-mfa/${path}`)
        .set('Cookie', session.cookie)
        .set('X-CSRF-Token', session.csrf)
        .send(values);
    const original = await signIn();
    expect(original.status).toBe(200);
    const session = auth(original);
    const anonymous = await request(app)
      .post('/api/auth/admin-mfa/enroll')
      .send({ password });
    expect(anonymous.status).toBe(401);
    const rejectedSetup = await post('enroll', session, {
      password: 'Incorrect fixture password',
    });
    expect(rejectedSetup.body.error.code).toBe('MFA_REAUTH_REQUIRED');
    const setup = await post('enroll', session, { password });
    expect(setup.status).toBe(200);
    expect(setup.body.qr.startsWith('data:image/png;base64,')).toBe(true);
    const totp = new TOTP({ secret: Secret.fromBase32(setup.body.secret) });
    const currentCode = totp.generate();
    const activation = await post('activate', session, {
      password,
      code: currentCode,
    });
    expect(activation.status).toBe(200);
    expect(activation.body.recoveryCodes).toHaveLength(10);
    const codes = activation.body.recoveryCodes;
    const [state] = (
      await engine.query(
        'SELECT mfa_secret, mfa_recovery FROM users WHERE id = 5'
      )
    ).rows;
    expect(state.mfa_secret === setup.body.secret).toBe(false);
    expect(state.mfa_recovery.includes(codes[0])).toBe(false);
    expect(
      (await request(app).get('/api/admin/users').set('Cookie', session.cookie))
        .status
    ).toBe(401);
    expect((await signIn()).body.error.code).toBe('MFA_REQUIRED');
    expect((await signIn(currentCode)).body.error.code).toBe('MFA_INVALID');
    const clock = Date.now();
    const windowCodes = [-30000, 0, 30000].map(offset =>
      totp.generate({ timestamp: clock + offset })
    );
    const incorrect = ['000000', '111111', '222222', '333333'].find(
      candidate => !windowCodes.includes(candidate)
    );
    expect((await signIn(incorrect)).body.error.code).toBe('MFA_INVALID');
    const expired = totp.generate({ timestamp: Date.now() - 120_000 });
    expect((await signIn(expired)).status).toBe(403);
    const fresh = totp.generate({ timestamp: Date.now() + 30_000 });
    expect((await signIn(fresh)).status).toBe(200);
    expect((await signIn(fresh)).status).toBe(403);
    const recovered = await signIn(codes[0]);
    expect(recovered.status).toBe(200);
    expect((await signIn(codes[0])).status).toBe(403);
    vi.stubEnv('ADMIN_MFA_REQUIRED', 'true');
    expect(
      (await post('remove', auth(recovered), { password, code: codes[1] })).body
        .error.code
    ).toBe('MFA_ENFORCED');
    vi.stubEnv('ADMIN_MFA_REQUIRED', 'false');
    const replacement = await post('recovery', auth(recovered), {
      password,
      code: codes[1],
    });
    expect(replacement.status).toBe(200);
    expect((await signIn(codes[2])).status).toBe(403);
    const freshSession = await signIn(replacement.body.recoveryCodes[0]);
    expect(freshSession.status).toBe(200);
    expect(
      (
        await post('remove', auth(freshSession), {
          password,
          code: replacement.body.recoveryCodes[1],
        })
      ).status
    ).toBe(200);
    vi.stubEnv('ADMIN_MFA_REQUIRED', 'true');
    expect((await signIn()).body.error.code).toBe('MFA_ENROLLMENT_REQUIRED');
  } finally {
    vi.unstubAllEnvs();
  }
}, 20000);

it('does not issue or honor sessions from an obsolete password generation', async () => {
  const { findActiveSession, requestPasswordReset, resetPassword } =
    await import('#services/auth.service.js');
  const { verifyAccessToken } = await import('#utils/jwt.js');
  const email = 'new@example.test';
  const password = 'Old-fixture-passphrase';
  await engine.query('UPDATE users SET password = $1 WHERE id = 4', [
    await hashPassword(password),
  ]);
  const verified = await authenticateUser({ email, password });
  const previous = await createSession(verified);
  const { token } = await requestPasswordReset(email);
  await resetPassword(token, 'New-fixture-passphrase');
  await expect(createSession(verified)).rejects.toMatchObject({ status: 401 });
  await expect(
    findActiveSession(verifyAccessToken(previous.accessToken))
  ).resolves.toBeUndefined();
  const reverified = await authenticateUser({
    email,
    password: 'New-fixture-passphrase',
  });
  const valid = await createSession(reverified);
  expect(
    await findActiveSession(verifyAccessToken(valid.accessToken))
  ).toMatchObject({ userId: 4 });
}, 10000);

describe('seller analytics on the migrated schema', () => {
  it('counts eligible public views once per listing, verified account and UTC day and expires keys', async () => {
    const { recordListingView, clearExpiredListingViewKeys } =
      await import('#services/listing-view.service.js');
    const { getSellerAnalytics } =
      await import('#services/seller-analytics.service.js');
    const id = await listing();
    const archived = await listing('archived');
    const draft = await listing('draft');
    const pending = await listing('pending');
    const options = { since: '2026-01-07T12:00:00Z', secret: 'local-test-key' };
    const viewer = { id: buyer, role: 'buyer', emailVerified: true };
    const before = new Date('2026-01-07T23:59:59Z');
    const after = new Date('2026-01-08T00:00:00Z');

    await Promise.all(
      Array.from({ length: 8 }, () =>
        recordListingView(id, viewer, options, before)
      )
    );
    await recordListingView(id, viewer, options, after);
    for (const invalid of [
      undefined,
      { ...viewer, emailVerified: false },
      { ...viewer, id: seller, role: 'seller' },
      { ...viewer, id: 5, role: 'admin' },
    ])
      await recordListingView(id, invalid, options, after);
    for (const hidden of [archived, draft, pending, 2147483647])
      await recordListingView(hidden, viewer, options, after);
    await recordListingView(
      id,
      viewer,
      options,
      new Date('2026-01-07T11:59:59Z')
    );

    const analytics = await getSellerAnalytics(
      seller,
      '7',
      [id],
      options.since,
      after
    );
    expect(analytics.window.from).toBe('2026-01-02');
    expect(analytics.trends.slice(-3).map(point => point.views)).toEqual([
      null,
      1,
      1,
    ]);
    expect(analytics.listingViews).toEqual({ total: 2, recent: 2 });
    expect(analytics.offerAcceptanceRate).toBeNull();
    expect(
      (await getSellerAnalytics(seller, 'all', [id], undefined, after)).totals
        .views
    ).toBeNull();
    expect(
      (await getSellerAnalytics(otherBuyer, 'all', [id], options.since, after))
        .listings
    ).toEqual([]);

    await clearExpiredListingViewKeys(new Date('2026-01-09T01:00:00Z'));
    const { rows } = await engine.query(
      'SELECT viewer_key FROM listing_view_events ORDER BY viewed_on'
    );
    expect(rows.map(row => row.viewer_key)).toEqual([
      null,
      expect.stringMatching(/^[a-f0-9]{64}$/),
    ]);
    expect(
      (await getSellerAnalytics(seller, 'all', [], options.since, after)).totals
        .views
    ).toBe(2);
    await engine.query('DELETE FROM business_listings WHERE id = $1', [id]);
    expect((await engine.query('SELECT listing_id FROM listing_view_events')).rows).toEqual([]);
  });

  it('groups real inquiries, buyer offers, acceptances and confirmed closings using their own dates', async () => {
    const { getSellerAnalytics } =
      await import('#services/seller-analytics.service.js');
    const id = await listing();
    const first = await startConversation(buyer, id);
    const second = await startConversation(otherBuyer, id);
    await engine.query(
      'UPDATE conversations SET created_at = $1 WHERE id = $2',
      ['2026-01-01T23:59:59Z', first.conversation.id]
    );
    await engine.query(
      'UPDATE conversations SET created_at = $1 WHERE id = $2',
      ['2026-01-02T00:00:00Z', second.conversation.id]
    );
    const since = '2026-01-01T00:00:00Z';
    const beforeOffers = await getSellerAnalytics(
      seller,
      '7',
      [id],
      since,
      new Date('2026-01-08T01:00:00Z')
    );
    expect(beforeOffers.totals.inquiries).toBe(1);
    expect(beforeOffers.trends[0].inquiries).toBe(1);

    const deal = (await createDeal(buyer, id)).deal;
    const proposal = await createOffer(deal.id, buyer, {
      amount: '110000',
      currency: 'EUR',
    });
    await respondToOffer(deal.id, proposal.id, seller, 'accept');
    await act(deal.id, buyer, 'propose', 0, { amount: '110000' });
    await act(deal.id, seller, 'agree', 1);
    await confirm(deal.id, buyer, 1, false);
    await confirm(deal.id, seller, 1, false);

    const data = await getSellerAnalytics(seller, 'all', [id], since);
    expect(data.totals).toMatchObject({
      inquiries: 2,
      offers: 1,
      accepted: 1,
      completed: 1,
    });
    expect(data.offerAcceptanceRate).toBe(100);
    expect(data.statusCounts).toMatchObject({
      listings: { sold: 1 },
      offers: { accepted: 1 },
      deals: { completed: 1 },
    });
    expect(data.inquiriesByListing).toEqual([
      expect.objectContaining({ id, count: 2 }),
    ]);
    expect(data.listings[0]).toMatchObject({
      status: 'sold',
      completedAt: expect.any(String),
    });
    expect(data.window.interval).toBe('month');
    const counterListing = await listing();
    await accepted(counterListing);
    const counter = await getSellerAnalytics(
      seller,
      'all',
      [counterListing],
      since
    );
    expect(counter.totals).toMatchObject({
      offers: 1,
      accepted: 1,
      completed: 0,
    });
    expect(counter.offerAcceptanceRate).toBe(0);
  });

  it('only shows view insights for a covered window with a sufficient sample', async () => {
    const { getSellerAnalytics } = await import('#services/seller-analytics.service.js');
    const id = await listing();
    await engine.query(
      `INSERT INTO listing_view_events (listing_id, viewed_on)
       SELECT $1, '2026-03-08'::date FROM generate_series(1, 99)`,
      [id]
    );
    const now = new Date('2026-03-08T18:00:00Z');
    const since = '2026-03-01T15:00:00Z';
    expect((await getSellerAnalytics(seller, '7', [id], since, now)).insights).toEqual([]);
    await engine.query(
      'INSERT INTO listing_view_events (listing_id, viewed_on) VALUES ($1, \'2026-03-08\')',
      [id]
    );
    expect((await getSellerAnalytics(seller, '7', [id], since, now)).insights).toEqual([
      expect.objectContaining({ id, views: 100, inquiries: 0, rule: 'few_inquiries' })
    ]);
    expect((await getSellerAnalytics(seller, '30', [id], since, now)).insights).toEqual([]);
  });

  it('protects tracking and seller endpoints with sessions, CSRF, browser metadata and ownership', async () => {
    const id = await listing();
    const {
      rows: [other],
    } = await engine.query(
      'INSERT INTO users (id,name,email,password,role,email_verified) VALUES (1000,\'Other Seller\',\'analytics-isolation@example.test\',\'fixture\',\'seller\',true) RETURNING id'
    );
    const {
      rows: [foreign],
    } = await engine.query(
      'INSERT INTO business_listings (seller_id,title,description,status) VALUES ($1,\'Other business\',\'Isolation fixture\',\'draft\') RETURNING id',
      [other.id]
    );
    const password = 'Seller-analytics-fixture-pass';
    await engine.query('UPDATE users SET password = $1 WHERE id IN (1, 2, 5)', [
      await hashPassword(password),
    ]);
    const session = async name =>
      createSession(
        await authenticateUser({ email: `${name}@example.test`, password })
      );
    const owner = await session('seller');
    const visitor = await session('buyer');
    const admin = await session('admin');
    const cookie = current => `token=${current.accessToken}`;
    const overview = '/api/seller/analytics/overview';
    expect((await request(app).get(overview)).status).toBe(401);
    for (const current of [visitor, admin])
      expect(
        (await request(app).get(overview).set('Cookie', cookie(current))).status
      ).toBe(403);
    expect(
      (
        await request(app)
          .get(overview + '?range=31')
          .set('Cookie', cookie(owner))
      ).status
    ).toBe(400);
    const detail = '/api/seller/analytics/listings/';
    expect(
      (
        await request(app)
          .get(detail + foreign.id)
          .set('Cookie', cookie(owner))
      ).status
    ).toBe(404);
    expect(
      (
        await request(app)
          .get(`/api/seller/analytics/comparison?ids=${id},${foreign.id}`)
          .set('Cookie', cookie(owner))
      ).status
    ).toBe(404);
    const own = await request(app)
      .get(detail + id)
      .set('Cookie', cookie(owner));
    expect(own.status).toBe(200);
    expect(own.headers['cache-control']).toContain('no-store');
    expect(JSON.stringify(own.body)).not.toMatch(
      /viewer.key|buyer.id|closing.amount/
    );

    const path = `/api/listings/${id}/views`;
    const post = () => request(app).post(path).send({ consent: true });
    expect((await post()).status).toBe(401);
    expect((await post().set('Cookie', cookie(visitor))).status).toBe(403);
    const csrf = () =>
      post()
        .set('Cookie', cookie(visitor))
        .set('X-CSRF-Token', visitor.csrfToken);
    expect((await csrf()).status).toBe(403);

    vi.stubEnv('LISTING_VIEW_TRACKING_SINCE', '2025-01-01T00:00:00Z');
    try {
      const browserPost = () =>
        csrf()
          .set(
            'Origin',
            (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
              .split(',')[0]
              .trim()
          )
          .set('Sec-Fetch-Mode', 'cors')
          .set('Sec-Fetch-Dest', 'empty');
      expect((await browserPost().set('Sec-GPC', '1')).status).toBe(204);
      expect((await request(app).get(`/api/listings/${id}`)).status).toBe(200);
      expect(
        (
          await engine.query(
            'SELECT * FROM listing_view_events WHERE listing_id = $1',
            [id]
          )
        ).rows
      ).toHaveLength(0);
      expect((await browserPost()).status).toBe(204);
      expect((await browserPost()).status).toBe(204);
      expect(
        (
          await engine.query(
            'SELECT * FROM listing_view_events WHERE listing_id = $1',
            [id]
          )
        ).rows
      ).toHaveLength(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
