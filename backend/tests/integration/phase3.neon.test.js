import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { neon } from '@neondatabase/serverless';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'phase3-neon-integration-secret-32-chars-minimum';
process.env.ARCJET_KEY = 'phase3-neon-integration-key';

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
];
const expectedIndexes = [
  'business_listings_status_published_at_idx',
  'business_listings_status_industry_idx',
  'business_listings_status_location_idx',
  'business_listings_status_asking_price_idx',
  'business_listings_status_annual_revenue_idx',
  'business_listings_status_ebitda_idx',
  'business_listings_title_trgm_idx',
  'business_listings_description_trgm_idx',
  'business_listings_industry_trgm_idx',
  'business_listings_location_trgm_idx',
];
const runId = randomUUID();
const marker = `DFP3-${runId}`;
const testEmail = `phase3-${runId}@integration.test`;
const testPassword = 'not-used-phase3-neon-test-hash';
const listingSpecs = [
  {
    suffix: 'Alpha Bakery',
    description: `Test description keyword ${marker}-DESCRIPTION-ALPHA`,
    industry: 'Food',
    location: 'Brussels',
    askingPrice: '100000.00',
    revenue: '200000.00',
    ebitda: '40000.00',
    status: 'published',
    publishedDaysAgo: 3,
  },
  {
    suffix: 'Beta Software',
    description: `Software description ${marker}-DESCRIPTION-BETA`,
    industry: 'Software',
    location: 'Amsterdam',
    askingPrice: '200000.00',
    revenue: '400000.00',
    ebitda: '80000.00',
    status: 'published',
    publishedDaysAgo: 2,
  },
  {
    suffix: 'Gamma Retail',
    description: `Retail description ${marker}-DESCRIPTION-GAMMA`,
    industry: 'Retail',
    location: 'Brussels',
    askingPrice: '300000.00',
    revenue: '600000.00',
    ebitda: '120000.00',
    status: 'published',
    publishedDaysAgo: 1,
  },
  ...['draft', 'pending', 'rejected', 'archived'].map(status => ({
    suffix: `Hidden ${status}`,
    description: `Non-public ${status} listing ${marker}`,
    industry: 'Food',
    location: 'Brussels',
    askingPrice: '150000.00',
    revenue: '300000.00',
    ebitda: '60000.00',
    status,
    publishedDaysAgo: null,
  })),
];
const createdListingIds = [];
let sql;
let app;
let sellerId;

const createFixtureData = async () => {
  const [seller] = await sql`
    insert into public.users (name, email, password, role, email_verified, is_active)
    values (${`Phase 3 ${runId}`}, ${testEmail}, ${testPassword}, 'seller', true, true)
    returning id
  `;
  sellerId = seller.id;

  for (const spec of listingSpecs) {
    const publishedAt =
      spec.publishedDaysAgo === null
        ? null
        : new Date(Date.now() - spec.publishedDaysAgo * 24 * 60 * 60 * 1000);
    const [row] = await sql`
      insert into public.business_listings
        (seller_id, title, description, industry, location, asking_price,
         annual_revenue, ebitda, currency, status, rejection_reason, published_at)
      values
        (${sellerId}, ${`${marker} ${spec.suffix}`}, ${spec.description},
         ${spec.industry}, ${spec.location}, ${spec.askingPrice}, ${spec.revenue},
         ${spec.ebitda}, 'EUR', ${spec.status},
         ${spec.status === 'rejected' ? `Private moderation note ${marker}` : null},
         ${publishedAt})
      returning id
    `;
    createdListingIds.push(row.id);
  }
};

const cleanup = async () => {
  if (!sql || !sellerId) return;
  await sql`
    delete from public.users
    where id = ${sellerId} and email = ${testEmail}
  `;
  const [remainingUser] = await sql`
    select count(*)::int as count from public.users
    where id = ${sellerId} and email = ${testEmail}
  `;
  const [remainingListings] = await sql`
    select count(*)::int as count from public.business_listings
    where seller_id = ${sellerId} and title like ${`${marker}%`}
  `;
  if (remainingUser.count !== 0 || remainingListings.count !== 0) {
    throw new Error('Phase 3 Neon test data cleanup verification failed');
  }
};

describe('DealFlow Phase 3 Neon search and discovery', () => {
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
      throw new Error('Neon migration history failed the Phase 3 safety guard');
    }

    const indexes = await sql`
      select indexname from pg_indexes
      where schemaname = ${'public'} and tablename = ${'business_listings'}
    `;
    const indexNames = new Set(indexes.map(({ indexname }) => indexname));
    if (!expectedIndexes.every(index => indexNames.has(index))) {
      throw new Error('Phase 3 Neon search indexes are missing');
    }
    const [trigram] = await sql`
      select count(*)::int as count from pg_extension where extname = ${'pg_trgm'}
    `;
    if (trigram.count !== 1) throw new Error('pg_trgm is not installed');

    const imported = await import('../../src/app.js');
    app = imported.default;
    await createFixtureData();
  }, 30000);

  afterAll(async () => {
    await cleanup();
  }, 30000);

  it('searches titles and descriptions and applies individual and combined filters', async () => {
    const titleSearch = await request(app).get(
      `/api/listings?q=${encodeURIComponent(`${marker} Alpha`)}`
    );
    expect(titleSearch.status).toBe(200);
    expect(titleSearch.body.listings.map(({ title }) => title)).toEqual([
      `${marker} Alpha Bakery`,
    ]);

    const descriptionSearch = await request(app).get(
      `/api/listings?q=${encodeURIComponent(`${marker}-DESCRIPTION-BETA`)}`
    );
    expect(descriptionSearch.status).toBe(200);
    expect(descriptionSearch.body.listings.map(({ title }) => title)).toEqual([
      `${marker} Beta Software`,
    ]);

    for (const [query, expectedSuffix] of [
      ['industry=Food', 'Alpha Bakery'],
      ['location=Amsterdam', 'Beta Software'],
      ['minPrice=300000', 'Gamma Retail'],
      ['maxPrice=100000', 'Alpha Bakery'],
      ['minRevenue=600000', 'Gamma Retail'],
      ['maxRevenue=200000', 'Alpha Bakery'],
      ['minEbitda=120000', 'Gamma Retail'],
      ['maxEbitda=40000', 'Alpha Bakery'],
    ]) {
      const response = await request(app).get(
        `/api/listings?q=${encodeURIComponent(marker)}&${query}`
      );
      expect(response.status, query).toBe(200);
      expect(
        response.body.listings.map(({ title }) => title),
        query
      ).toEqual([`${marker} ${expectedSuffix}`]);
    }

    const combined = await request(app).get(
      `/api/listings?q=${encodeURIComponent(`${marker} Alpha`)}&industry=Food&location=Brussels&minPrice=100000&maxPrice=100000&minRevenue=200000&maxRevenue=200000&minEbitda=40000&maxEbitda=40000`
    );
    expect(combined.status).toBe(200);
    expect(combined.body.listings.map(({ title }) => title)).toEqual([
      `${marker} Alpha Bakery`,
    ]);
    expect(combined.body.pagination.total).toBe(1);
  });

  it('sorts, paginates, counts results, and exposes only published sanitized listings', async () => {
    const expectedOrders = [
      ['newest', ['Gamma Retail', 'Beta Software', 'Alpha Bakery']],
      ['oldest', ['Alpha Bakery', 'Beta Software', 'Gamma Retail']],
      ['price_asc', ['Alpha Bakery', 'Beta Software', 'Gamma Retail']],
      ['price_desc', ['Gamma Retail', 'Beta Software', 'Alpha Bakery']],
    ];
    for (const [sort, suffixes] of expectedOrders) {
      const response = await request(app).get(
        `/api/listings?q=${encodeURIComponent(marker)}&sort=${sort}`
      );
      expect(response.status, sort).toBe(200);
      expect(
        response.body.listings.map(({ title }) =>
          title.replace(`${marker} `, '')
        ),
        sort
      ).toEqual(suffixes);
    }

    const firstPage = await request(app).get(
      `/api/listings?q=${encodeURIComponent(marker)}&sort=oldest&page=1&limit=1`
    );
    const secondPage = await request(app).get(
      `/api/listings?q=${encodeURIComponent(marker)}&sort=oldest&page=2&limit=1`
    );
    expect(firstPage.body.listings.map(({ title }) => title)).toEqual([
      `${marker} Alpha Bakery`,
    ]);
    expect(secondPage.body.listings.map(({ title }) => title)).toEqual([
      `${marker} Beta Software`,
    ]);
    expect(firstPage.body.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 3,
      totalPages: 3,
    });
    expect(secondPage.body.pagination).toEqual({
      page: 2,
      limit: 1,
      total: 3,
      totalPages: 3,
    });

    const visible = await request(app).get(
      `/api/listings?q=${encodeURIComponent(marker)}`
    );
    expect(visible.body.listings).toHaveLength(3);
    for (const row of visible.body.listings) {
      expect(row.title).toContain(marker);
      expect(row).not.toHaveProperty('sellerId');
      expect(row).not.toHaveProperty('seller_id');
      expect(row).not.toHaveProperty('status');
      expect(row).not.toHaveProperty('rejectionReason');
      expect(row).not.toHaveProperty('rejection_reason');
    }
    expect(visible.body.listings.map(({ title }) => title)).not.toContain(
      `${marker} Hidden draft`
    );
    expect(visible.body.listings.map(({ title }) => title)).not.toContain(
      `${marker} Hidden pending`
    );
    expect(visible.body.listings.map(({ title }) => title)).not.toContain(
      `${marker} Hidden rejected`
    );
    expect(visible.body.listings.map(({ title }) => title)).not.toContain(
      `${marker} Hidden archived`
    );
  });
});
