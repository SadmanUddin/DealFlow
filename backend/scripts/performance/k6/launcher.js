import { execFileSync, fork, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  challengeHeader,
  configure,
  identityPath,
  localOrigin,
  validIdentity,
} from './config.js';

const directory = new URL('.', import.meta.url);
const root = fileURLToPath(new URL('../../../../', directory));

export function prerequisite(binary, args, message) {
  try {
    return execFileSync(binary, args, {
      encoding: 'utf8',
      timeout: 7000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    throw new Error(message);
  }
}

export async function verifyApi(origin, challenge, signal) {
  if (!localOrigin(origin)) throw new Error('Invalid benchmark API origin.');
  const response = await globalThis.fetch(origin + identityPath, {
    headers: { [challengeHeader]: challenge },
    redirect: 'error',
    signal,
  });
  const data = response.status === 200 ? await response.json() : null;
  if (!validIdentity(data)) {
    throw new Error(
      'The isolated benchmark API identity could not be verified.'
    );
  }
  return data;
}

export async function createReports(base, name, timestamp) {
  await mkdir(base, { recursive: true, mode: 0o700 });
  const path = await mkdtemp(join(base, name + '-' + timestamp + '-'));
  const config = join(path, 'k6-config.json');
  await writeFile(config, '{}\n', { mode: 0o600 });
  return {
    config,
    html: join(path, 'report.html'),
    summary: join(path, 'summary.json'),
  };
}

export async function stopChild(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  const closed = once(child, 'exit');
  child.kill('SIGTERM');
  const timer = new globalThis.AbortController();
  try {
    if (
      !(await Promise.race([
        closed.then(() => true),
        sleep(3000, false, { signal: timer.signal }),
      ]))
    ) {
      child.kill('SIGKILL');
      await closed;
    }
  } finally {
    timer.abort();
  }
}

async function assertDashboardPort(port) {
  if (port === -1) return;
  const probe = createServer();
  const listening = once(probe, 'listening');
  probe.listen(port, '127.0.0.1');
  try {
    await listening;
  } catch {
    throw new Error(
      'Dashboard port is unavailable. Set DEALFLOW_K6_DASHBOARD_PORT.'
    );
  }
  await new Promise(resolveClose => probe.close(resolveClose));
}

export async function launch(name, env) {
  const { workload, dashboardPort } = configure(name, env);
  if (Number(process.versions.node.split('.')[0]) < 24)
    throw new Error('Node 24 or newer is required.');
  const version = prerequisite(
    'k6',
    ['version'],
    'Install Grafana k6 first (brew install k6).'
  );
  if (!/^k6 v(?:[1-9]\d*|0\.(?:5[6-9]|[6-9]\d))\./.test(version)) {
    throw new Error('Grafana k6 0.56 or newer is required.');
  }
  const container = 'dealflow-phase12-pg';
  const dockerError =
    'Start the disposable dealflow-phase12-pg container from the report.';
  if (
    prerequisite('docker', ['port', container, '5432/tcp'], dockerError) !==
    '127.0.0.1:55432'
  ) {
    throw new Error('The disposable Docker port mapping is incorrect.');
  }
  const databaseId = prerequisite(
    'docker',
    [
      'exec',
      container,
      'psql',
      '-U',
      'dealflow_perf',
      '-d',
      'dealflow_perf',
      '-Atqc',
      'SELECT system_identifier FROM pg_control_system()',
    ],
    dockerError
  );
  if (!/^\d+$/.test(databaseId)) throw new Error(dockerError);
  await assertDashboardPort(dashboardPort);

  const timestamp = new Date().toISOString();
  const reports = await createReports(
    join(root, 'logs/performance/k6'),
    name,
    timestamp.replace(/[:.]/g, '-')
  );
  const challenge = randomBytes(32).toString('hex');
  const slots =
    workload.vus ??
    Math.max(workload.start, ...workload.stages.map(stage => stage[1]));
  const roles = {
    marketplace: [],
    'auth-detail': ['buyer'],
    analytics: ['seller'],
  }[name] ?? ['buyer', 'seller', 'admin'];
  const signal = new globalThis.AbortController();
  const interrupt = () => signal.abort();
  for (const event of ['SIGINT', 'SIGTERM']) process.on(event, interrupt);
  let api;
  let runner;
  try {
    api = fork(fileURLToPath(new URL('../run.js', directory)), ['k6-api'], {
      cwd: root,
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
      env: {
        PATH: env.PATH,
        DEALFLOW_PERF_DATABASE_URL: env.DEALFLOW_PERF_DATABASE_URL,
        DEALFLOW_K6_CHALLENGE: challenge,
        DEALFLOW_K6_DATABASE_ID: databaseId,
        DEALFLOW_K6_SESSION_SLOTS: String(slots),
        DEALFLOW_K6_ROLES: roles.join(','),
      },
      execArgv: [],
    });
    const startup = globalThis.AbortSignal.any([
      signal.signal,
      globalThis.AbortSignal.timeout(10000),
    ]);
    const packet = await Promise.race([
      once(api, 'message', { signal: startup }).then(([message]) => message),
      once(api, 'exit', { signal: startup }).then(() => null),
    ]);
    if (packet?.type !== 'k6-ready')
      throw new Error('The isolated benchmark API did not start.');
    const { dataset } = await verifyApi(packet.origin, challenge, startup);
    if (dashboardPort !== -1)
      console.log('Live dashboard http://127.0.0.1:' + dashboardPort);
    console.log(
      'HTML report ' + reports.html + '\nJSON summary ' + reports.summary
    );
    signal.signal.throwIfAborted();
    runner = spawn(
      'k6',
      [
        'run',
        '--config',
        reports.config,
        '--no-usage-report',
        '--no-color',
        fileURLToPath(new URL('./workload.js', directory)),
      ],
      {
        cwd: resolve(root),
        stdio: 'inherit',
        env: {
          PATH: env.PATH,
          K6_WEB_DASHBOARD: 'true',
          K6_WEB_DASHBOARD_HOST: '127.0.0.1',
          K6_WEB_DASHBOARD_PORT: String(dashboardPort),
          K6_WEB_DASHBOARD_PERIOD: '2s',
          K6_WEB_DASHBOARD_EXPORT: reports.html,
          DEALFLOW_K6_INPUT: JSON.stringify({
            name,
            workload,
            origin: packet.origin,
            challenge,
            slots,
            roles,
            dataset,
            timestamp,
            version,
            summary: reports.summary,
          }),
        },
      }
    );
    const scheduledSeconds =
      workload.seconds ??
      workload.stages.reduce((total, [seconds]) => total + seconds, 0);
    // Include setup, graceful stop, report export, and a brief dashboard close window.
    const deadline = globalThis.AbortSignal.timeout(
      (scheduledSeconds + 85) * 1000
    );
    const runSignal = globalThis.AbortSignal.any([signal.signal, deadline]);
    try {
      const [code] = await once(runner, 'exit', { signal: runSignal });
      if (code === 0) {
        await Promise.all([access(reports.html), access(reports.summary)]);
      }
      return code ?? 1;
    } catch (error) {
      if (deadline.aborted && !signal.signal.aborted) {
        throw new Error(
          'k6 exceeded its run window. Close any open live dashboard tabs.',
          { cause: error }
        );
      }
      throw error;
    }
  } finally {
    await stopChild(runner);
    await stopChild(api);
    for (const event of ['SIGINT', 'SIGTERM']) process.off(event, interrupt);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv.length !== 3)
      throw new Error('Pass one named scenario without target arguments.');
    process.exitCode = await launch(process.argv[2], process.env);
  } catch (error) {
    console.error(
      error.name === 'AbortError' ? 'Benchmark interrupted.' : error.message
    );
    process.exitCode = error.name === 'AbortError' ? 130 : 1;
  }
}
