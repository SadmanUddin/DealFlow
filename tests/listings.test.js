import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.TEST_DATABASE_URL =
  'postgresql://localhost:5432/dealflow_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-32-chars';
process.env.ARCJET_KEY = 'test-only-arcjet-key';

vi.mock('../src/config/database.js', async () => ({
  db: (await import('./helpers/mock-database.js')).db,
}));
vi.mock('../src/models/user.model.js', async () => {
  const { modelTables } = await import('./helpers/mock-database.js');
  return modelTables;
});
vi.mock('../src/models/listing.model.js', async () => ({
  businessListings: (await import('./helpers/mock-database.js')).modelTables
    .businessListings,
}));
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
const body = overrides => ({
  title: 'Established manufacturing business',
  description: 'A profitable operation with a long operating history.',
  industry: 'Manufacturing',
  location: 'Brussels, Belgium',
  asking_price: '1250000.00',
  annual_revenue: '800000.00',
  ebitda: '180000.00',
  currency: 'EUR',
  ...overrides,
});
const signup = async (role, email) =>
  request(app)
    .post('/api/auth/sign-up')
    .send({
      name: `Test ${role}`,
      email,
      password,
      role,
    });
const credentialsFor = response => {
  if (!response.headers['set-cookie'])
    throw new Error(
      `Expected signup session; received ${response.status}: ${JSON.stringify(response.body)}`
    );
  return {
    cookie: (response.headers['set-cookie'] ?? [])
      .map(item => item.split(';')[0])
      .join('; '),
    csrf: response.body.csrfToken,
  };
};
const signed = (builder, credentials) =>
  builder
    .set('Cookie', credentials.cookie)
    .set('X-CSRF-Token', credentials.csrf);
const createAs = async credentials =>
  signed(request(app).post('/api/listings'), credentials).send(body());

beforeEach(() => mock.resetDatabase());

describe('listing authorization and creation', () => {
  it('requires authentication and seller role; accepts a seller-created draft', async () => {
    expect((await request(app).post('/api/listings').send(body())).status).toBe(
      401
    );
    const buyer = credentialsFor(await signup('buyer', 'buyer@listing.test'));
    expect(
      (await signed(request(app).post('/api/listings'), buyer).send(body()))
        .status
    ).toBe(403);
    const seller = credentialsFor(
      await signup('seller', 'seller@listing.test')
    );
    const created = await createAs(seller);
    expect(created.status).toBe(201);
    expect(created.body.listing.status).toBe('draft');
    expect(mock.databaseState.business_listings[0].seller_id).toBe(2);
  });

  it('rejects missing fields, invalid amounts, seller_id and client status', async () => {
    const seller = credentialsFor(
      await signup('seller', 'seller@listing.test')
    );
    for (const invalid of [
      { title: 'x' },
      body({ asking_price: '-1' }),
      body({ currency: 'ZZZ' }),
      body({ seller_id: 999 }),
      body({ status: 'published' }),
    ]) {
      expect(
        (await signed(request(app).post('/api/listings'), seller).send(invalid))
          .status
      ).toBe(400);
    }
  });
});

describe('public listing visibility', () => {
  it('returns published listings without ownership or moderation fields and hides all other statuses', async () => {
    const registration = await signup('seller', 'seller@listing.test');
    const credentials = credentialsFor(registration);
    const created = await createAs(credentials);
    for (const status of ['draft', 'pending', 'rejected', 'archived']) {
      mock.databaseState.business_listings.push({
        ...mock.databaseState.business_listings[0],
        id: mock.databaseState.nextListingId++,
        status,
      });
    }
    mock.databaseState.business_listings[0].status = 'published';
    mock.databaseState.business_listings[0].published_at = new Date();
    mock.databaseState.business_listings[0].rejection_reason =
      'private moderation note';
    const publicList = await request(app).get('/api/listings');
    const visible = await request(app).get(
      `/api/listings/${created.body.listing.id}`
    );
    const hiddenDetails = await Promise.all(
      [2, 3, 4, 5].map(id => request(app).get(`/api/listings/${id}`))
    );
    expect(publicList.status).toBe(200);
    expect(publicList.body.listings).toHaveLength(1);
    expect(publicList.body.listings[0]).not.toHaveProperty('sellerId');
    expect(publicList.body.listings[0]).not.toHaveProperty('rejectionReason');
    expect(visible.status).toBe(200);
    expect(hiddenDetails.every(response => response.status === 404)).toBe(true);
  });

  it('validates listing IDs and pagination', async () => {
    expect((await request(app).get('/api/listings?page=0')).status).toBe(400);
    expect((await request(app).get('/api/listings/not-an-id')).status).toBe(
      400
    );
  });

  it('paginates published listings and returns a sanitized database error', async () => {
    const seller = credentialsFor(
      await signup('seller', 'seller@listing.test')
    );
    await createAs(seller);
    await createAs(seller);
    await createAs(seller);
    mock.databaseState.business_listings.forEach(listing => {
      listing.status = 'published';
      listing.published_at = new Date();
    });
    const page = await request(app).get('/api/listings?page=2&limit=1');
    expect(page.status).toBe(200);
    expect(page.body.listings).toHaveLength(1);
    expect(page.body.pagination).toEqual({
      page: 2,
      limit: 1,
      total: 3,
      totalPages: 3,
    });
    mock.databaseState.failNext = new Error('database connection secret');
    const failed = await request(app).get('/api/listings');
    expect(failed.status).toBe(500);
    expect(failed.body.error.message).toBe('An unexpected error occurred');
    expect(JSON.stringify(failed.body)).not.toContain(
      'database connection secret'
    );
  });
});

describe('seller listing lifecycle', () => {
  it('restricts ownership, locks pending listings, and sends published edits back to pending', async () => {
    const owner = credentialsFor(await signup('seller', 'owner@listing.test'));
    const other = credentialsFor(await signup('seller', 'other@listing.test'));
    const created = await createAs(owner);
    const id = created.body.listing.id;
    const mine = await request(app)
      .get('/api/listings/mine')
      .set('Cookie', owner.cookie);
    expect(mine.status).toBe(200);
    expect(mine.body.listings).toHaveLength(1);
    const otherUpdate = await signed(
      request(app).patch(`/api/listings/${id}`),
      other
    ).send({ title: 'Changed title' });
    expect(otherUpdate.status).toBe(404);
    expect(
      (await signed(request(app).patch(`/api/listings/${id}`), owner).send({}))
        .status
    ).toBe(400);
    expect(
      (
        await signed(request(app).patch(`/api/listings/${id}`), owner).send({
          status: 'published',
        })
      ).status
    ).toBe(400);
    mock.databaseState.business_listings[0].status = 'pending';
    expect(
      (
        await signed(request(app).patch(`/api/listings/${id}`), owner).send({
          title: 'Changed title',
        })
      ).status
    ).toBe(409);
    mock.databaseState.business_listings[0].status = 'published';
    const updated = await signed(
      request(app).patch(`/api/listings/${id}`),
      owner
    ).send({ title: 'Changed title' });
    expect(updated.status).toBe(200);
    expect(updated.body.listing.status).toBe('pending');
  });

  it('requires email verification, supports submission and resubmission, and rejects repeat submission', async () => {
    const registration = await signup('seller', 'seller@listing.test');
    const credentials = credentialsFor(registration);
    const created = await createAs(credentials);
    const submitPath = `/api/listings/${created.body.listing.id}/submit`;
    expect(
      (
        await signed(request(app).post(submitPath), credentials).send({
          status: 'published',
        })
      ).status
    ).toBe(400);
    expect(
      (await signed(request(app).post(submitPath), credentials).send({})).status
    ).toBe(403);
    mock.databaseState.users[0].email_verified = true;
    expect(
      (await signed(request(app).post(submitPath), credentials).send({})).status
    ).toBe(200);
    expect(
      (await signed(request(app).post(submitPath), credentials).send({})).status
    ).toBe(409);
    mock.databaseState.business_listings[0].status = 'rejected';
    expect(
      (await signed(request(app).post(submitPath), credentials).send({})).status
    ).toBe(200);
  });

  it('allows draft deletion and published archive only by the owner', async () => {
    const owner = credentialsFor(await signup('seller', 'owner@listing.test'));
    const other = credentialsFor(await signup('seller', 'other@listing.test'));
    const created = await createAs(owner);
    const id = created.body.listing.id;
    expect(
      (await signed(request(app).delete(`/api/listings/${id}`), other)).status
    ).toBe(404);
    expect(
      (await signed(request(app).delete(`/api/listings/${id}`), owner)).status
    ).toBe(200);
    const second = await createAs(owner);
    mock.databaseState.business_listings[0].status = 'published';
    expect(
      (
        await signed(
          request(app).post(`/api/listings/${second.body.listing.id}/archive`),
          other
        ).send({})
      ).status
    ).toBe(404);
    expect(
      (
        await signed(
          request(app).post(`/api/listings/${second.body.listing.id}/archive`),
          owner
        ).send({})
      ).status
    ).toBe(200);
    for (const status of ['pending', 'published', 'rejected', 'archived']) {
      const blocked = await createAs(owner);
      const row = mock.databaseState.business_listings.find(
        listing => listing.id === blocked.body.listing.id
      );
      row.status = status;
      expect(
        (await signed(request(app).delete(`/api/listings/${row.id}`), owner))
          .status
      ).toBe(409);
    }
  });
});

describe('admin moderation', () => {
  it('allows admins to list and moderate pending listings, and protects moderation from sellers', async () => {
    const seller = credentialsFor(
      await signup('seller', 'seller@listing.test')
    );
    const created = await createAs(seller);
    mock.databaseState.business_listings[0].status = 'pending';
    const sellerAccess = await request(app)
      .get('/api/admin/listings')
      .set('Cookie', seller.cookie);
    expect(sellerAccess.status).toBe(403);
    const adminSignup = await signup('seller', 'admin@listing.test');
    mock.databaseState.users[1].role = 'admin';
    const admin = credentialsFor(
      await request(app)
        .post('/api/auth/sign-in')
        .send({ email: 'admin@listing.test', password })
    );
    expect(
      (
        await request(app)
          .get('/api/admin/listings?page=1&limit=1')
          .set('Cookie', admin.cookie)
      ).status
    ).toBe(200);
    const approved = await signed(
      request(app).patch(
        `/api/admin/listings/${created.body.listing.id}/moderation`
      ),
      admin
    ).send({ action: 'approve' });
    expect(approved.status).toBe(200);
    expect(approved.body.listing.status).toBe('published');
    expect(approved.body.listing.publishedAt).toBeTruthy();
    expect(
      (
        await signed(
          request(app).patch(
            `/api/admin/listings/${created.body.listing.id}/moderation`
          ),
          admin
        ).send({
          action: 'reject',
          rejectionReason: 'Needs clearer financial evidence',
        })
      ).status
    ).toBe(409);
    expect(
      (
        await request(app)
          .get('/api/admin/listings?limit=101')
          .set('Cookie', admin.cookie)
      ).status
    ).toBe(400);
    expect(adminSignup.status).toBe(201);
  });

  it('requires rejection reasons and rejects invalid actions', async () => {
    const seller = credentialsFor(
      await signup('seller', 'seller@listing.test')
    );
    const created = await createAs(seller);
    mock.databaseState.business_listings[0].status = 'pending';
    await signup('seller', 'admin@listing.test');
    mock.databaseState.users[1].role = 'admin';
    const admin = credentialsFor(
      await request(app)
        .post('/api/auth/sign-in')
        .send({ email: 'admin@listing.test', password })
    );
    const endpoint = `/api/admin/listings/${created.body.listing.id}/moderation`;
    expect(
      (
        await signed(request(app).patch(endpoint), admin).send({
          action: 'reject',
        })
      ).status
    ).toBe(400);
    expect(
      (
        await signed(request(app).patch(endpoint), admin).send({
          action: 'invalid',
        })
      ).status
    ).toBe(400);
    expect(
      (
        await signed(request(app).patch(endpoint), seller).send({
          action: 'reject',
          rejectionReason: 'No',
        })
      ).status
    ).toBe(403);
    const rejected = await signed(request(app).patch(endpoint), admin).send({
      action: 'reject',
      rejectionReason: 'Provide clearer evidence',
    });
    expect(rejected.status).toBe(200);
    expect(rejected.body.listing.status).toBe('rejected');
    expect(rejected.body.listing.rejectionReason).toBe(
      'Provide clearer evidence'
    );
  });
});
