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
