import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { cpus, totalmem } from 'node:os';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const databaseUrl =
  'postgresql://dealflow_perf:dealflow_perf@127.0.0.1:55432/dealflow_perf';
if (
  process.env.DEALFLOW_PERF_DATABASE_URL !== databaseUrl ||
  process.env.NODE_ENV === 'production'
) {
  throw new Error(
    'Set DEALFLOW_PERF_DATABASE_URL to the disposable localhost database.'
  );
}
Object.assign(process.env, {
  NODE_ENV: 'test',
  TEST_DATABASE_URL: databaseUrl,
  JWT_SECRET: 'synthetic-phase-12-secret-only-for-local-benchmarks',
  ARCJET_KEY: 'synthetic-arcjet-key',
  EMAIL_PROVIDER: 'mock',
  DOCUMENT_STORAGE_DRIVER: 'mock',
  ADMIN_MFA_REQUIRED: 'false',
  LISTING_VIEW_TRACKING_SINCE: '2020-01-01T00:00:00.000Z',
});

const mocks = new Map([
  ['#config/database.js', new URL('./database.js', import.meta.url).href],
  ['#config/arcjet.js', new URL('./arcjet.js', import.meta.url).href],
]);
if (['reliability', 'worker-lease'].includes(process.argv[2])) {
  mocks.set(
    '#services/email/email.adapter.js',
    new URL('./email.js', import.meta.url).href
  );
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(mocks.get(specifier) ?? specifier, context);
  },
});
const { db, pool, metrics, explainObservedQueries } =
  await import('./database.js');
const { hashPassword } = await import('#services/auth.service.js');

const password = 'Synthetic benchmark account 123!';
const origin = 'http://localhost:5173';
process.env.CORS_ORIGINS = origin;
let server;
try {
  const {
    rows: [instance],
  } = await pool.query(
    'SELECT current_database() AS name, current_user AS role, to_regclass(\'public.users\') AS users, version()'
  );
  if (instance.name !== 'dealflow_perf' || instance.role !== 'dealflow_perf') {
    throw new Error('Unexpected benchmark database identity.');
  }

  if (process.argv[2] === 'worker-lease') {
    const eventId = Number(process.argv[3]);
    if (!process.send || !Number.isSafeInteger(eventId) || eventId < 1) {
      throw new Error(
        'The interrupted worker fixture requires a parent process.'
      );
    }
    const { claimOutboxBatch, processClaimedEvent } =
      await import('#services/outbox.service.js');
    const { pauseNextEmail } = await import('./email.js');
    const [event] = await claimOutboxBatch(1, { eventId });
    if (!event)
      throw new Error('The interrupted worker could not acquire its lease.');
    pauseNextEmail(() => process.send(event));
    await processClaimedEvent(event);
  } else if (process.argv[2] === 'seed') {
    if (instance.users)
      throw new Error('Seeding requires a fresh disposable database.');
    await migrate(db, {
      migrationsFolder: new URL('../../drizzle', import.meta.url).pathname,
    });
    const seed = await readFile(new URL('./seed.sql', import.meta.url), 'utf8');
    const firstStatementEnd = seed.indexOf(';');
    await pool.query(seed.slice(0, firstStatementEnd), [
      await hashPassword(password),
    ]);
    await pool.query(seed.slice(firstStatementEnd + 1));
    const {
      createDeal,
      createOffer,
      respondToOffer,
      updateAcquisitionClosing,
    } = await import('#services/deal.service.js');
    const { processOutboxBatch } = await import('#services/outbox.service.js');
    for (let listingId = 1; listingId <= 50; listingId++) {
      if (listingId % 7 === 0 || listingId % 11 === 0) continue;
      const { deal } = await createDeal(1, listingId);
      const offer = await createOffer(deal.id, 1, {
        amount: '100000',
        currency: ['EUR', 'GBP', 'USD'][listingId % 3],
      });
      if (listingId % 13 === 0) {
        await respondToOffer(deal.id, offer.id, deal.seller_id, 'reject');
      } else if (listingId % 17 === 0 || listingId % 5 === 0) {
        await respondToOffer(deal.id, offer.id, deal.seller_id, 'accept');
        if (listingId % 17 === 0) {
          await updateAcquisitionClosing(deal.id, 1, {
            action: 'propose',
            revision: 0,
            amount: '100000',
          });
          await updateAcquisitionClosing(deal.id, deal.seller_id, {
            action: 'agree',
            revision: 1,
          });
          await updateAcquisitionClosing(deal.id, 1, {
            action: 'confirm',
            revision: 1,
            publicPriceConsent: false,
          });
          await updateAcquisitionClosing(deal.id, deal.seller_id, {
            action: 'confirm',
            revision: 1,
            publicPriceConsent: false,
          });
        }
      }
    }
    await processOutboxBatch(20);
    await pool.query('ANALYZE');
    const {
      rows: [counts],
    } = await pool.query(`
      SELECT
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM business_listings) AS listings,
        (SELECT count(*)::int FROM conversations) AS conversations,
        (SELECT count(*)::int FROM messages) AS messages,
        (SELECT count(*)::int FROM deals) AS deals,
        (SELECT count(*)::int FROM deals WHERE status = 'completed') AS "completedDeals",
        (SELECT count(*)::int FROM deal_offers) AS offers,
        (SELECT count(*)::int FROM buyer_saved_searches) AS "savedSearches",
        (SELECT count(*)::int FROM listing_view_events) AS "listingViews",
        (SELECT count(*)::int FROM notifications) AS notifications,
        (SELECT count(*)::int FROM outbox_events WHERE status = 'pending') AS "pendingJobs",
        (SELECT count(*)::int FROM outbox_events WHERE status = 'processed') AS "processedJobs"
    `);
    console.log(JSON.stringify({ seeded: counts }));
  } else {
    if (!instance.users) throw new Error('Run the seed command first.');
    const { default: app } = await import('../../src/app.js');
    if (process.argv[2] === 'reliability') {
      const { verifyReliability } = await import('./reliability.js');
      await verifyReliability(pool, app);
    } else if (process.argv[2] === 'browser-api') {
      server = app.listen(3000, '127.0.0.1');
      await once(server, 'listening');
      console.log('Disposable browser-test API listening on localhost:3000.');
      const shutdown = new globalThis.AbortController();
      for (const signal of ['SIGINT', 'SIGTERM']) {
        process.once(signal, () => shutdown.abort());
      }
      if (!shutdown.signal.aborted) await once(shutdown.signal, 'abort');
    } else {
      server = app.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const base = 'http://127.0.0.1:' + server.address().port;
      const request = (path, options) =>
        globalThis.fetch(base + path, {
          signal: globalThis.AbortSignal.timeout(10_000),
          ...options,
        });
      const login = async id => {
        const response = await request('/api/auth/sign-in', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin },
          body: JSON.stringify({
            email: 'perf-' + id + '@example.test',
            password,
          }),
        });
        await response.arrayBuffer();
        if (!response.ok)
          throw new Error(
            'Synthetic login failed with HTTP ' + response.status
          );
        return {
          Cookie: response.headers
            .getSetCookie()
            .map(cookie => cookie.split(';')[0])
            .join('; '),
        };
      };
      const buyer = await login(1);
      const seller = await login(10);
      const admin = await login(100);
      const {
        rows: [deal],
      } = await pool.query('SELECT min(id) AS id FROM deals');
      const routes = [
        ['browse', '/api/listings?limit=12'],
        [
          'filter',
          '/api/listings?q=Benchmark&industry=Software&location=London&minPrice=150000&sort=price_asc',
        ],
        ['detail', '/api/listings/1'],
        ['session', '/api/auth/me', buyer],
        ['seller listings', '/api/listings/mine', seller],
        ['seller analytics', '/api/seller/analytics/overview', seller],
        [
          'seller listing analytics',
          '/api/seller/analytics/listings/1',
          seller,
        ],
        ['favorites', '/api/favorites', buyer],
        ['saved searches', '/api/saved-searches', buyer],
        ['conversations', '/api/conversations', buyer],
        ['messages', '/api/conversations/1/messages', buyer],
        ['offers', '/api/deals/' + deal.id + '/offers', buyer],
        ['deals', '/api/deals', buyer],
        ['diligence', '/api/deals/' + deal.id + '/diligence', buyer],
        ['moderation', '/api/admin/listings', admin],
      ];
      if (process.env.DEALFLOW_PERF_AUTH_DETAIL === '1') {
        routes.push(['authenticated detail', '/api/listings/1', buyer]);
      }
      const mode = process.argv[2] ?? 'baseline';
      const stages = {
        smoke: [[1, 1, 0]],
        baseline: [[4, 12, 0]],
        load: [[20, 25, 125]],
        higher: [[100, 10, 125]],
        stress: [
          [10, 10, 50],
          [25, 10, 50],
          [50, 10, 50],
          [100, 10, 50],
        ],
        recovery: [
          [4, 8, 0],
          [100, 10, 25],
          [4, 8, 0],
        ],
        soak: [[20, 300, 250]],
      }[mode];
      if (!stages) throw new Error('Unknown benchmark scenario.');
      async function sample([name, path, headers], results) {
        const start = performance.now();
        let status;
        try {
          const response = await request(path, { headers });
          status = response.status;
          const body =
            status === 200
              ? await response.json()
              : await response.arrayBuffer();
          if (status === 200 && (!body || typeof body !== 'object'))
            status = 'invalid-body';
        } catch (error) {
          status = status === 200 ? 'invalid-body' : (status ?? error.name);
        }
        results.push({ name, status, ms: performance.now() - start });
      }
      if (
        mode === 'baseline' &&
        process.env.DEALFLOW_PERF_AUTH_DETAIL === '1'
      ) {
        routes.splice(0, routes.length - 1);
      }
      const warm = [];
      for (const route of routes) await sample(route, warm);
      if (warm.some(result => result.status !== 200)) {
        console.error(warm.filter(result => result.status !== 200));
        throw new Error('Benchmark endpoint verification failed.');
      }
      const round = n => Number(n.toFixed(3));
      const summarize = results => {
        const times = results.map(result => result.ms).sort((a, b) => a - b);
        const percentile = fraction =>
          round(times[Math.ceil(fraction * times.length) - 1]);
        const statuses = Object.fromEntries(
          [...new Set(results.map(result => result.status))].map(status => [
            status,
            results.filter(result => result.status === status).length,
          ])
        );
        return {
          requests: times.length,
          statuses,
          meanMs: round(times.reduce((sum, ms) => sum + ms, 0) / times.length),
          p50Ms: percentile(0.5),
          p95Ms: percentile(0.95),
          p99Ms: percentile(0.99),
        };
      };
      console.log(
        JSON.stringify({
          mode,
          node: process.version,
          cpu: cpus()[0]?.model,
          cores: cpus().length,
          totalMemory: totalmem(),
          postgres: instance.version,
          poolMax: 10,
        })
      );
      const countPendingJobs = async () => {
        const {
          rows: [row],
        } = await pool.query(
          'SELECT count(*)::int AS pending FROM outbox_events WHERE status = \'pending\''
        );
        return row.pending;
      };
      for (const [clients, seconds, pauseMs] of stages) {
        const pendingJobsBefore =
          mode === 'soak' ? await countPendingJobs() : undefined;
        const delay = monitorEventLoopDelay({ resolution: 10 });
        delay.enable();
        const cpu = process.cpuUsage();
        metrics.queries = 0;
        metrics.failures = 0;
        metrics.durationMs = 0;
        const results = [];
        let sequence = 0;
        let errors = 0;
        const start = performance.now();
        const checkpoints = [];
        const recordCheckpoint = () =>
          checkpoints.push({
            elapsedMs: round(performance.now() - start),
            rssBytes: process.memoryUsage().rss,
            poolConnections: pool.totalCount,
            poolIdleConnections: pool.idleCount,
            poolWaiting: pool.waitingCount,
          });
        const sampling =
          mode === 'soak' ? setInterval(recordCheckpoint, 30_000) : null;
        if (sampling) recordCheckpoint();
        await Promise.all(
          Array.from({ length: clients }, async () => {
            do {
              const index = sequence++;
              await sample(routes[index % routes.length], results);
              if (results.at(-1).status !== 200) errors++;
              if (pauseMs) await sleep(pauseMs);
            } while (
              (mode === 'smoke'
                ? sequence < routes.length
                : performance.now() - start < seconds * 1000) &&
              (results.length < 50 || errors / results.length < 0.1)
            );
          })
        );
        if (sampling) {
          clearInterval(sampling);
          recordCheckpoint();
        }
        const elapsed = performance.now() - start;
        const usage = process.cpuUsage(cpu);
        delay.disable();
        console.log(
          JSON.stringify({
            clients,
            elapsedMs: round(elapsed),
            pauseMs,
            rps: round((results.length * 1000) / elapsed),
            ...summarize(results),
            errorRate: errors / results.length,
            queriesPerRequest: round(metrics.queries / results.length),
            databaseFailures: metrics.failures,
            queryMsPerRequest: round(metrics.durationMs / results.length),
            rssBytes: process.memoryUsage().rss,
            cpuPercentOfOneCore: round(
              (usage.user + usage.system) / 10 / elapsed
            ),
            eventLoopP95Ms: round(delay.percentile(95) / 1e6),
            ...(sampling && { checkpoints, pendingJobsBefore }),
            endpoints: Object.fromEntries(
              routes.flatMap(([name]) => {
                const subset = results.filter(result => result.name === name);
                return subset.length ? [[name, summarize(subset)]] : [];
              })
            ),
          })
        );
        if (sampling) {
          console.log(
            JSON.stringify({ pendingJobsAfter: await countPendingJobs() })
          );
        }
        if (errors) process.exitCode = 1;
        if (errors / results.length >= 0.1 && mode !== 'recovery') break;
      }
      if (process.env.DEALFLOW_PERF_EXPLAIN === '1') {
        const planRoutes = [
          ['/api/listings/1/image', undefined, 404],
          ['/api/admin/users', admin, 200],
          ['/api/admin/reports', admin, 200],
          ['/api/admin/dashboard', admin, 200],
          ['/api/seller/analytics/comparison?ids=1,20', seller, 200],
        ];
        for (const [path, headers, status] of planRoutes) {
          const response = await request(path, { headers });
          await response.arrayBuffer();
          if (response.status !== status) {
            throw new Error('Query-plan probe failed for ' + path);
          }
        }
        await explainObservedQueries(/^\s*(select|with)\b/i);
      }
    }
  }
} finally {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await pool.end();
}
