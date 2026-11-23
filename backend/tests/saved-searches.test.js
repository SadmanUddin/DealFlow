import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { drizzle } from 'drizzle-orm/pglite';
import request from 'supertest';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

let engine;
let database;
const mail = vi.hoisted(() => vi.fn());
vi.mock('#services/email/email.adapter.js', () => ({ sendEmail: mail }));
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
const { authenticateUser, createSession, hashPassword } =
  await import('#services/auth.service.js');
const { processOutboxEvent, claimOutboxBatch, processClaimedEvent } =
  await import('#services/outbox.service.js');
const { getPublicListings } = await import('#services/listing.service.js');
let sessions;
const path = '/api/saved-searches';
const defaults = {
  name: 'Belgian technology',
  filters: { industry: 'Tech', location: 'Belgium' },
  alertsEnabled: true,
  frequency: 'instant',
};
const auth = (builder, id) =>
  builder
    .set('Cookie', `token=${sessions[id].accessToken}`)
    .set('X-CSRF-Token', sessions[id].csrfToken);
const create = (id, data = {}) =>
  auth(request(app).post(path), id).send({ ...defaults, ...data });
const select = async (query, args = []) =>
  (await engine.query(query, args)).rows;
const eventFor = async (type, id) =>
  (
    await select(
      'SELECT id, event_key AS "eventKey", type, payload, available_at AS "availableAt" FROM outbox_events WHERE type = $1 AND payload->>\'listingId\' = $2 ORDER BY id DESC LIMIT 1',
      [type, String(id)]
    )
  )[0];
const listing = async (title, status = 'draft', location = 'Belgium') =>
  (
    await select(
      `INSERT INTO business_listings(seller_id,title,description,industry,location,asking_price,currency,status)
   VALUES (3,$1,'Public description','Tech',$2,125000,'EUR',$3) RETURNING id`,
      [title, location, status]
    )
  )[0].id;
const publish = id =>
  engine.query(
    'UPDATE business_listings SET status = \'published\', published_at = clock_timestamp() WHERE id = $1',
    [id]
  );
const match = async id =>
  processOutboxEvent(await eventFor('saved_search.publication', id));

beforeAll(async () => {
  engine = new PGlite({ extensions: { pg_trgm } });
  database = drizzle(engine);
  const migrations = new URL('../drizzle/', import.meta.url);
  const journal = JSON.parse(
    readFileSync(new URL('meta/_journal.json', migrations), 'utf8')
  );
  for (const { tag } of journal.entries)
    await engine.exec(readFileSync(new URL(tag + '.sql', migrations), 'utf8'));
  const password = 'Saved-search-fixture-password';
  for (const [id, role] of [
    [1, 'buyer'],
    [2, 'buyer'],
    [3, 'seller'],
    [4, 'buyer'],
    [5, 'buyer'],
    [6, 'buyer'],
  ]) {
    await engine.query(
      'INSERT INTO users(id,name,email,password,role,email_verified) VALUES ($1,$2,$3,$4,$5,true)',
      [
        id,
        'Buyer <name>',
        `user${id}@example.test`,
        await hashPassword(password),
        role,
      ]
    );
  }
  sessions = Object.fromEntries(
    await Promise.all(
      [1, 2, 3, 4, 5, 6].map(async id => [
        id,
        await createSession(
          await authenticateUser({ email: `user${id}@example.test`, password })
        ),
      ])
    )
  );
}, 30000);

afterAll(async () => engine?.close());

it('protects ownership and CSRF and validates, creates, edits and deletes saved searches', async () => {
  expect((await request(app).get(path)).status).toBe(401);
  expect((await create(3)).status).toBe(403);
  expect(
    (
      await request(app)
        .post(path)
        .set('Cookie', `token=${sessions[1].accessToken}`)
        .send(defaults)
    ).status
  ).toBe(403);
  for (const filters of [
    { invalid: 'value' },
    { minPrice: 'not numeric', maxPrice: '10' },
    { minPrice: '9999999999999999.02', maxPrice: '9999999999999999.01' },
    {},
    { availability: 'invalid' },
  ]) {
    expect((await create(1, { filters })).status).toBe(400);
  }
  const result = await create(1, {
    name: '  Trial Search  ',
    filters: { location: ' Belgium ' },
  });
  expect(result.status).toBe(201);
  const saved = result.body.savedSearch;
  expect(saved).toMatchObject({
    name: 'Trial Search',
    filters: { location: 'Belgium', availability: 'available' },
  });
  const detail = path + '/' + saved.id;
  expect((await auth(request(app).get(detail), 2)).status).toBe(404);
  expect(
    (await auth(request(app).patch(detail), 2).send({ alertsEnabled: false }))
      .status
  ).toBe(404);
  expect((await auth(request(app).delete(detail), 2)).status).toBe(404);
  const edited = await auth(request(app).patch(detail), 1).send({
    frequency: 'weekly',
    alertsEnabled: false,
  });
  expect(edited.body.savedSearch).toMatchObject({
    alertsEnabled: false,
    frequency: 'weekly',
  });
  expect(
    (await auth(request(app).get(path), 1)).body.savedSearches
  ).toHaveLength(1);
  expect((await auth(request(app).delete(detail), 1)).status).toBe(204);
  expect((await auth(request(app).get(detail), 1)).status).toBe(404);
});

it('matches current publications only using marketplace semantics and dedupes parallel attempts and overlapping searches', async () => {
  const existing = await listing('Historic 100% SaaS', 'published');
  const a = await create(1, {
    name: '<Search>',
    filters: { ...defaults.filters, q: '100%', minPrice: '125000.00' },
  });
  expect(a.status).toBe(201);
  expect(
    (await create(1, { name: 'Overlap', frequency: 'weekly' })).status
  ).toBe(201);
  expect((await create(2, { frequency: 'off' })).status).toBe(201);
  expect((await create(4, { alertsEnabled: false })).status).toBe(201);
  expect(
    (await create(5, { filters: { availability: 'sold', industry: 'Tech' } }))
      .status
  ).toBe(201);
  expect((await create(6, { filters: { q: '100%' } })).status).toBe(201);
  expect(await eventFor('saved_search.publication', existing)).toBeUndefined();
  const draft = await listing('Draft 100% SaaS');
  const rejected = await listing('Rejected 100% SaaS', 'rejected');
  expect(await eventFor('saved_search.publication', draft)).toBeUndefined();
  expect(await eventFor('saved_search.publication', rejected)).toBeUndefined();
  await publish(draft);
  const publication = await eventFor('saved_search.publication', draft);
  expect(publication).toBeDefined();
  await Promise.all([
    processOutboxEvent(publication),
    processOutboxEvent(publication),
  ]);
  expect(
    (
      await getPublicListings({
        page: 1,
        limit: 20,
        industry: 'Tech',
        location: 'Belgium',
        q: '100%',
        minPrice: '125000.00',
      })
    ).listings.map(row => row.id)
  ).toContain(draft);
  const matches = await select(
    'SELECT * FROM saved_search_listing_matches WHERE listing_id = $1',
    [draft]
  );
  expect(matches).toHaveLength(4);
  const notices = await select(
    'SELECT user_id,payload FROM notifications WHERE type=\'saved_search.match\' AND payload->>\'listingId\'=$1 ORDER BY user_id',
    [String(draft)]
  );
  expect(notices.map(row => row.user_id)).toEqual([1, 2, 6]);
  expect(notices[0].payload.searchNames).toEqual(['<Search>', 'Overlap']);
  const [instant] = await select(
    'SELECT id,event_key AS "eventKey",type,payload FROM outbox_events WHERE event_key=$1',
    [`saved-search:instant:1:${draft}`]
  );
  mail.mockClear();
  await processOutboxEvent(instant);
  expect(mail).toHaveBeenCalledWith(
    expect.objectContaining({
      idempotencyKey: instant.eventKey,
      to: 'user1@example.test',
      html: expect.stringContaining('&lt;Search&gt;'),
    })
  );
  expect(mail.mock.calls[0][0].html).not.toContain('<Search>');
  await engine.query(
    'UPDATE business_listings SET status=\'suspended\' WHERE id=$1',
    [draft]
  );
  mail.mockClear();
  await processOutboxEvent(instant);
  expect(mail).not.toHaveBeenCalled();
  await publish(draft);
  await match(draft);
  expect(
    await select(
      'SELECT id FROM notifications WHERE type=\'saved_search.match\' AND payload->>\'listingId\'=$1',
      [String(draft)]
    )
  ).toHaveLength(3);

  const unavailable = await listing('Will be withdrawn');
  await publish(unavailable);
  await engine.query(
    'UPDATE business_listings SET status=\'suspended\' WHERE id=$1',
    [unavailable]
  );
  await match(unavailable);
  expect(
    await select(
      'SELECT listing_id FROM saved_search_listing_matches WHERE listing_id=$1',
      [unavailable]
    )
  ).toEqual([]);
});

it('does not backfill delayed publication jobs and cascades matches on deletion', async () => {
  const target = await listing('Operations business');
  await publish(target);
  const publication = await eventFor('saved_search.publication', target);
  expect(publication).toBeDefined();
  const newlySaved = await create(6, { filters: { q: 'Operations business' } });
  expect(newlySaved.status).toBe(201);
  await match(target);
  expect(
    await select(
      'SELECT listing_id FROM saved_search_listing_matches WHERE saved_search_id=$1',
      [newlySaved.body.savedSearch.id]
    )
  ).toEqual([]);
  await engine.query(
    'UPDATE business_listings SET title=\'Operations business updated\' WHERE id=$1',
    [target]
  );
  expect((await eventFor('saved_search.publication', target)).id).toBe(
    publication.id
  );
  const [ownedMatch] = await select(
    `SELECT s.id FROM buyer_saved_searches s JOIN saved_search_listing_matches m ON m.saved_search_id=s.id
     WHERE s.buyer_id=2 AND m.listing_id=$1`,
    [target]
  );
  expect(
    (await auth(request(app).delete(path + '/' + ownedMatch.id), 2)).status
  ).toBe(204);
  expect(
    await select(
      'SELECT listing_id FROM saved_search_listing_matches WHERE saved_search_id=$1',
      [ownedMatch.id]
    )
  ).toEqual([]);
});

it('groups daily and weekly deliveries in independent UTC buckets and retries with the same email key', async () => {
  expect((await create(4, { frequency: 'daily' })).status).toBe(201);
  expect((await create(5, { frequency: 'weekly' })).status).toBe(201);
  const one = await listing('Digest business A');
  const two = await listing('Digest business B');
  for (const id of [one, two]) {
    await publish(id);
    await match(id);
  }
  const jobs =
    await select(`SELECT id,event_key AS "eventKey",type,payload,available_at AS due FROM outbox_events
    WHERE event_key LIKE 'saved-search:daily:4:%' OR event_key LIKE 'saved-search:weekly:5:%' ORDER BY payload->>'frequency'`);
  expect(jobs).toHaveLength(2);
  expect(jobs.map(job => job.payload.frequency)).toEqual(['daily', 'weekly']);
  expect(jobs[0].due.toISOString().slice(11, 16)).toBe('00:05');
  expect(jobs[1].due.getUTCDay()).toBe(1);
  const [daily, weekly] = jobs;
  mail.mockClear();
  mail.mockRejectedValueOnce(new Error('fixture transient failure'));
  await engine.query(
    'UPDATE outbox_events SET available_at=now() WHERE id=$1',
    [daily.id]
  );
  const [claimed] = await claimOutboxBatch(1, { eventId: daily.id });
  await processClaimedEvent(claimed);
  expect(
    (
      await select('SELECT status FROM outbox_events WHERE id=$1', [daily.id])
    )[0].status
  ).toBe('pending');
  await engine.query(
    'UPDATE outbox_events SET available_at=now() WHERE id=$1',
    [daily.id]
  );
  const [retried] = await claimOutboxBatch(1, { eventId: daily.id });
  await processClaimedEvent(retried);
  expect(
    mail.mock.calls.slice(0, 2).map(([args]) => args.idempotencyKey)
  ).toEqual([daily.eventKey, daily.eventKey]);
  const delivered = mail.mock.calls[1][0];
  expect(delivered.text).toContain('Digest business A');
  expect(delivered.text).toContain('Digest business B');
  expect(delivered.text).toContain('/buyer/saved-searches');
  const late = await listing('Late digest business');
  await publish(late);
  await match(late);
  const [lateMatch] = await select(
    `SELECT m.delivery_key FROM saved_search_listing_matches m
     JOIN buyer_saved_searches s ON s.id=m.saved_search_id
     WHERE s.buyer_id=4 AND m.listing_id=$1`,
    [late]
  );
  expect(lateMatch.delivery_key).toMatch(/^saved-search:daily:4:/);
  expect(lateMatch.delivery_key).not.toBe(daily.eventKey);
  await engine.query(
    'INSERT INTO notification_email_preferences(user_id, listing_status) VALUES (5,false)'
  );
  mail.mockClear();
  await processOutboxEvent(weekly);
  expect(mail).not.toHaveBeenCalled();
  await engine.query(
    'UPDATE notification_email_preferences SET listing_status=true WHERE user_id=5'
  );
  await engine.query(
    'UPDATE business_listings SET status=\'suspended\' WHERE id=$1',
    [two]
  );
  await processOutboxEvent(weekly);
  expect(mail.mock.calls[0][0].text).toContain('Digest business A');
  expect(mail.mock.calls[0][0].text).not.toContain('Digest business B');
});
