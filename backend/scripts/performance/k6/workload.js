/* global __ENV */
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import http from 'k6/http';
import { Counter, Rate, Trend } from 'k6/metrics';
import {
  accounts,
  challengeHeader,
  identityPath,
  localOrigin,
  password,
  sessionsPath,
  validIdentity,
  workloads,
} from './config.js';

const input = JSON.parse(__ENV.DEALFLOW_K6_INPUT ?? '{}');
if (
  !Object.hasOwn(workloads, input.name) ||
  !localOrigin(input.origin) ||
  !/^[a-f0-9]{64}$/.test(input.challenge ?? '')
) {
  throw new Error('Use the root npm k6 launcher.');
}
const { name, origin, challenge, workload, roles } = input;
const headers = { [challengeHeader]: challenge };
const latency = new Trend('measured_latency', true);
const failures = new Rate('unexpected_http_failure');
const failuresByCategory = new Counter('failure_category');
const expectedErrors = new Counter('expected_correctness_error');

const targetThresholds = {
  detail: 300,
  'auth-detail': 300,
  filter: 500,
  'seller-analytics': 800,
  'seller-listing-analytics': 800,
  'seller-comparison': 800,
};
const activeTargets = {
  marketplace: ['detail', 'filter'],
  'auth-detail': ['auth-detail'],
  analytics: [
    'seller-analytics',
    'seller-listing-analytics',
    'seller-comparison',
  ],
}[name] ?? [
  'detail',
  'filter',
  'seller-analytics',
  'seller-listing-analytics',
  ...(name === 'smoke' ? ['seller-comparison'] : []),
];
const thresholds = {
  unexpected_http_failure: [
    { threshold: 'rate<0.10', abortOnFail: true, delayAbortEval: '5s' },
    'rate<0.01',
  ],
  'checks{traffic:measured}': [
    { threshold: 'rate>=0.90', abortOnFail: true, delayAbortEval: '5s' },
    'rate>=0.99',
  ],
  'http_reqs{traffic:measured}': ['count>0'],
  'http_req_duration{traffic:measured}': [],
};
for (const endpoint of activeTargets) {
  thresholds['http_req_duration{traffic:measured,name:' + endpoint + '}'] = [
    'p(95)<' + targetThresholds[endpoint],
  ];
}
if (['stress', 'higher', 'recovery'].includes(name)) {
  thresholds.measured_latency = [
    { threshold: 'p(95)<1500', abortOnFail: true, delayAbortEval: '5s' },
  ];
}
if (name === 'recovery') {
  for (const phase of ['low', 'burst', 'recovered']) {
    thresholds['measured_latency{phase:' + phase + '}'] = [
      phase === 'recovered' ? 'p(95)<300' : 'p(95)<1500',
    ];
    thresholds['unexpected_http_failure{phase:' + phase + '}'] = ['rate<0.01'];
    thresholds['http_reqs{traffic:measured,phase:' + phase + '}'] = ['count>0'];
  }
}

const scenario = workload.iterations
  ? {
    executor: 'shared-iterations',
    vus: 1,
    iterations: workload.iterations,
    maxDuration: workload.seconds + 's',
  }
  : workload.stages
    ? {
      executor: 'ramping-vus',
      startVUs: workload.start,
      stages: workload.stages.map(([duration, target]) => ({
        duration: duration + 's',
        target,
      })),
      gracefulRampDown: '3s',
    }
    : {
      executor: 'constant-vus',
      vus: workload.vus,
      duration: workload.seconds + 's',
    };
export const options = {
  scenarios: { [name]: { ...scenario, gracefulStop: '4s' } },
  thresholds,
  setupTimeout: '60s',
  noCookiesReset: true,
  maxRedirects: 0,
  systemTags: [
    'name',
    'method',
    'status',
    'scenario',
    'expected_response',
    'check',
    'error_code',
  ],
  summaryTrendStats: [
    'avg',
    'med',
    'p(90)',
    'p(95)',
    'p(99)',
    'min',
    'max',
    'count',
  ],
  summaryTimeUnit: 'ms',
};

const hasArray = key => value => Array.isArray(value?.[key]);
const listing = id => body =>
  body?.listing?.id === id &&
  ['published', 'sold'].includes(body.listing.status);
const analytics =
  (days, ids = []) =>
    body => {
      const value = body?.analytics;
      return (
        Number.isInteger(value?.listingCount) &&
      Array.isArray(value?.trends) &&
      value.trends.length === days &&
      Array.isArray(value.listings) &&
      value.listings.map(item => item.id).join(',') === ids.join(',')
      );
    };
const route = (endpoint, path, validate, role) => ({
  endpoint,
  path,
  validate,
  role,
});
const browse = route(
  'browse',
  '/api/listings?limit=12',
  body => hasArray('listings')(body) && body.listings.length > 0
);
const filter = route(
  'filter',
  '/api/listings?q=Benchmark&industry=Software&location=London&minPrice=150000&sort=price_asc',
  body =>
    hasArray('listings')(body) &&
    body.listings.length > 0 &&
    body.listings.every(
      item =>
        item.industry === 'Software' &&
        item.location === 'London' &&
        Number(item.askingPrice) >= 150000
    ) &&
    body.listings.every(
      (item, index, rows) =>
        index === 0 ||
        Number(item.askingPrice) >= Number(rows[index - 1].askingPrice)
    )
);
const detail = route('detail', '/api/listings/1', listing(1));
const authDetail = route(
  'auth-detail',
  detail.path,
  body => listing(1)(body) && typeof body.listing.isFavorite === 'boolean',
  'buyer'
);
const sellerListings = route(
  'seller-listings',
  '/api/listings/mine',
  hasArray('listings'),
  'seller'
);
const sellerAnalytics = route(
  'seller-analytics',
  '/api/seller/analytics/overview',
  analytics(30),
  'seller'
);
const sellerItem = route(
  'seller-listing-analytics',
  '/api/seller/analytics/listings/1',
  analytics(30, [1]),
  'seller'
);
const sellerComparison = route(
  'seller-comparison',
  '/api/seller/analytics/comparison?ids=1,20',
  analytics(30, [1, 20]),
  'seller'
);
const analyticsRoutes = [
  sellerListings,
  sellerAnalytics,
  route(
    'seller-analytics',
    '/api/seller/analytics/overview?range=7',
    analytics(7),
    'seller'
  ),
  sellerItem,
  sellerComparison,
];
const sessionRoute = role =>
  route(
    'session',
    '/api/auth/me',
    body => body?.user?.id === accounts[role] && body.user.role === role,
    role
  );
const favorites = route(
  'favorites',
  '/api/favorites',
  hasArray('favorites'),
  'buyer'
);
const saved = route(
  'saved-searches',
  '/api/saved-searches',
  hasArray('savedSearches'),
  'buyer'
);
const conversations = route(
  'conversations',
  '/api/conversations',
  hasArray('conversations'),
  'buyer'
);
const messages = route(
  'messages',
  '/api/conversations/1/messages',
  hasArray('messages'),
  'buyer'
);
const deals = route('deals', '/api/deals', hasArray('deals'), 'buyer');
const moderation = route(
  'moderation',
  '/api/admin/listings',
  hasArray('listings'),
  'admin'
);
const notification = route(
  'buyer-notifications',
  '/api/notifications?page=1&limit=1&unread=true',
  hasArray('notifications'),
  'buyer'
);
function routes(dealId) {
  const mixed = [
    browse,
    filter,
    detail,
    sessionRoute('buyer'),
    sellerListings,
    sellerAnalytics,
    sellerItem,
    favorites,
    saved,
    conversations,
    messages,
    route(
      'offers',
      '/api/deals/' + dealId + '/offers',
      hasArray('offers'),
      'buyer'
    ),
    deals,
    route(
      'diligence',
      '/api/deals/' + dealId + '/diligence',
      hasArray('checklist'),
      'buyer'
    ),
    moderation,
  ];
  return (
    {
      smoke: [...mixed, authDetail, ...analyticsRoutes, notification],
      marketplace: [browse, filter, detail],
      'auth-detail': [authDetail],
      analytics: analyticsRoutes,
      mixed,
      browsing: [...mixed, notification, authDetail, browse, filter, detail],
    }[name] ?? mixed
  );
}

function params(endpoint, traffic, jar, phase = 'steady') {
  return {
    headers,
    jar,
    timeout: '5s',
    redirects: 0,
    tags: { name: endpoint, traffic, phase, workload: name },
  };
}

function body(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}

function classify(response, contentValid) {
  if (response.status === 0)
    return [1050, 1211].includes(response.error_code) ? 'timeout' : 'network';
  if (response.status === 429) return 'rate_limit';
  if (response.status === 401) return 'authentication';
  if (response.status === 403) return 'authorization';
  if (response.status >= 500) return 'server';
  if (response.status !== 200) return 'unexpected_status';
  return contentValid ? null : 'invalid_content';
}

function sample(target, jars, traffic, phase = 'steady') {
  const start = Date.now();
  const request = params(target.endpoint, traffic, jars[target.role], phase);
  const response = http.get(origin + target.path, request);
  const content = response.status === 200 ? body(response) : null;
  const valid = Boolean(content && !content.error && target.validate(content));
  const failure = classify(response, valid);
  if (traffic === 'measured') {
    latency.add(Date.now() - start, request.tags);
    failures.add(response.status !== 200, request.tags);
    if (failure)
      failuresByCategory.add(1, { ...request.tags, category: failure });
    check(
      response,
      { 'HTTP 200 with expected application content': () => !failure },
      request.tags
    );
  } else if (failure) {
    exec.test.abort(
      'Warm-up failed for ' + target.endpoint + ' (' + failure + ').'
    );
  }
}

function signIn(role, jar, traffic) {
  const request = params('sign-in', traffic, jar);
  request.headers = {
    ...headers,
    'Content-Type': 'application/json',
    Origin: 'http://localhost:5173',
  };
  const response = http.post(
    origin + '/api/auth/sign-in',
    JSON.stringify({
      email: 'perf-' + accounts[role] + '@example.test',
      password,
    }),
    request
  );
  const data = body(response);
  if (
    response.status !== 200 ||
    data?.user?.id !== accounts[role] ||
    data.user.role !== role ||
    !data.csrfToken ||
    !response.cookies.token?.[0]?.http_only
  ) {
    exec.test.abort('Synthetic sign-in failed for ' + role + '.');
  }
  return data.csrfToken;
}

function smokeAuth() {
  for (const role of roles) {
    const jar = new http.CookieJar();
    const csrf = signIn(role, jar, 'setup');
    sample(sessionRoute(role), { [role]: jar }, 'setup');
    if (role === 'buyer') {
      const denied = http.get(origin + moderation.path, {
        ...params('buyer-denied-admin', 'correctness', jar),
        responseCallback: http.expectedStatuses(403),
      });
      if (denied.status !== 403 || !body(denied)?.error)
        exec.test.abort('Buyer admin boundary failed.');
      expectedErrors.add(1, { category: 'authorization' });
    }
    const request = params('sign-out', 'correctness', jar);
    const denied = http.post(origin + '/api/auth/sign-out', null, {
      ...request,
      responseCallback: http.expectedStatuses(403),
    });
    if (denied.status !== 403 || !body(denied)?.error)
      exec.test.abort('CSRF boundary failed.');
    expectedErrors.add(1, { category: 'csrf' });
    const success = http.post(origin + '/api/auth/sign-out', null, {
      ...request,
      headers: { ...headers, 'X-CSRF-Token': csrf },
    });
    if (success.status !== 200 || jar.cookiesForURL(origin).token?.length) {
      exec.test.abort('Synthetic sign-out failed.');
    }
  }
}

function createJars(sessions, slot) {
  const jars = {};
  for (const role of roles) {
    const token = sessions?.[role]?.[slot];
    if (typeof token !== 'string' || !token)
      exec.test.abort('Missing synthetic VU session.');
    const jar = new http.CookieJar();
    jar.set(origin, 'token', token, { path: '/', http_only: true });
    jars[role] = jar;
  }
  return jars;
}

export function setup() {
  const attestation = http.get(
    origin + identityPath,
    params('identity', 'setup')
  );
  const confirmed = body(attestation);
  if (attestation.status !== 200 || !validIdentity(confirmed))
    exec.test.abort('Unsafe benchmark API identity.');
  const secret = http.post(
    origin + sessionsPath,
    null,
    params('synthetic-sessions', 'setup')
  );
  const sessions = body(secret);
  if (secret.status !== 200 || !sessions)
    exec.test.abort('Synthetic session provisioning failed.');
  if (name === 'smoke') smokeAuth();
  const warm = createJars(sessions, 0);
  for (const target of routes(confirmed.dataset.dealId))
    sample(target, warm, 'setup');
  return { dataset: confirmed.dataset, sessions, issuedAt: Date.now() };
}

let jars;
let nextRefresh;
let targets;
function phase() {
  if (name !== 'recovery') return 'steady';
  const elapsed = Date.now() - exec.scenario.startTime;
  let end = 0;
  for (const [seconds, , label] of workload.stages) {
    end += seconds * 1000;
    if (elapsed < end) return label;
  }
  return 'recovered';
}
export default function (data) {
  if (!jars) {
    jars = createJars(data.sessions, exec.vu.idInTest - 1);
    nextRefresh = data.issuedAt + (11 * 60 + (exec.vu.idInTest % 60)) * 1000;
    targets = routes(data.dataset.dealId);
  }
  if (roles.length && Date.now() >= nextRefresh) {
    for (const role of roles) signIn(role, jars[role], 'refresh');
    nextRefresh = Date.now() + 12 * 60_000;
  }
  const iteration = exec.scenario.iterationInTest;
  if (name === 'smoke') {
    for (const target of targets) sample(target, jars, 'measured');
    sleep(7);
  } else {
    sample(targets[iteration % targets.length], jars, 'measured', phase());
    if (workload.pause) sleep(workload.pause);
  }
}

export function handleSummary(data) {
  const { dataset } = input;
  const { metrics, state } = data;
  const durationMs = state.testRunDurationMs;
  const measured = metrics.measured_latency?.values;
  const results = {
    scenario: name,
    timestamp: input.timestamp,
    k6: input.version,
    workload,
    dataset,
    durationMs,
    metrics,
    limitations: [
      'Loopback HTTP to a disposable PostgreSQL API with mock integrations.',
      'Built-in aggregate HTTP metrics include setup and refresh. Filter traffic=measured for workload metrics.',
      'VUs represent generators, and these findings do not establish production capacity.',
    ],
  };
  return {
    [input.summary]: JSON.stringify(results, null, 2),
    stdout:
      '\n' +
      name +
      ' measured requests: ' +
      (measured?.count ?? 0) +
      ', p95 ms: ' +
      (measured?.['p(95)']?.toFixed(2) ?? 'unavailable') +
      '\n',
  };
}
