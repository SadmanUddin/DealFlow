import { databaseUrl } from '../fixture-config.js';

export { databaseUrl, password } from '../fixture-config.js';
export const accounts = { buyer: 1, seller: 10, admin: 100 };
export const identityPath = '/__dealflow_performance/identity';
export const sessionsPath = '/__dealflow_performance/sessions';
export const challengeHeader = 'X-DealFlow-Performance-Key';
export const identity = 'dealflow-disposable-postgres17-mocks-v1';

const constant = (vus, seconds, pause = 0) => ({ vus, seconds, pause });
const ramp = (start, pause, stages) => ({ start, pause, stages });
export const workloads = {
  smoke: { vus: 1, iterations: 1, seconds: 15, pause: 0 },
  marketplace: constant(4, 20, 0.5),
  'auth-detail': constant(4, 12),
  analytics: constant(4, 20, 0.3),
  mixed: constant(4, 12),
  browsing: constant(10, 25, 0.25),
  load: ramp(1, 0.125, [
    [5, 10],
    [5, 20],
    [15, 20],
    [5, 0],
  ]),
  higher: ramp(1, 0.125, [
    [5, 25],
    [5, 50],
    [5, 100],
    [10, 100],
    [5, 0],
  ]),
  stress: ramp(1, 0.05, [
    [5, 10],
    [5, 10],
    [5, 25],
    [5, 25],
    [5, 50],
    [5, 50],
    [5, 100],
    [10, 100],
    [5, 0],
  ]),
  recovery: ramp(4, 0.025, [
    [8, 4, 'low'],
    [2, 100, 'ramp-up'],
    [10, 100, 'burst'],
    [2, 4, 'ramp-down'],
    [8, 4, 'recovered'],
  ]),
  soak: constant(20, 300, 0.25),
};

export function configure(name, env) {
  if (env.NODE_ENV === 'production')
    throw new Error('Production mode is prohibited.');
  if (env.DEALFLOW_K6_TARGET !== undefined)
    throw new Error('Target overrides are prohibited.');
  if (env.DEALFLOW_PERF_DATABASE_URL !== databaseUrl) {
    throw new Error(
      'Set DEALFLOW_PERF_DATABASE_URL to the disposable database from the report.'
    );
  }
  if (!Object.hasOwn(workloads, name)) throw new Error('Unknown k6 scenario.');
  const workload = { ...workloads[name] };
  if (env.DEALFLOW_K6_SOAK_MINUTES !== undefined) {
    const minutes = env.DEALFLOW_K6_SOAK_MINUTES;
    if (name !== 'soak' || !['5', '15', '30', '60'].includes(minutes)) {
      throw new Error('Soak duration must be 5, 15, 30, or 60 minutes.');
    }
    workload.seconds = Number(minutes) * 60;
  }
  const port = env.DEALFLOW_K6_DASHBOARD_PORT ?? '5665';
  if (
    port !== '-1' &&
    (!/^[1-9]\d{3,4}$/.test(port) ||
      Number(port) < 1024 ||
      Number(port) > 65535 ||
      ['3000', '5173', '55432'].includes(port))
  ) {
    throw new Error(
      'Use dashboard port -1 or a free local port from 1024 to 65535.'
    );
  }
  return { workload, dashboardPort: Number(port) };
}

export function localOrigin(value) {
  return (
    typeof value === 'string' &&
    /^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(value) &&
    Number(value.split(':')[2]) <= 65535
  );
}

export function validIdentity(body) {
  return (
    body?.identity === identity &&
    body.database === 'dealflow_perf' &&
    body.postgresMajor === 17 &&
    body.mockIntegrations === true &&
    body.dataset?.users === 100 &&
    Number.isSafeInteger(body.dataset.listings) &&
    body.dataset.listings >= 500 &&
    Number.isSafeInteger(body.dataset.conversations) &&
    body.dataset.conversations >= 500 &&
    Number.isSafeInteger(body.dataset.messages) &&
    body.dataset.messages >= 5000 &&
    Number.isSafeInteger(body.dataset?.dealId) &&
    body.dataset.dealId > 0
  );
}
