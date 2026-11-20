import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
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
vi.mock('../src/config/arcjet.js', () => {
  const client = {
    withRule: () => client,
    protect: async () => ({ isDenied: () => false }),
  };
  return { default: client };
});
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

const listing = (id, overrides = {}) => ({
  id,
  seller_id: id + 100,
  title: `Business ${id}`,
  description: `Description for business ${id}`,
  industry: 'Software',
  location: 'Brussels, Belgium',
  asking_price: '100000',
  annual_revenue: '250000',
  ebitda: '50000',
  currency: 'EUR',
  status: 'published',
  rejection_reason: null,
  published_at: new Date(`2025-01-0${id}T00:00:00Z`),
  created_at: new Date(`2025-01-0${id}T00:00:00Z`),
  updated_at: new Date(`2025-01-0${id}T00:00:00Z`),
  ...overrides,
});

beforeEach(() => {
  mock.resetDatabase();
  mock.databaseState.business_listings.push(
    listing(1, {
      title: 'Cloud Bakery',
      description: 'Cloud based bakery',
      asking_price: '100000',
      annual_revenue: '250000',
      ebitda: '50000',
      industry: 'Food',
      location: 'Brussels',
    }),
    listing(2, {
      title: 'Cloud Software',
      description: 'A software company',
      asking_price: '300000',
      annual_revenue: '900000',
      ebitda: '200000',
      industry: 'Software',
      location: 'Amsterdam',
    }),
    listing(3, {
      title: 'Garden Tools',
      description: 'Outdoor equipment',
      asking_price: '200000',
      annual_revenue: '500000',
      ebitda: '100000',
      industry: 'Retail',
      location: 'Brussels',
    }),
    listing(4, { status: 'draft', title: 'Cloud secret' })
  );
});

describe('Phase 3 public search and discovery', () => {
  it('searches title and description and applies case insensitive industry and location filters', async () => {
    const keyword = await request(app).get('/api/listings?q=cloud');
    expect(keyword.body.listings.map(row => row.id)).toEqual([2, 1]);
    const filtered = await request(app).get(
      '/api/listings?industry=food&location=brussels'
    );
    expect(filtered.body.listings.map(row => row.id)).toEqual([1]);
    const description = await request(app).get('/api/listings?q=equipment');
    expect(description.body.listings.map(row => row.id)).toEqual([3]);
  });

  it('applies each financial bound and combines them with text filters', async () => {
    for (const query of [
      'minPrice=300000',
      'maxPrice=100000',
      'minRevenue=900000',
      'maxRevenue=250000',
      'minEbitda=200000',
      'maxEbitda=50000',
    ]) {
      expect(
        (await request(app).get(`/api/listings?${query}`)).body.listings
      ).toHaveLength(1);
    }
    const combined = await request(app).get(
      '/api/listings?q=cloud&minPrice=90000&maxPrice=150000&minRevenue=200000&maxRevenue=300000&minEbitda=40000&maxEbitda=60000&industry=food&location=brussels'
    );
    expect(combined.body.listings.map(row => row.id)).toEqual([1]);
  });

  it('sorts in all supported directions with deterministic ties', async () => {
    mock.databaseState.business_listings[1].asking_price = '100000';
    for (const [sort, ids] of [
      ['newest', [3, 2, 1]],
      ['oldest', [1, 2, 3]],
      ['price_asc', [2, 1, 3]],
      ['price_desc', [3, 2, 1]],
    ]) {
      const result = await request(app).get(`/api/listings?sort=${sort}`);
      expect(result.body.listings.map(row => row.id)).toEqual(ids);
    }
  });

  it('paginates filtered results and returns consistent empty metadata', async () => {
    const page = await request(app).get(
      '/api/listings?industry=brussels&page=1&limit=1'
    );
    expect(page.body.listings).toHaveLength(0);
    expect(page.body.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 0,
      totalPages: 0,
    });
    const second = await request(app).get(
      '/api/listings?location=brussels&page=2&limit=1'
    );
    expect(second.body.listings).toHaveLength(1);
    expect(second.body.pagination).toEqual({
      page: 2,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
  });

  it('rejects invalid, reversed, and unknown filters', async () => {
    for (const query of [
      'sort=random',
      'minPrice=-1',
      'minPrice=200&maxPrice=100',
      'unknown=x',
      'limit=101',
      'q=%20',
    ]) {
      expect((await request(app).get(`/api/listings?${query}`)).status).toBe(
        400
      );
    }
  });

  it('returns only published rows and excludes seller and moderation fields', async () => {
    const response = await request(app).get('/api/listings?q=cloud');
    expect(response.body.listings.map(row => row.id)).toEqual([2, 1]);
    for (const row of response.body.listings) {
      expect(row).not.toHaveProperty('sellerId');
      expect(row).not.toHaveProperty('seller_id');
      expect(row).not.toHaveProperty('status');
      expect(row).not.toHaveProperty('rejectionReason');
      expect(row).not.toHaveProperty('rejection_reason');
    }
  });
});
