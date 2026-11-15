import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { neon } from '@neondatabase/serverless';

dotenv.config({ quiet: true });
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'phase2-neon-integration-secret-32-chars-minimum';
process.env.ARCJET_KEY = 'phase2-neon-integration-key';

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
  database: 'neondb',
  role: 'neondb_owner',
};
const expectedMigrations = [
  ['1', '1793816872035'],
  ['2', '1794749410776'],
  ['3', '1794763955729'],
];
const runId = randomUUID();
const emailPrefix = `phase2-${runId}-`;
const emails = {
  sellerA: `${emailPrefix}seller-a@integration.test`,
  sellerB: `${emailPrefix}seller-b@integration.test`,
  buyer: `${emailPrefix}buyer@integration.test`,
  admin: `${emailPrefix}admin@integration.test`,
};
const password = 'Phase2-Neon-Integration-Password-42!';
const trackedEmails = [];
const createdListingIds = [];
let sql;
let app;
let targetReport;

const listingInput = overrides => ({
  title: `Phase 2 ${runId} business`,
  description: `Integration listing for isolated Neon run ${runId}.`,
  industry: 'Software',
  location: 'Brussels',
  asking_price: '123456.78',
  annual_revenue: '250000.00',
  ebitda: '37500.25',
  currency: 'EUR',
  ...overrides,
});

const auth = response => {
  const cookies = response.headers['set-cookie'] ?? [];
  const cookie = cookies.map(value => value.split(';')[0]).join('; ');
  if (!cookie || !response.body.csrfToken) {
    throw new Error(`Authentication failed with HTTP ${response.status}`);
  }
  return { cookie, csrf: response.body.csrfToken };
};

const withCsrf = (builder, credentials) =>
  builder
    .set('Cookie', credentials.cookie)
    .set('X-CSRF-Token', credentials.csrf);

const signUp = async (email, role = 'buyer') => {
  trackedEmails.push(email);
  return request(app)
    .post('/api/auth/sign-up')
    .send({ name: `Phase 2 ${role}`, email, password, role });
};

const signIn = async email => {
  const response = await request(app)
    .post('/api/auth/sign-in')
    .send({ email, password });
  expect(response.status).toBe(200);
  return auth(response);
};

const verify = async response => {
  expect(response.status).toBe(201);
  expect(response.body.verificationToken).toBeTruthy();
  const verified = await request(app)
    .post('/api/auth/verify-email')
    .send({ token: response.body.verificationToken });
  expect(verified.status).toBe(200);
  return response.body.user.id;
};

const createListing = async (credentials, overrides = {}) => {
  const response = await withCsrf(
    request(app).post('/api/listings'),
    credentials
  ).send(listingInput(overrides));
  if (response.status === 201) createdListingIds.push(response.body.listing.id);
  return response;
};

const listingRow = async id => {
  const [row] = await sql`
    select id, seller_id, title, status, rejection_reason,
           asking_price::text as asking_price,
           annual_revenue::text as annual_revenue,
           ebitda::text as ebitda,
           currency, published_at, created_at, updated_at
    from public.business_listings where id = ${id}
  `;
  return row;
};

const removeCreatedUsers = async () => {
  if (!sql) return;
  const errors = [];
  for (const email of new Set(trackedEmails)) {
    try {
      await sql`
        delete from public.users
        where email = ${email} and email like ${`${emailPrefix}%`}
      `;
    } catch {
      errors.push('user cleanup failed');
    }
  }
  for (const id of new Set(createdListingIds)) {
    try {
      const [remaining] = await sql`
        select count(*)::int as count from public.business_listings
        where id = ${id} and title like ${`%${runId}%`}
      `;
      if (remaining.count !== 0) errors.push('listing cleanup failed');
    } catch {
      errors.push('listing cleanup verification failed');
    }
  }
  try {
    const [remainingUsers] = await sql`
      select count(*)::int as count from public.users
      where email like ${`${emailPrefix}%`}
    `;
    if (remainingUsers.count !== 0) errors.push('test user cleanup failed');
  } catch {
    errors.push('test user cleanup verification failed');
  }
  if (errors.length) throw new Error([...new Set(errors)].join(', '));
};

describe('Phase 2 real Neon integration', () => {
  beforeAll(async () => {
    const testUrl = process.env.TEST_DATABASE_URL;
    if (!testUrl) throw new Error('TEST_DATABASE_URL is required');
    const parsed = new URL(testUrl);
    if (parsed.hostname !== expectedTarget.hostname) {
      throw new Error(
        'TEST_DATABASE_URL hostname failed the Neon safety guard'
      );
    }

    sql = neon(testUrl);
    const [identity] = await sql`
      select current_database() as database_name,
             current_user as database_role,
             current_setting('neon.project_id', true) as project_id,
             current_setting('neon.endpoint_id', true) as endpoint_id
    `;
    if (
      identity.database_name !== expectedTarget.database ||
      identity.database_role !== expectedTarget.role ||
      identity.project_id !== expectedTarget.projectId ||
      identity.endpoint_id !== 'ep-super-king-b9pem88j'
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
        'Required Phase 1 and Phase 2 migrations are not applied'
      );
    }

    const tables = await sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
    `;
    const tableNames = new Set(tables.map(({ table_name }) => table_name));
    const requiredTables = [
      'users',
      'auth_sessions',
      'auth_tokens',
      'business_listings',
    ];
    if (!requiredTables.every(table => tableNames.has(table))) {
      throw new Error('Required application tables are missing');
    }

    const indexes = await sql`
      select indexname from pg_indexes where schemaname = 'public'
    `;
    const indexNames = new Set(indexes.map(({ indexname }) => indexname));
    const requiredIndexes = [
      'business_listings_seller_id_idx',
      'business_listings_status_created_at_idx',
      'auth_sessions_user_id_idx',
      'auth_tokens_user_type_idx',
      'auth_tokens_expires_at_idx',
    ];
    if (!requiredIndexes.every(index => indexNames.has(index))) {
      throw new Error('Required application indexes are missing');
    }

    const constraints = await sql`
      select conname, pg_get_constraintdef(oid) as definition
      from pg_constraint where connamespace = 'public'::regnamespace
    `;
    const definitions = constraints.map(
      row => `${row.conname} ${row.definition}`
    );
    for (const required of [
      'business_listings_financials_nonnegative',
      'business_listings_currency_format',
      'business_listings_seller_id_users_id_fk',
      'auth_sessions_user_id_users_id_fk',
      'auth_tokens_user_id_users_id_fk',
    ]) {
      if (!definitions.some(value => value.includes(required))) {
        throw new Error(`Required database constraint is missing: ${required}`);
      }
    }
    if (
      !definitions.some(
        value =>
          value.includes('business_listings_seller_id_users_id_fk') &&
          value.includes('ON DELETE CASCADE')
      )
    ) {
      throw new Error('Listing seller foreign key cascade behavior is missing');
    }

    const financialColumns = await sql`
      select column_name, numeric_precision, numeric_scale
      from information_schema.columns
      where table_schema = 'public' and table_name = 'business_listings'
        and column_name in ('asking_price', 'annual_revenue', 'ebitda')
    `;
    if (
      financialColumns.length !== 3 ||
      financialColumns.some(
        column => column.numeric_precision !== 18 || column.numeric_scale !== 2
      )
    ) {
      throw new Error('Financial columns are not numeric(18,2)');
    }

    const enumRows = await sql`
      select e.enumlabel
      from pg_type t join pg_enum e on t.oid = e.enumtypid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typname = 'listing_status'
      order by e.enumsortorder
    `;
    const statuses = enumRows.map(({ enumlabel }) => enumlabel);
    if (
      JSON.stringify(statuses) !==
      JSON.stringify(['draft', 'pending', 'published', 'rejected', 'archived'])
    ) {
      throw new Error('listing_status enum values do not match Phase 2');
    }

    targetReport = {
      hostname: parsed.hostname,
      projectId: identity.project_id,
      endpointId: identity.endpoint_id,
      database: identity.database_name,
      role: identity.database_role,
      migrationCount: migrations.length,
      tableCount: tableNames.size,
      indexes: requiredIndexes.length,
      constraints: 5,
      listingStatuses: statuses,
    };

    const imported = await import('../../src/app.js');
    app = imported.default;
  }, 30000);

  afterAll(async () => {
    await removeCreatedUsers();
  }, 30000);

  it('guards the Console-confirmed testing endpoint and Phase 2 schema', () => {
    expect(targetReport).toMatchObject({
      hostname: expectedTarget.hostname,
      projectId: expectedTarget.projectId,
      database: expectedTarget.database,
      role: expectedTarget.role,
      migrationCount: 3,
      listingStatuses: [
        'draft',
        'pending',
        'published',
        'rejected',
        'archived',
      ],
    });
  });

  it('runs the authenticated listing lifecycle and verifies persisted Neon state', async () => {
    const sellerARegistration = await signUp(emails.sellerA, 'seller');
    expect(sellerARegistration.status).toBe(201);
    const sellerAInitially = auth(sellerARegistration);
    const sellerAId = sellerARegistration.body.user.id;

    const sellerAUnverifiedDraft = await createListing(sellerAInitially);
    expect(sellerAUnverifiedDraft.status).toBe(201);
    const primaryId = sellerAUnverifiedDraft.body.listing.id;
    expect(sellerAUnverifiedDraft.body.listing.status).toBe('draft');
    const primaryInitially = await listingRow(primaryId);
    expect(primaryInitially.seller_id).toBe(sellerAId);
    expect(primaryInitially.asking_price).toBe('123456.78');
    expect(primaryInitially.annual_revenue).toBe('250000.00');
    expect(primaryInitially.ebitda).toBe('37500.25');
    expect(primaryInitially.created_at).toBeTruthy();
    expect(primaryInitially.updated_at).toBeTruthy();

    expect(
      (
        await withCsrf(
          request(app).post(`/api/listings/${primaryId}/submit`),
          sellerAInitially
        ).send({})
      ).status
    ).toBe(403);
    expect(
      (await request(app).post('/api/listings').send(listingInput())).status
    ).toBe(401);

    const verifiedSellerAId = await verify(sellerARegistration);
    expect(verifiedSellerAId).toBe(sellerAId);
    const sellerA = await signIn(emails.sellerA);

    const sellerBRegistration = await signUp(emails.sellerB, 'seller');
    const sellerBId = await verify(sellerBRegistration);
    const sellerB = await signIn(emails.sellerB);

    const buyerRegistration = await signUp(emails.buyer, 'buyer');
    const buyer = auth(buyerRegistration);
    expect(
      (
        await withCsrf(request(app).post('/api/listings'), buyer).send(
          listingInput()
        )
      ).status
    ).toBe(403);
    expect(
      (await request(app).get('/api/listings/mine').set('Cookie', buyer.cookie))
        .status
    ).toBe(403);

    const adminRegistration = await signUp(emails.admin, 'buyer');
    const adminId = adminRegistration.body.user.id;
    const [promoted] = await sql`
      update public.users set role = 'admin'
      where id = ${adminId} and email = ${emails.admin} and role = 'buyer'
      returning id
    `;
    expect(promoted?.id).toBe(adminId);
    const admin = await signIn(emails.admin);

    const noCsrf = await request(app)
      .post('/api/listings')
      .set('Cookie', sellerA.cookie)
      .send(listingInput());
    expect(noCsrf.status).toBe(403);
    for (const invalid of [
      { title: 'x' },
      listingInput({ asking_price: '-1' }),
      listingInput({ annual_revenue: '-0.01' }),
      listingInput({ ebitda: '1.999' }),
      listingInput({ currency: 'ZZZ' }),
      listingInput({ seller_id: sellerBId }),
      listingInput({ status: 'published' }),
    ]) {
      expect((await createListing(sellerA, invalid)).status).toBe(400);
    }
    await expect(sql`
      insert into public.business_listings
        (seller_id, title, description, asking_price, currency)
      values (${sellerAId}, ${`DB check ${runId}`}, 'Constraint probe listing', -1, 'USD')
    `).rejects.toThrow();
    await expect(sql`
      insert into public.business_listings
        (seller_id, title, description, asking_price, currency)
      values (${sellerAId}, ${`DB currency ${runId}`}, 'Constraint probe listing', 1, 'usd')
    `).rejects.toThrow();
    await expect(sql`
      insert into public.business_listings
        (seller_id, title, description, asking_price, currency)
      values (-1, ${`DB foreign key ${runId}`}, 'Constraint probe listing', 1, 'USD')
    `).rejects.toThrow();

    const myListings = await request(app)
      .get('/api/listings/mine?page=1&limit=20')
      .set('Cookie', sellerA.cookie);
    expect(myListings.status).toBe(200);
    expect(myListings.body.listings.some(item => item.id === primaryId)).toBe(
      true
    );

    expect((await request(app).get(`/api/listings/${primaryId}`)).status).toBe(
      404
    );
    expect(
      (
        await withCsrf(
          request(app).patch(`/api/listings/${primaryId}`),
          sellerB
        ).send({
          title: 'Attempted cross-owner update',
        })
      ).status
    ).toBe(404);
    expect(
      (
        await withCsrf(
          request(app).post(`/api/listings/${primaryId}/archive`),
          sellerB
        ).send({})
      ).status
    ).toBe(404);
    expect(
      (
        await withCsrf(
          request(app).delete(`/api/listings/${primaryId}`),
          sellerB
        )
      ).status
    ).toBe(404);

    const submitted = await withCsrf(
      request(app).post(`/api/listings/${primaryId}/submit`),
      sellerA
    ).send({});
    expect(submitted.status).toBe(200);
    expect(submitted.body.listing.status).toBe('pending');
    expect((await listingRow(primaryId)).status).toBe('pending');

    const rejectedDraft = await createListing(sellerA, {
      title: `Rejected path ${runId}`,
    });
    expect(rejectedDraft.status).toBe(201);
    const rejectedId = rejectedDraft.body.listing.id;
    const rejectedSubmit = await withCsrf(
      request(app).post(`/api/listings/${rejectedId}/submit`),
      sellerA
    ).send({});
    expect(rejectedSubmit.status).toBe(200);

    const sellerBListing = await createListing(sellerB, {
      title: `Seller B path ${runId}`,
    });
    expect(sellerBListing.status).toBe(201);
    const sellerBListingId = sellerBListing.body.listing.id;
    expect(
      (
        await withCsrf(
          request(app).post(`/api/listings/${sellerBListingId}/submit`),
          sellerB
        ).send({})
      ).status
    ).toBe(200);

    expect((await request(app).get('/api/admin/listings')).status).toBe(401);
    expect(
      (
        await request(app)
          .get('/api/admin/listings')
          .set('Cookie', sellerA.cookie)
      ).status
    ).toBe(403);
    const moderationQueue = await request(app)
      .get('/api/admin/listings?status=pending&page=1&limit=20')
      .set('Cookie', admin.cookie);
    expect(moderationQueue.status).toBe(200);
    expect(moderationQueue.body.listings.map(item => item.id)).toEqual(
      expect.arrayContaining([primaryId, rejectedId, sellerBListingId])
    );
    expect(moderationQueue.body.listings[0]).toHaveProperty('sellerId');
    expect(moderationQueue.body.pagination.total).toBeGreaterThanOrEqual(3);

    const pendingPageOne = await request(app)
      .get('/api/admin/listings?status=pending&page=1&limit=1')
      .set('Cookie', admin.cookie);
    const pendingPageTwo = await request(app)
      .get('/api/admin/listings?status=pending&page=2&limit=1')
      .set('Cookie', admin.cookie);
    expect(pendingPageOne.body.pagination.page).toBe(1);
    expect(pendingPageOne.body.pagination.limit).toBe(1);
    expect(pendingPageOne.body.pagination.totalPages).toBe(
      pendingPageOne.body.pagination.total
    );
    expect(pendingPageOne.body.listings).toHaveLength(1);
    expect(pendingPageTwo.body.listings).toHaveLength(1);
    expect(pendingPageTwo.body.listings[0].id).not.toBe(
      pendingPageOne.body.listings[0].id
    );

    const approvePrimary = await withCsrf(
      request(app).patch(`/api/admin/listings/${primaryId}/moderation`),
      admin
    ).send({ action: 'approve' });
    expect(approvePrimary.status).toBe(200);
    expect(approvePrimary.body.listing.status).toBe('published');
    expect(approvePrimary.body.listing.publishedAt).toBeTruthy();
    const primaryPublished = await listingRow(primaryId);
    expect(primaryPublished.published_at).toBeTruthy();
    expect(
      new Date(primaryPublished.updated_at).getTime()
    ).toBeGreaterThanOrEqual(new Date(primaryPublished.created_at).getTime());
    expect(
      (
        await withCsrf(
          request(app).delete(`/api/listings/${primaryId}`),
          sellerA
        )
      ).status
    ).toBe(409);

    const rejected = await withCsrf(
      request(app).patch(`/api/admin/listings/${rejectedId}/moderation`),
      admin
    ).send({ action: 'reject', rejectionReason: `Review ${runId}` });
    expect(rejected.status).toBe(200);
    expect(rejected.body.listing.status).toBe('rejected');
    expect(rejected.body.listing.rejectionReason).toBe(`Review ${runId}`);
    expect((await listingRow(rejectedId)).rejection_reason).toBe(
      `Review ${runId}`
    );
    expect((await request(app).get(`/api/listings/${rejectedId}`)).status).toBe(
      404
    );
    expect(
      (
        await withCsrf(
          request(app).delete(`/api/listings/${rejectedId}`),
          sellerA
        )
      ).status
    ).toBe(409);

    const editedRejected = await withCsrf(
      request(app).patch(`/api/listings/${rejectedId}`),
      sellerA
    ).send({ title: `Edited rejected ${runId}` });
    expect(editedRejected.status).toBe(200);
    expect(editedRejected.body.listing.status).toBe('rejected');
    expect(editedRejected.body.listing.rejectionReason).toBe(`Review ${runId}`);
    const resubmitted = await withCsrf(
      request(app).post(`/api/listings/${rejectedId}/submit`),
      sellerA
    ).send({});
    expect(resubmitted.body.listing.status).toBe('pending');
    expect(resubmitted.body.listing.rejectionReason).toBeNull();
    const approvedAgain = await withCsrf(
      request(app).patch(`/api/admin/listings/${rejectedId}/moderation`),
      admin
    ).send({ action: 'approve' });
    expect(approvedAgain.body.listing.status).toBe('published');

    const publishedList = await request(app).get(
      '/api/listings?page=1&limit=1'
    );
    const publishedPageTwo = await request(app).get(
      '/api/listings?page=2&limit=1'
    );
    expect(publishedList.status).toBe(200);
    expect(publishedList.body.pagination.page).toBe(1);
    expect(publishedList.body.pagination.limit).toBe(1);
    expect(publishedList.body.pagination.total).toBeGreaterThanOrEqual(2);
    expect(publishedList.body.pagination.totalPages).toBe(
      publishedList.body.pagination.total
    );
    expect(publishedList.body.listings).toHaveLength(1);
    expect(publishedPageTwo.body.listings).toHaveLength(1);
    for (const item of publishedList.body.listings) {
      expect(item).not.toHaveProperty('sellerId');
      expect(item).not.toHaveProperty('seller_id');
      expect(item).not.toHaveProperty('status');
      expect(item).not.toHaveProperty('rejectionReason');
      expect(item).not.toHaveProperty('rejection_reason');
    }
    const publicPrimary = await request(app).get(`/api/listings/${primaryId}`);
    expect(publicPrimary.status).toBe(200);
    expect(publicPrimary.body.listing).not.toHaveProperty('sellerId');
    expect(publicPrimary.body.listing).not.toHaveProperty('rejectionReason');

    const publishedEdit = await withCsrf(
      request(app).patch(`/api/listings/${primaryId}`),
      sellerA
    ).send({ title: `Edited published ${runId}` });
    expect(publishedEdit.status).toBe(200);
    expect(publishedEdit.body.listing.status).toBe('pending');
    const pendingAfterPublishedEdit = await listingRow(primaryId);
    expect(pendingAfterPublishedEdit.published_at).toBeNull();
    expect(
      new Date(pendingAfterPublishedEdit.updated_at).getTime()
    ).toBeGreaterThan(new Date(primaryInitially.updated_at).getTime());
    expect((await request(app).get(`/api/listings/${primaryId}`)).status).toBe(
      404
    );
    expect(
      (
        await withCsrf(
          request(app).delete(`/api/listings/${primaryId}`),
          sellerA
        )
      ).status
    ).toBe(409);
    const reapproved = await withCsrf(
      request(app).patch(`/api/admin/listings/${primaryId}/moderation`),
      admin
    ).send({ action: 'approve' });
    expect(reapproved.body.listing.status).toBe('published');
    expect((await request(app).get(`/api/listings/${primaryId}`)).status).toBe(
      200
    );

    const draftToDelete = await createListing(sellerA, {
      title: `Draft delete ${runId}`,
    });
    const draftId = draftToDelete.body.listing.id;
    const draftPage = await request(app)
      .get('/api/admin/listings?status=draft&page=1&limit=20')
      .set('Cookie', admin.cookie);
    expect(draftPage.status).toBe(200);
    expect(draftPage.body.listings.some(item => item.id === draftId)).toBe(
      true
    );
    expect(draftPage.body.pagination.total).toBeGreaterThanOrEqual(1);
    expect(
      (await withCsrf(request(app).delete(`/api/listings/${draftId}`), sellerA))
        .status
    ).toBe(200);
    expect(await listingRow(draftId)).toBeUndefined();

    const archive = await withCsrf(
      request(app).post(`/api/listings/${primaryId}/archive`),
      sellerA
    ).send({});
    expect(archive.status).toBe(200);
    expect(archive.body.listing.status).toBe('archived');
    expect((await listingRow(primaryId)).status).toBe('archived');
    expect((await request(app).get(`/api/listings/${primaryId}`)).status).toBe(
      404
    );
    expect(
      (
        await withCsrf(
          request(app).delete(`/api/listings/${primaryId}`),
          sellerA
        )
      ).status
    ).toBe(409);

    const beforeSellerDelete = await sql`
      select count(*)::int as count from public.business_listings
      where seller_id = ${sellerBId}
    `;
    expect(beforeSellerDelete[0].count).toBeGreaterThan(0);
    const deletedTestSeller = await sql`
      delete from public.users
      where id = ${sellerBId} and email = ${emails.sellerB}
      returning id
    `;
    expect(deletedTestSeller).toHaveLength(1);
    const afterSellerDelete = await sql`
      select count(*)::int as count from public.business_listings
      where seller_id = ${sellerBId}
    `;
    expect(afterSellerDelete[0].count).toBe(0);

    const persistedTestUsers = (
      await Promise.all(
        Object.values(emails).map(
          email => sql`
          select id, email, role, email_verified from public.users
          where email = ${email}
        `
        )
      )
    ).flat();
    expect(persistedTestUsers.map(user => user.email)).toEqual(
      expect.arrayContaining([emails.sellerA, emails.buyer, emails.admin])
    );
    expect(
      persistedTestUsers.find(user => user.email === emails.sellerA)
        .email_verified
    ).toBe(true);
    expect(
      persistedTestUsers.find(user => user.email === emails.admin).role
    ).toBe('admin');
    expect(
      persistedTestUsers.find(user => user.email === emails.buyer).role
    ).toBe('buyer');
  }, 120000);
});
