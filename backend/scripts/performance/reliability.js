import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  createDeal,
  createOffer,
  linkDealDocument,
  respondToOffer,
  updateAcquisitionClosing,
} from '#services/deal.service.js';
import {
  createChecklistItem,
  updateChecklistItem,
  updateDocumentRequest,
  createDocumentRequest,
} from '#services/diligence.service.js';
import {
  claimOutboxBatch,
  failOutboxEvent,
  finishOutboxEvent,
  processClaimedEvent,
  processOutboxBatch,
} from '#services/outbox.service.js';
import {
  clearExpiredListingViewKeys,
  recordListingView,
} from '#services/listing-view.service.js';
import { matchSavedSearchPublication } from '#services/saved-search-alert.service.js';
import { getPublishedListing } from '#services/listing.service.js';
import { startConversation } from '#services/conversation.service.js';
import { closingActionSchema } from '#validations/deal.validation.js';
import {
  createChecklistSchema,
  createDocumentRequestSchema,
} from '#validations/diligence.validation.js';
import { emailFailures, failNextEmail } from './email.js';
import { explainObservedQueries } from './database.js';

const oneSuccess = async (operations, expectedCode) => {
  const results = await Promise.allSettled(operations);
  assert.equal(
    results.filter(result => result.status === 'fulfilled').length,
    1
  );
  const { reason } = results.find(result => result.status === 'rejected');
  assert.equal(reason.status, 409);
  if (expectedCode) assert.equal(reason.code, expectedCode);
  return results.find(result => result.status === 'fulfilled').value;
};

async function submitDuplicateOffers(pool, deal, buyer, offer) {
  const lock = await pool.connect();
  let submissions;
  try {
    await lock.query('BEGIN');
    await lock.query('SELECT id FROM deals WHERE id = $1 FOR UPDATE', [deal]);
    submissions = [
      createOffer(deal, buyer, offer),
      createOffer(deal, buyer, offer),
    ];
    // Both statements must have started before either can insert an offer.
    void Promise.allSettled(submissions);
    const deadline = Date.now() + 3000;
    let waiting = 0;
    while (waiting < 2 && Date.now() < deadline) {
      const {
        rows: [activity],
      } = await pool.query(`
        SELECT count(*)::int AS waiting
        FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock' AND query LIKE '%WITH deal_guard AS MATERIALIZED%'
      `);
      waiting = activity.waiting;
      if (waiting < 2) await sleep(20);
    }
    assert.equal(
      waiting,
      2,
      'Both submissions should be blocked by the deal lock'
    );
  } finally {
    try {
      await lock.query('ROLLBACK');
    } finally {
      lock.release();
    }
  }
  return oneSuccess(submissions, 'DUPLICATE_PENDING_OFFER');
}

export async function verifyReliability(pool, app) {
  const connections = await Promise.all([pool.connect(), pool.connect()]);
  try {
    const results = await Promise.all(
      connections.map(client => client.query('SELECT pg_backend_pid() AS pid'))
    );
    assert.notEqual(results[0].rows[0].pid, results[1].rows[0].pid);
  } finally {
    connections.forEach(client => client.release());
  }

  const seller = 10;
  const buyer = 1;
  const otherBuyer = 2;
  const uniqueKey = randomUUID();
  const {
    rows: [{ id: listingId, published_at: publishedAt }],
  } = await pool.query(
    `INSERT INTO business_listings
       (seller_id,title,description,industry,status,asking_price,currency,published_at)
     VALUES ($1,$2,'Synthetic reliability fixture','Software','published',125000,'EUR',clock_timestamp())
     RETURNING id,published_at`,
    [seller, 'Reliability ' + uniqueKey]
  );

  const first = (await createDeal(buyer, listingId)).deal.id;
  const second = (await createDeal(otherBuyer, listingId)).deal.id;
  const offer = { amount: '110000', currency: 'EUR' };
  const firstOffer = await submitDuplicateOffers(pool, first, buyer, offer);
  const counter = { ...offer, amount: '115000', parentOfferId: firstOffer.id };
  const sellerCounter = await oneSuccess([
    createOffer(first, seller, counter),
    createOffer(first, seller, counter),
  ]);
  await oneSuccess([
    respondToOffer(first, sellerCounter.id, buyer, 'accept'),
    respondToOffer(first, sellerCounter.id, buyer, 'accept'),
  ]);
  const secondOffer = await createOffer(second, otherBuyer, offer);
  await respondToOffer(second, secondOffer.id, seller, 'accept');

  const checklist = createChecklistSchema.parse({
    creationKey: randomUUID(),
    title: 'Review financials',
    category: 'financial',
    assignedTo: 'buyer',
  });
  await oneSuccess(
    [
      createChecklistItem(first, buyer, checklist),
      createChecklistItem(first, buyer, checklist),
    ],
    'DILIGENCE_CONFLICT'
  );
  const { rows: tasks } = await pool.query(
    'SELECT id FROM deal_checklist_items WHERE deal_id = $1 AND creation_key = $2',
    [first, checklist.creationKey]
  );
  assert.equal(tasks.length, 1);
  await oneSuccess([
    updateChecklistItem(first, buyer, tasks[0].id, {
      revision: 0,
      status: 'completed',
    }),
    updateChecklistItem(first, buyer, tasks[0].id, {
      revision: 0,
      status: 'blocked',
    }),
  ]);
  const documentRequest = createDocumentRequestSchema.parse({
    creationKey: randomUUID(),
    title: 'Request balance sheet',
  });
  await oneSuccess(
    [
      createDocumentRequest(first, buyer, documentRequest),
      createDocumentRequest(first, buyer, documentRequest),
    ],
    'DILIGENCE_CONFLICT'
  );
  const { rows: requests } = await pool.query(
    'SELECT id FROM deal_document_requests WHERE deal_id = $1 AND creation_key = $2',
    [first, documentRequest.creationKey]
  );
  assert.equal(requests.length, 1);
  const { conversation } = await startConversation(buyer, listingId);
  const {
    rows: [document],
  } = await pool.query(
    `INSERT INTO conversation_documents
       (conversation_id,uploaded_by,storage_key,original_filename,mime_type,size_bytes,sha256,status)
     VALUES ($1,$2,$3,'fixture.pdf','application/pdf',100,repeat('a',64),'available')
     RETURNING id`,
    [conversation.id, seller, 'perf/' + uniqueKey]
  );
  await linkDealDocument(first, seller, document.id);
  const submission = { action: 'submit', revision: 0, documentId: document.id };
  await oneSuccess(
    [
      updateDocumentRequest(first, seller, requests[0].id, submission),
      updateDocumentRequest(first, seller, requests[0].id, submission),
    ],
    'DILIGENCE_CONFLICT'
  );
  const {
    rows: [submitted],
  } = await pool.query(
    'SELECT status, revision, document_id FROM deal_document_requests WHERE id = $1',
    [requests[0].id]
  );
  assert.deepEqual(submitted, {
    status: 'submitted',
    revision: 1,
    document_id: document.id,
  });
  await assert.rejects(() =>
    updateChecklistItem(first, 3, tasks[0].id, {
      revision: 1,
      status: 'completed',
    })
  );

  const act = (id, actor, action, revision, extra) =>
    updateAcquisitionClosing(
      id,
      actor,
      closingActionSchema.parse({ action, revision, ...extra })
    );
  for (const [deal, actor] of [
    [first, buyer],
    [second, otherBuyer],
  ]) {
    await act(deal, actor, 'propose', 0, { amount: '115000' });
    await act(deal, seller, 'agree', 1);
    await act(deal, actor, 'confirm', 1, { publicPriceConsent: false });
  }
  await oneSuccess([
    act(first, seller, 'confirm', 1, { publicPriceConsent: true }),
    act(second, seller, 'confirm', 1, { publicPriceConsent: true }),
  ]);
  const { rows: completed } = await pool.query(
    'SELECT id FROM deals WHERE listing_id = $1 AND status = \'completed\'',
    [listingId]
  );
  assert.equal(completed.length, 1);
  const listing = await getPublishedListing(listingId);
  assert.equal(listing.status, 'sold');
  assert.equal(listing.publicSalePrice, null);

  const {
    rows: [parallelListing],
  } = await pool.query(
    `INSERT INTO business_listings
       (seller_id,title,description,status,asking_price,currency,published_at)
     VALUES ($1,$2,'Synthetic mutual closing fixture','published',125000,'EUR',clock_timestamp())
     RETURNING id`,
    [seller, 'Mutual closing ' + uniqueKey]
  );
  const parallel = (await createDeal(buyer, parallelListing.id)).deal.id;
  const parallelOffer = await createOffer(parallel, buyer, offer);
  await respondToOffer(parallel, parallelOffer.id, seller, 'accept');
  await act(parallel, buyer, 'propose', 0, { amount: '110000' });
  await act(parallel, seller, 'agree', 1);
  await Promise.all([
    act(parallel, buyer, 'confirm', 1, { publicPriceConsent: true }),
    act(parallel, seller, 'confirm', 1, { publicPriceConsent: true }),
  ]);
  const mutuallySold = await getPublishedListing(parallelListing.id);
  assert.equal(mutuallySold.status, 'sold');
  assert.equal(mutuallySold.publicSalePrice, '110000.00');
  const {
    rows: [completionEffects],
  } = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM deal_activities WHERE deal_id = $1 AND event_type = 'deal.status_changed' AND metadata->>'to' = 'completed') AS activities,
       (SELECT count(*)::int FROM notifications WHERE type = 'deal.completed' AND payload->>'dealId' = $2) AS notifications`,
    [parallel, String(parallel)]
  );
  assert.deepEqual(completionEffects, { activities: 1, notifications: 2 });

  const viewer = { id: buyer, role: 'buyer', emailVerified: true };
  const options = { since: '2020-01-01', secret: uniqueKey };
  await Promise.all(
    Array.from({ length: 12 }, () =>
      recordListingView(listingId, viewer, options)
    )
  );
  await recordListingView(
    listingId,
    viewer,
    options,
    new Date('2020-02-02T12:00:00Z')
  );
  await clearExpiredListingViewKeys();
  const { rows: views } = await pool.query(
    'SELECT viewer_key FROM listing_view_events WHERE listing_id = $1 ORDER BY viewed_on',
    [listingId]
  );
  assert.equal(views.length, 2);
  assert.equal(views[0].viewer_key, null);
  assert.ok(views[1].viewer_key);

  // Use a new public listing so matching runs against an eligible listing.
  const {
    rows: [{ id: publicId }],
  } = await pool.query(
    `INSERT INTO business_listings
       (seller_id,title,description,industry,status,asking_price,currency,published_at)
     VALUES ($1,$2,'Synthetic matching fixture','Software','published',125000,'EUR',clock_timestamp())
     RETURNING id`,
    [seller, 'Search ' + uniqueKey]
  );
  const {
    rows: [{ id: searchId }],
  } = await pool.query(
    `INSERT INTO buyer_saved_searches (buyer_id,name,filters,frequency,active_since)
     VALUES (3,$1,'{"industry":"Software","availability":"available"}','instant',$2) RETURNING id`,
    [uniqueKey, publishedAt]
  );
  const {
    rows: [{ payload }],
  } = await pool.query(
    'SELECT payload FROM outbox_events WHERE type = \'saved_search.publication\' AND payload->>\'listingId\' = $1',
    [String(publicId)]
  );
  await Promise.all([
    matchSavedSearchPublication(payload),
    matchSavedSearchPublication(payload),
  ]);
  const { rows: matches } = await pool.query(
    'SELECT 1 FROM saved_search_listing_matches WHERE saved_search_id = $1 AND listing_id = $2',
    [searchId, publicId]
  );
  assert.equal(matches.length, 1);
  const {
    rows: [matchEffects],
  } = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM notifications WHERE dedupe_key = $1) AS notifications,
       (SELECT count(*)::int FROM outbox_events WHERE event_key = $2) AS emails`,
    ['saved-search:listing:3:' + publicId, 'saved-search:instant:3:' + publicId]
  );
  assert.deepEqual(matchEffects, { notifications: 1, emails: 1 });

  const eventKey = 'perf:' + uniqueKey;
  const {
    rows: [{ id: eventId }],
  } = await pool.query(
    `INSERT INTO outbox_events (event_key,type,payload)
     VALUES ($1,'listing.details_changed',jsonb_build_object('listingId',$2::integer,'title','Fixture','userIds',jsonb_build_array(1),'detailsChanged',true))
     RETURNING id`,
    [eventKey, listingId]
  );
  const interrupted = fork(
    new URL('./run.js', import.meta.url),
    ['worker-lease', String(eventId)],
    { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] }
  );
  const exited = once(interrupted, 'exit');
  let original;
  try {
    [original] = await once(interrupted, 'message', {
      signal: globalThis.AbortSignal.timeout(5000),
    });
    assert.equal(original.id, eventId);
    const claims = await Promise.all(
      Array.from({ length: 4 }, () => claimOutboxBatch(1, { eventId }))
    );
    assert.deepEqual(claims.flat(), []);
  } finally {
    interrupted.kill('SIGKILL');
    const [, signal] = await exited;
    assert.equal(signal, 'SIGKILL');
  }
  await pool.query(
    'UPDATE outbox_events SET locked_at = now() - interval \'61 seconds\' WHERE id = $1',
    [eventId]
  );
  const [replacement] = await claimOutboxBatch(1, { eventId });
  assert.notEqual(original.lockToken, replacement.lockToken);
  assert.equal(await finishOutboxEvent(original), false);
  assert.equal(
    await failOutboxEvent(original, new Error('Stale worker')),
    false
  );
  failNextEmail();
  await processClaimedEvent(replacement);
  assert.equal(emailFailures(), 1);
  const {
    rows: [delayed],
  } = await pool.query(
    'SELECT status, available_at > now() AS delayed FROM outbox_events WHERE id = $1',
    [eventId]
  );
  assert.deepEqual(delayed, { status: 'pending', delayed: true });
  assert.deepEqual(await claimOutboxBatch(1, { eventId }), []);
  await pool.query(
    'UPDATE outbox_events SET available_at = now() WHERE id = $1',
    [eventId]
  );
  const [retry] = await claimOutboxBatch(1, { eventId });
  await Promise.all([processClaimedEvent(retry), processClaimedEvent(retry)]);
  const {
    rows: [processed],
  } = await pool.query(
    `SELECT status, (SELECT count(*)::int FROM notifications WHERE dedupe_key = $2) AS notifications
     FROM outbox_events WHERE id = $1`,
    [eventId, eventKey + ':user:1']
  );
  assert.deepEqual(processed, { status: 'processed', notifications: 1 });

  await pool.query(
    `INSERT INTO outbox_events (event_key,type,payload)
     SELECT $1 || ':' || n, 'listing.details_changed',
            jsonb_build_object('listingId',$2::integer,'title','Backlog','userIds',jsonb_build_array())
     FROM generate_series(1,200) n`,
    ['backlog:' + uniqueKey, listingId]
  );
  if (process.env.DEALFLOW_PERF_EXPLAIN === '1') {
    const firstBatch = await claimOutboxBatch();
    await explainObservedQueries(
      /FOR UPDATE SKIP LOCKED|WITH listing_scope AS MATERIALIZED|^\s*UPDATE listing_view_events/i
    );
    await Promise.all(firstBatch.map(processClaimedEvent));
  }
  while (
    (await Promise.all([processOutboxBatch(), processOutboxBatch()])).some(
      Boolean
    )
  ) {
    // Both worker loops drain the disposable queue.
  }
  const {
    rows: [backlog],
  } = await pool.query(
    'SELECT count(*)::int AS total FROM outbox_events WHERE event_key LIKE $1 AND status = \'processed\'',
    ['backlog:' + uniqueKey + ':%']
  );
  assert.equal(backlog.total, 200);

  const interruptedTransaction = await pool.connect();
  const interruptedKey = 'perf:interrupted:' + uniqueKey;
  try {
    const {
      rows: [connection],
    } = await interruptedTransaction.query('SELECT pg_backend_pid() AS pid');
    await interruptedTransaction.query('BEGIN');
    await interruptedTransaction.query(
      `INSERT INTO outbox_events (event_key,type,payload)
       VALUES ($1,'listing.details_changed','{}')`,
      [interruptedKey]
    );
    interruptedTransaction.on('error', () => {});
    const cancelled = assert.rejects(
      interruptedTransaction.query('SELECT pg_sleep(30)')
    );
    const {
      rows: [termination],
    } = await pool.query('SELECT pg_terminate_backend($1) AS terminated', [
      connection.pid,
    ]);
    assert.equal(termination.terminated, true);
    await cancelled;
  } finally {
    interruptedTransaction.release(true);
  }
  const { rows: interruptedRows } = await pool.query(
    'SELECT 1 FROM outbox_events WHERE event_key = $1',
    [interruptedKey]
  );
  assert.deepEqual(interruptedRows, []);

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const held = await Promise.all(
      Array.from({ length: pool.options.max }, () => pool.connect())
    );
    try {
      const [ready, health] = await Promise.all([
        globalThis.fetch(base + '/ready'),
        globalThis.fetch(base + '/health'),
        assert.rejects(() => processOutboxBatch()),
      ]);
      assert.equal(ready.status, 503);
      assert.deepEqual(await ready.json(), { status: 'unavailable' });
      assert.equal(health.status, 200);
      await health.arrayBuffer();
    } finally {
      held.forEach(client => client.release());
    }
    const ready = await globalThis.fetch(base + '/ready');
    assert.equal(ready.status, 200);
    await ready.arrayBuffer();
    await assert.rejects(pool.query('SELECT pg_sleep(6)'), { code: '57014' });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  console.log(
    'PostgreSQL reliability checks passed: concurrent offers, closing, diligence, matching, view deduplication, outbox retry and recovery, backlog, connection interruption, readiness, statement timeout.'
  );
}
