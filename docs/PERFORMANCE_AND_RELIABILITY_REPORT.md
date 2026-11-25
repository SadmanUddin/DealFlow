# Phase 12 performance and reliability

## Summary

DealFlow now validates the session once on signed-in listing details, shares the unread notification query across the buyer dashboard and workspace, and cancels superseded marketplace requests. Public images revalidate against current listing visibility and can return HTTP 304 without downloading the R2 object. The outbox waits for sibling workers to settle when one task cannot record its result.

All benchmark work used a disposable PostgreSQL database and synthetic accounts. Neon, Resend and R2 were outside the benchmark environment.

## Architecture and bottlenecks

- **HTTP and security.** Express validates the session before cache policy, Arcjet and router authorization. CSRF remains mandatory on protected writes. Listing details also invoked the same authentication middleware inside the listing router. Removing that duplicate saves one session database lookup and one JWT verification per signed-in detail. Request IDs now cover parsing and CORS failures. Winston logs HTTP status, normalized route and full request duration, with a warning at one second. Completed outbox jobs log type, attempt and duration.
- **Database and pagination.** Production uses a reused Neon HTTP driver client in each process. The API and worker share configuration and make independent HTTP calls from their respective processes. Readiness already has a 1.5-second probe deadline. Node sets header and request-body timeouts and drains connections on shutdown. The production driver, timeout configuration and transaction boundaries remain as configured. Existing marketplace and workspace pagination is bounded, with ID tie breakers on marketplace sorts and cursor pagination for message history.
- **Search and workspaces.** The review included search criteria and indexes, listing image metadata, seller aggregation, buyer dashboard requests, favorites, saved searches, admin moderation, conversations, offers, deals and diligence. Search uses existing B-tree and trigram indexes. Seller analytics uses a shared, ownership-filtered SQL aggregation. Conversations rank eligible rows by latest message and then page the results. Their plans and existing indexes suited the measured dataset. The measured workload supported retaining the existing indexes.
- **Worker.** The worker already uses PostgreSQL `FOR UPDATE SKIP LOCKED`, expiring leases, renewal and fencing, bounded backoff, deduplication, and dead-letter state. If recording an outcome fails, the batch now waits for sibling work before propagating the error. Saved-search publication matching, digest scheduling and analytics-key cleanup use existing database rules.
- **Browser.** Vite already splits routes and keeps Recharts out of public navigation. Account preference validation now loads with the Account route, decoupling Zod from the entry graph. TanStack Query continues to clear private queries on account transitions. The buyer dashboard and navigation share one unread query, and opening a conversation refreshes the list when messages change or the cached conversation still has unread messages. Existing image dimensions, placeholders and below-fold lazy loading were retained.

## Environment and dataset

| Item | Configuration |
| --- | --- |
| Host | Apple M2, 8 logical CPUs, 8 GiB RAM, macOS 26.2 |
| Toolchain | Node 24.22.3, npm 11.19.1, Vite 7.3.8, Chrome 158.0.8127.37 |
| Database | PostgreSQL 17.12 ARM64 on local Docker, `pg` TCP adapter, 10 connections, 1.5 s acquisition deadline, 5 s SQL statement timeout |
| Migration | Paired read trials through 0024. Upgrade and fresh install through 0025 verified locally. |
| Fixtures | 100 users, 500 listings, 500 conversations, 5,000 messages, 39 deals including 2 completed, 39 offers, 500 saved searches, 10,000 views, 5,154 notifications, 122 pending and 20 processed jobs |
| Workload | 15 read routes, equal request distribution, one warm-up request per route, session cookies established before timings, 4 clients for 12 seconds per baseline trial |
| Integrations | Application cookies, JWT and session SQL are active. Arcjet decisions, email and document storage are mocked for the benchmark. Admin MFA enforcement is disabled for the synthetic admin session. Test mode mutes the Winston transport. |
| Metrics | End-to-end latency includes JSON parsing. SQL time includes local driver and pool queue time. RSS, CPU and event-loop delay cover the Node API and generator process together. |

Fixtures include multiple owners and buyers, published, draft, pending and sold listings, four industries, three locations, different prices and currencies, several offer states and UTC-dated events. The synthetic dashboard buyer carries more data than a typical account. Fixture IDs and relationships follow a repeatable formula. Timestamps are relative to the seed time.

## Backend benchmarks

| Metric | Before | After | Unit |
| --- | ---: | ---: | --- |
| Mixed mean | 3.10 | 3.06 | ms |
| Mixed p50 | 2.77 | 2.76 | ms |
| Mixed p95 | 5.60 | 5.52 | ms |
| Mixed p99 | 7.43 | 7.07 | ms |
| Marketplace browse p95 | 3.01 | 2.93 | ms |
| Marketplace filter p95 | 3.65 | 3.36 | ms |
| Public listing detail p95 | 2.55 | 2.42 | ms |
| Seller analytics overview p95 | 7.12 | 6.98 | ms |
| Mixed throughput | 1,290 | 1,309 | requests/s |
| Mixed database calls per request | 2.47 | 2.47 | calls |
| Mixed database time per request | 2.67 | 2.62 | ms |
| Mixed RSS at end | 376 | 410 | MiB |
| Mixed Node CPU | 99.8 | 99.0 | % of one core |
| Mixed event loop p95 | 10.46 | 10.47 | ms |
| Signed-in listing detail p95 | 4.06 | 3.35 | ms |
| Signed-in listing throughput | 1,342 | 1,775 | requests/s |
| Signed-in listing database calls per request | 3 | 2 | calls |
| Signed-in listing database time per request | 2.05 | 1.50 | ms |
| Unexpected HTTP error rate | 0 | 0 | % |

The table averages the two per-trial statistics. Signed-in detail p95 fell 17.4%, with both runs improving. Throughput rose 32.2% on that focused workload. Mixed traffic p95 changed by about 1%, with virtually identical database calls per request. Mixed RSS ranged from 353–399 MiB before and 386–434 MiB after. These variable end-of-run samples do not establish a memory improvement.

A separate pair repeated the workloads on a freshly seeded schema through migration 0025. Signed-in detail p95 was 3.99 → 3.17 ms and mixed p95 was 5.67 → 5.55 ms. Signed-in database calls remained 3 → 2. Both smoke and real PostgreSQL reliability checks passed on that fresh schema.

### Load and recovery

| Scenario | Clients | Elapsed | HTTP requests | Requests/s | p95 | p99 | Error rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Smoke | 1 | 0.04 s | 15 | 335 | 7.95 ms | 7.95 ms | 0.0% |
| Moderate | 20 | 25.12 s | 3,700 | 147 | 18.48 ms | 28.33 ms | 0.0% |
| Higher | 100 | 10.12 s | 7,706 | 761 | 12.26 ms | 55.22 ms | 0.0% |
| Stress 1 | 10 | 10.05 s | 1,745 | 174 | 14.14 ms | 26.79 ms | 0.0% |
| Stress 2 | 25 | 10.05 s | 4,605 | 458 | 8.83 ms | 22.36 ms | 0.0% |
| Stress 3 | 50 | 10.05 s | 9,204 | 916 | 10.02 ms | 27.79 ms | 0.0% |
| Stress 4 | 100 | 10.06 s | 14,837 | 1475 | 45.78 ms | 96.19 ms | 0.0% |
| Recovery 1 | 4 | 8.00 s | 9,317 | 1164 | 6.15 ms | 12.70 ms | 0.0% |
| Recovery 2 | 100 | 10.05 s | 15,817 | 1574 | 63.63 ms | 89.99 ms | 0.0% |
| Recovery 3 | 4 | 8.00 s | 11,188 | 1398 | 5.24 ms | 6.94 ms | 0.0% |
| Soak | 20 | 300.24 s | 22,720 | 76 | 24.08 ms | 37.85 ms | 0.0% |

The five-minute soak used 250 ms pauses. Node RSS started at 336 MiB, reached 308 MiB at the one-minute checkpoint and finished at about 313 MiB. The pool grew from two to ten connections. All ten were idle at the final checkpoint, with no queued acquisitions. The outbox stayed at 122 pending jobs during this read-only test with the worker stopped. Backlog processing was verified separately. This run covers five minutes of local operation.

The 100-client recovery burst increased p95 from 6.15 ms to 63.63 ms. After reducing load, p95 returned to 5.24 ms. The Node process reached about one full CPU core in the unpaced baseline and during peak stress. The 100-client test did not reach the error cutoff, so a saturation point could not be established.

The isolated targets were met. At the highest recovery burst, the public listing detail, search and seller analytics p95 values were 35.00, 35.45 and 65.02 ms, below the respective 300, 500 and 800 ms targets. No unexpected HTTP or transaction failures were observed in the completed scenarios. Authorization and data integrity assertions passed for the tested cases.

### Query plans and database decisions

PostgreSQL ran `EXPLAIN (ANALYZE, BUFFERS)` on SQL captured from the application smoke pass. Results below are one execution on warm local data. Times are PostgreSQL execution time and exclude planning and driver overhead.

| Statement | Execution | Shared buffer hits |
| --- | ---: | ---: |
| Public listing page | 0.071 ms | 29 |
| Search page with industry, location and price filters | 0.328 ms | 72 |
| Matching count for filtered search | 0.211 ms | 69 |
| Public listing detail | 0.056 ms | 5 |
| Active-session SQL | 0.020 ms | 4 |
| Seller analytics overview | 2.465 ms | 93 |
| Seller analytics for one listing | 0.715 ms | 15 |
| Conversation page | 0.936 ms | 1,057 |
| Messages page | 0.096 ms | 18 |
| Deals page | 0.238 ms | 136 |
| Diligence overview | 0.147 ms | 7 |
| Admin moderation listing page | 0.285 ms | 69 |

Favorites, saved searches, offer rows and pagination counts were also captured. The conversation plan made one indexed latest-message lookup per eligible conversation when sorting, with roughly 390 candidates in the measured buyer account. This is the first query to revisit if larger inboxes dominate the workload. Existing listing and message indexes and the 0024 view-event indexes supported the measured reads. Follow-up probes exercised image metadata at 0.028 ms, admin user retrieval at 0.108 ms and two-listing comparison at 1.808 ms. Reports were empty in this seed. Under a local backlog, claiming 20 jobs took 0.326 ms and used the existing outbox index. Saved-search matching took 2.678 ms for a previously matched publication. Analytics key cleanup used the 0024 partial index and took 0.027 ms after eligible keys had been cleared. Worker write plans were run in transactions that rolled back. Deep offsets, high-cardinality sellers and live storage latency remain follow-up measurement areas.

Migration 0024 depends on the existing listing table and adds a view event table, foreign key, unique daily viewer key and partial cleanup index. Its application status on Neon remains unverified.

Migration 0025 adds an invoker-rights helper that checks pending offers after the existing deal-row lock is acquired. PostgreSQL VOLATILE SQL functions obtain a fresh snapshot for each query they execute. The helper lets a waiting submission see the offer that won the lock without moving side effects outside the existing transaction. [PostgreSQL function volatility](https://www.postgresql.org/docs/17/xfunc-volatility.html)

Both contenders were held behind the same lock before either could write. The original backend accepted both submissions. With 0025 and the updated service, one insert succeeded and the other returned `DUPLICATE_PENDING_OFFER`. The migration adds a function and leaves historical records and indexes in place. Its production rollout requires applying 0025 before starting the new API. For rollback, restore the previous API before removing the function. Both upgrade and fresh installation were verified on disposable PostgreSQL. Neon migrations remain untouched.

## Browser and bundle

| Build artifact | Before | After |
| --- | ---: | ---: |
| Initial static JavaScript | 579,923 B | 496,599 B |
| Initial static JavaScript, gzip | 182,810 B | 159,899 B |
| Initial static JavaScript, Brotli | 158,458 B | 138,670 B |
| All JavaScript, raw | 1,507,345 B | 1,510,512 B |
| All JavaScript, gzip | 481,207 B | 483,235 B |
| All JavaScript, Brotli | 415,398 B | 418,108 B |
| Entire production build, raw | 3,459,917 B | 3,463,084 B |

The manifest's initial graph shrank 14.4% raw and 12.5% gzip. Public routes use Zod when they validate listing data. Chrome therefore fetched the deferred schema chunk on those routes, and actual route transfer rose slightly. The change reduces static startup dependencies and adds a small route transfer cost. The browser timings below varied between viewports and individual navigations.

| Route | Own chunk before / after, raw | Chrome JS transfer before / after | Initial API requests before / after |
| --- | ---: | ---: | ---: |
| Homepage | 10,230 / 10,260 B | 204,946 / 205,847 B | 3 / 3 |
| Marketplace | 18,430 / 18,502 B | 209,037 / 211,041 B | 2 / 2 |
| Listing detail | 15,928 / 15,998 B | 204,062 / 206,087 B | 2 / 2 |
| Buyer overview | 6,688 / 6,745 B | 212,277 / 214,320 B | 9 / 8 |
| Buyer conversation | Shared chunk | 201,238 / 203,244 B | 7 / 6 |
| Deal room | 61,358 / 61,429 B | 245,069 / 247,203 B | 12 / 12 |
| Seller analytics | 49,011 / 49,072 B | 335,386 / 337,457 B | 5 / 5 |
| Admin overview | 55,879 / 55,940 B | 338,313 / 340,346 B | 4 / 4 |

Headless Chromium verified home, marketplace, filtered results, listing detail, buyer overview, inbox, deal room, seller overview, seller analytics and administrator overview at 375, 768 and 1440 px. All checks fit their viewports. The browser also showed the marketplace error state while API requests were blocked and returned to listing results on recovery. At 1440 px, first contentful paint was 56 → 56 ms on the marketplace, 48 → 44 ms on listing detail and 28 → 40 ms on buyer overview. The baseline and final production builds used the same local API and Chrome with cache disabled. These are local samples without Lighthouse, render profiling or network throttling.

## Cache and security

Public listing JSON continues to require revalidation. Signed-in detail uses `Vary: Cookie` and `private, no-store`. Public listing images use opaque ETags derived from their immutable object key. A conditional request checks current listing visibility before it can return HTTP 304. An image that becomes unavailable to the caller returns HTTP 404 with `no-store`. A regression test observed one storage read across the original download, a cache revalidation and a withdrawal. Private images, documents, buyer workspaces, seller analytics and admin responses retain private cache rules. The benchmark never reads live objects.

The automated suite covers auth and authorization, administrator MFA and revocation, CSRF, Arcjet decisions, validation, listing visibility, private document access and quarantine, analytics ownership, sale-price consent, and private cache isolation. The browser checks use synthetic sessions and do not exercise production cookie and Arcjet deployment settings.

## Reliability and failure recovery

- Real PostgreSQL tests confirmed distinct database sessions. Concurrent duplicate offers, counteroffers and acceptance produced one successful write after the duplicate-offer fix. Competing closings on the same listing produced one completed acquisition and a sold listing. Simultaneous buyer and seller confirmations on one deal produced one completion record and one notification per participant. Price disclosure followed both consent cases.
- Concurrent checklist creation, revision changes, document request creation and document submission preserved one successful write per conflict. A nonparticipant could not edit the checklist. Saved-search publication generated one match, notification and email job under concurrent execution. Twelve concurrent view writes produced one deduplicated event, and cleanup preserved counts while removing expired viewer keys.
- Concurrent worker claims yielded one lease. An expired lease was reclaimed and the stale worker could neither finish nor requeue the event. A mocked email failure scheduled backoff, followed by a successful retry. Database notification effects remained singular under duplicate processing. Two concurrent workers drained 200 eligible jobs.
- Saturating the local connection pool caused readiness to return 503 with a generic response and blocked a worker claim. Liveness stayed at 200 and readiness returned to 200 after release. A six-second SQL sleep triggered the local five-second statement deadline. Terminating a separate PostgreSQL session interrupted its in-flight statement and rolled back its uncommitted outbox insert. A unit regression also forced one worker's completion and retry record to fail while a sibling was active and proved the batch waited for the sibling.
- The restarted-worker scenario kills a subprocess while its synthetic email call is paused, then reclaims its aged lease and retries. An active-request API shutdown and real provider interruption remain production-like verification items. Provider idempotency keys are stable. The database deduplication checks establish no exactly-once external email guarantee.

## Verification

- Backend lint and all 211 backend tests passed. The test setup explicitly isolates the default MFA flag from local environment values. Dedicated enrollment tests still require MFA and verify revocation.
- Frontend lint, TypeScript, the Vite production build and all 133 frontend tests passed.
- Drizzle journal checks passed. An isolated Drizzle generation check found no model drift after the SQL-only migration.
- Root `npm run dev` started both services. The frontend and backend liveness check returned HTTP 200.
- Smoke, moderate, higher, stress, recovery, soak, real PostgreSQL reliability and browser checks ran locally. Generated output stayed outside Git.

## Reproduce

Node 24, installed workspace dependencies, Docker, and an optional Chrome binary are required. The performance entry points refuse production mode and accept only the exact disposable loopback database below. The seed command requires a fresh schema. Run from the repository root.

```sh
docker run --detach --rm --name dealflow-phase12-pg \
  -e POSTGRES_USER=dealflow_perf -e POSTGRES_PASSWORD=dealflow_perf \
  -e POSTGRES_DB=dealflow_perf -p 127.0.0.1:55432:5432 postgres:17-alpine

docker exec dealflow-phase12-pg pg_isready -U dealflow_perf -d dealflow_perf
export DEALFLOW_PERF_DATABASE_URL=postgresql://dealflow_perf:dealflow_perf@127.0.0.1:55432/dealflow_perf
npm run perf:seed
DEALFLOW_PERF_EXPLAIN=1 npm run perf:smoke
npm run perf:baseline
DEALFLOW_PERF_AUTH_DETAIL=1 npm run perf:baseline
npm run perf:load
npm run perf:higher
npm run perf:stress
npm run perf:recovery
npm run perf:soak
npm --prefix frontend run build -- --manifest
npm run perf:bundle -- frontend/dist
export DEALFLOW_PERF_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DEALFLOW_PERF_EXPECT_DEDUPED=1 npm run perf:browser
DEALFLOW_PERF_EXPLAIN=1 npm run perf:reliability
docker stop dealflow-phase12-pg
```

Run reliability last because its synthetic writes and analytics cleanup affect the performance dataset. Browser checks require ports 3000 and 5173 to be free. k6 was unavailable, so the Node runner measures real loopback HTTP and refuses arbitrary target URLs. The stress test stops increasing load once at least 50 completed requests show a 10% error rate. All non-200 responses and client failures are represented in the status distribution.

To use the same runner against the original backend, archive the baseline revision and copy the harness. Use the archived backend for alternating trials without reseeding between them.

```sh
perf_before=$(mktemp -d)
git archive 8c0da7f backend/src backend/drizzle backend/package.json | tar -x -C "$perf_before"
mkdir -p "$perf_before/backend/scripts"
cp -R backend/scripts/performance "$perf_before/backend/scripts/"
ln -s "$PWD/backend/node_modules" "$perf_before/backend/node_modules"
node "$perf_before/backend/scripts/performance/run.js" baseline
DEALFLOW_PERF_AUTH_DETAIL=1 node "$perf_before/backend/scripts/performance/run.js" baseline
```

Build revision `8c0da7f` with the same Vite settings and manifest flag for frontend comparisons. Pass that build directory to `npm run perf:bundle -- /path/to/dist` or `npm run perf:browser -- /path/to/dist`.

## Remaining work for Phase 13

Repeat these scenarios with a dedicated generator, a production-like Neon test branch, deployed Arcjet settings, a representative data distribution and separately measured worker resources. Verify Neon HTTP latency, proxy and database interruption, storage transfer, active-request shutdown, provider timeouts and long-duration worker backlog under that configuration. These loopback results do not establish production capacity.

## Phase 12.1 — Grafana k6 Integration

### Prerequisites and reproducibility

Use Node 24, the repository dependencies, Docker Desktop and the open-source k6 CLI. The verified binary was **k6 v2.4.0** on Darwin ARM64. If k6 is missing on macOS, run `brew install k6` and confirm the binary with `k6 version`.

Start the disposable PostgreSQL 17 container using the original [reproduction commands](#reproduce), then export the documented `DEALFLOW_PERF_DATABASE_URL` and run `npm run perf:seed` once against its fresh schema. The launcher verifies the named `dealflow-phase12-pg` container, its exact loopback port mapping, and that its database server identifier matches the one the child API sees. The synthetic roster and minimum fixture counts are checked before the child listens. Custom API targets, alternate database URLs and production mode are rejected.

Each command launches its own API on an ephemeral loopback port through the existing Phase 12 mock harness. The launcher and k6 both verify the API's identity. The API requires a random per-run challenge on every request. Requests disable redirect following, and k6 starts with a fresh configuration and a restricted environment. Child processes are stopped on normal exit or interruption. Stop the disposable container separately when you finish testing.

Arcjet, email and document storage use the existing mocks. Synthetic admin sign-in uses the benchmark-only MFA setting. The smoke test checks real HTTP-only cookies, role authorization and the CSRF requirement on sign-out. Other scenarios provision independent synthetic sessions per VU and role using the existing auth service, warm each workload route, and use separate cookie jars. Longer soaks renew sessions through actual sign-in before JWT expiry. Setup and refresh are tagged separately. Both k6 and the Node runner use the same disposable database and fixtures. The Node runner retains SQL timing, execution plans, transaction and worker testing, browser automation and bundle analysis.

### Commands

Start with this sequence from the repository root. Seed only once for each fresh disposable container.

```sh
docker run --detach --rm --name dealflow-phase12-pg \
  -e POSTGRES_USER=dealflow_perf -e POSTGRES_PASSWORD=dealflow_perf \
  -e POSTGRES_DB=dealflow_perf -p 127.0.0.1:55432:5432 postgres:17-alpine
docker exec dealflow-phase12-pg pg_isready -U dealflow_perf -d dealflow_perf
export DEALFLOW_PERF_DATABASE_URL=postgresql://dealflow_perf:dealflow_perf@127.0.0.1:55432/dealflow_perf
npm run perf:seed
npm run perf:k6:smoke
npm run perf:k6:recovery
# View the live dashboard during a run and the printed HTML path afterward.
docker stop dealflow-phase12-pg
```

| Command | Workload |
| --- | --- |
| `npm run perf:k6:smoke` | One VU checks response content and the auth and CSRF boundaries |
| `npm run perf:k6:marketplace` | Four VUs for 20 seconds with 500 ms browsing pauses |
| `npm run perf:k6:auth-detail` | Four VUs for 12 seconds on signed-in detail without pacing |
| `npm run perf:k6:analytics` | Four VUs for 20 seconds with 300 ms pauses, including owned listing comparison and 7- and 30-day ranges |
| `npm run perf:k6:mixed` | Four VUs for 12 seconds across the original 15 routes without pacing |
| `npm run perf:k6:browsing` | Ten VUs for 25 seconds with 250 ms pauses and a broader browser mix |
| `npm run perf:k6:load` | 30 seconds, up to 20 VUs |
| `npm run perf:k6:higher` | 30 seconds, up to 100 VUs |
| `npm run perf:k6:stress` | 50 seconds, holds at 10, 25, 50 and 100 VUs before ramping down |
| `npm run perf:k6:recovery` | 30 seconds with low traffic, a burst at 100 VUs and a return to 4 VUs |
| `npm run perf:k6:soak` | 20 VUs with 250 ms pauses, five minutes by default |

Run from the repository root. Set `DEALFLOW_K6_SOAK_MINUTES` to `5`, `15`, `30` or `60` for the soak command. The other schedules have fixed bounds. The stress, higher and recovery scenarios abort on sustained severe latency or failures using k6 thresholds. Each run checks HTTP failure rate below 1% and measured application checks at or above 99%. The configured p95 limits are 300 ms for listing details, 500 ms for marketplace search and 800 ms for seller analytics.

### Dashboard and reports

Open **http://127.0.0.1:5665** during a run. The launcher prints the dashboard and artifact paths. Set `DEALFLOW_K6_DASHBOARD_PORT` to a free port to avoid a conflict. Set it to `-1` for report-only runs. The live dashboard binds to loopback. Close its browser tab after the test if the open connection holds k6. The launcher also enforces a bounded cleanup deadline. [Grafana k6 web dashboard](https://grafana.com/docs/k6/latest/results-output/web-dashboard/)

Each successful run writes `report.html` and `summary.json` under `logs/performance/k6/<scenario>-<timestamp>-<suffix>/`. Open the HTML file directly in a browser. The JSON includes the fixture counts, tool version, workload, wall duration, native HTTP metrics and threshold outcomes. The dashboard samples every two seconds. The smoke run includes a brief observation window so k6 exports an HTML file, but its chart represents a correctness pass with a short burst. Generated reports are Git-ignored.

### Executed results

| Scenario | Peak VUs | Wall seconds | Requests | Requests/s | Mean | p95 | p99 | Thresholds | HTML |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| smoke | 1 | 8.79 | 22 | 2.5 | 3.08 ms | 5.32 ms | 5.79 ms | Pass | [Report](../logs/performance/k6/smoke-2026-11-25T15-17-10-462Z-WLKxQk/report.html) |
| marketplace | 4 | 20.44 | 160 | 7.8 | 9.02 ms | 14.05 ms | 30.18 ms | Pass | [Report](../logs/performance/k6/marketplace-2026-11-25T15-07-03-276Z-QjdGAy/report.html) |
| auth-detail | 4 | 12.28 | 24,250 | 1975.2 | 1.91 ms | 2.54 ms | 3.32 ms | Pass | [Report](../logs/performance/k6/auth-detail-2026-11-25T15-07-24-883Z-KABpjz/report.html) |
| analytics | 4 | 20.54 | 256 | 12.5 | 14.90 ms | 20.36 ms | 22.84 ms | Pass | [Report](../logs/performance/k6/analytics-2026-11-25T15-07-38-264Z-gdynVg/report.html) |
| mixed | 4 | 12.90 | 16,793 | 1302.0 | 2.71 ms | 5.16 ms | 6.42 ms | Pass | [Report](../logs/performance/k6/mixed-2026-11-25T15-07-59-914Z-Og2t1y/report.html) |
| browsing | 10 | 26.03 | 950 | 36.5 | 13.27 ms | 22.78 ms | 26.35 ms | Pass | [Report](../logs/performance/k6/browsing-2026-11-25T15-08-13-907Z-EOYsZ6/report.html) |
| load | 20 | 31.02 | 3,348 | 107.9 | 8.95 ms | 17.27 ms | 21.45 ms | Pass | [Report](../logs/performance/k6/load-2026-11-25T15-08-41-053Z-s3DTEq/report.html) |
| higher | 100 | 31.16 | 14,415 | 462.7 | 4.90 ms | 11.86 ms | 19.60 ms | Pass | [Report](../logs/performance/k6/higher-2026-11-25T15-09-13-256Z-DF5Qs0/report.html) |
| stress | 100 | 51.06 | 40,795 | 798.9 | 7.12 ms | 18.31 ms | 32.29 ms | Pass | [Report](../logs/performance/k6/stress-2026-11-25T15-09-45-574Z-mGm1AJ/report.html) |
| recovery | 100 | 31.08 | 23,366 | 751.8 | 29.05 ms | 58.14 ms | 79.35 ms | Pass | [Report](../logs/performance/k6/recovery-2026-11-25T15-10-37-881Z-lfs21E/report.html) |
| soak | 20 | 301.17 | 22,720 | 75.4 | 13.58 ms | 23.28 ms | 28.33 ms | Pass | [Report](../logs/performance/k6/soak-2026-11-25T15-11-10-203Z-bx6qLT/report.html) |

All runs had **0% unexpected HTTP failures and 100% measured functional checks**. Smoke recorded four expected HTTP 403 responses separately. The table uses native k6 HTTP timings for measured routes. The requests-per-second column divides measured requests by the observed wall duration, which includes setup. Closed-model VU runs have no arrival-rate dropped-iteration metric.

The 100-VU stress run completed the configured ramp and holds without reaching the abort limits or establishing saturation. In the recovery run, end-to-end p95 was **11 ms at low traffic, 64 ms during the 100-VU burst, and 11 ms after the return to four VUs**. The 20-VU soak ran its full **300-second workload** and completed **22,720 measured requests**. Its wall time includes setup and graceful stop.

### Comparison with the Node runner

| Workload and runner | Requests | Requests/s | Mean | p95 | p99 | Error rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| mixed, Node.js | 15,478 | 1,289.2 | 3.10 ms | 5.58 ms | 7.28 ms | 0.0% |
| mixed, k6 | 16,742 | 1,395.2 | 2.83 ms | 5.00 ms | 6.59 ms | 0.0% |
| auth-detail, Node.js | 22,412 | 1,867.5 | 2.14 ms | 3.07 ms | 3.99 ms | 0.0% |
| auth-detail, k6 | 23,989 | 1,999.1 | 1.98 ms | 3.00 ms | 4.00 ms | 0.0% |

Each pair used four unpaced clients for 12 seconds on the same warmed, disposable PostgreSQL fixture, with the same read routes and mock services. Node reports its actual workload elapsed time. The k6 comparison divides measured requests by the 12-second scheduled window and uses a custom wall clock around request and response validation. That clock has millisecond resolution. The native k6 HTTP latency values in the previous table exclude application response parsing and connection setup.

Node runs the generator and API on the same process and event loop. k6 uses a separate Go process, its own connection reuse strategy and independent VU sessions. The Node runner reuses one session per role. Both tools warmed each route and excluded auth setup from their reported endpoint latency. The comparison measures the two test setups and does not imply an application speedup.

### Verification and limits

The k6 code lives in `backend/scripts/performance/k6/`, with shared fixture settings in `backend/scripts/performance/fixture-config.js`. The existing benchmark database and runner use those settings, and the runner has a benchmark-only API startup mode. The root package supplies the commands, and `backend/tests/k6-launcher.test.js` covers safety, report paths and child cleanup.

- All **217 backend tests** and **133 frontend tests** passed. Backend and frontend lint, TypeScript, the production build and Drizzle consistency passed.
- The original seed, smoke, paired baseline, bundle and PostgreSQL reliability commands ran successfully. The unchanged root `npm run dev` served the frontend and the backend liveness endpoint over loopback.
- An actual SIGINT stopped both children of a running k6 launcher and released its dashboard port. Launcher tests also cover unsafe targets, production mode, invalid settings, missing binaries, failed identity verification and isolated report paths.
- Headless Chrome rendered the standalone stress report and the live dashboard, including VU, request rate, latency and failure charts. The exported reports passed a scan for fixture passwords, connection strings and the challenge header.

These results apply to a local API, the small synthetic fixture set, PostgreSQL over TCP and mocked external services. The 5-minute soak covers that window. Longer durations are configurable, and timed session renewal was outside the five-minute verification window. Phase 13 should repeat the scenarios from a separate generator, measure backend and generator resources separately, test several seeded corpus sizes, and verify the workload against an isolated staging deployment with production-like integrations and rate limits.
