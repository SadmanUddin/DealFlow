import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  challengeHeader,
  configure,
  databaseUrl,
  identity,
  identityPath,
  localOrigin,
} from '../scripts/performance/k6/config.js';
import {
  createReports,
  launch,
  prerequisite,
  stopChild,
  verifyApi,
} from '../scripts/performance/k6/launcher.js';

const isolated = { DEALFLOW_PERF_DATABASE_URL: databaseUrl };

describe('k6 benchmark safety', () => {
  it('rejects API targets, production mode, and alternate database URLs before startup', async () => {
    await expect(
      launch('smoke', {
        ...isolated,
        DEALFLOW_K6_TARGET: 'http://127.0.0.1:3000',
      })
    ).rejects.toThrow('Target overrides');
    await expect(
      launch('smoke', { ...isolated, NODE_ENV: 'production' })
    ).rejects.toThrow('Production mode');
    await expect(
      launch('smoke', {
        DEALFLOW_PERF_DATABASE_URL: databaseUrl.replace('55432', '5432'),
      })
    ).rejects.toThrow('disposable database');
    expect(localOrigin('http://localhost:3000')).toBe(false);
    expect(localOrigin('http://127.0.0.1:3000@production.example')).toBe(false);
    expect(localOrigin('http://127.0.0.1:65536')).toBe(false);
  });

  it('validates scenarios, dashboard ports and bounded soak durations', () => {
    expect(() => configure('constructor', isolated)).toThrow('Unknown');
    expect(() =>
      configure('smoke', { ...isolated, DEALFLOW_K6_DASHBOARD_PORT: '5173' })
    ).toThrow('local port');
    expect(() =>
      configure('soak', { ...isolated, DEALFLOW_K6_SOAK_MINUTES: '61' })
    ).toThrow('Soak duration');
    expect(() =>
      configure('smoke', { ...isolated, DEALFLOW_K6_SOAK_MINUTES: '5' })
    ).toThrow('Soak duration');
    expect(
      configure('soak', { ...isolated, DEALFLOW_K6_SOAK_MINUTES: '60' })
        .workload.seconds
    ).toBe(3600);
    expect(
      configure('smoke', { ...isolated, DEALFLOW_K6_DASHBOARD_PORT: '-1' })
        .dashboardPort
    ).toBe(-1);
  });

  it('reports a missing prerequisite without leaking subprocess details', () => {
    expect(() =>
      prerequisite('/nonexistent/dealflow/test-k6', [], 'Install k6')
    ).toThrow(/^Install k6$/);
  });

  it('rejects an ordinary local API and refuses redirects while probing identity', async () => {
    const challenge = 'fixture';
    let behavior = 'ordinary';
    const server = createServer((req, res) => {
      if (behavior === 'redirect') {
        res.writeHead(302, { Location: 'http://127.0.0.1:1/' }).end();
        return;
      }
      if (
        behavior !== 'isolated' ||
        req.url !== identityPath ||
        req.headers[challengeHeader.toLowerCase()] !== challenge
      ) {
        res.writeHead(200).end('{"status":"ready"}');
        return;
      }
      res.writeHead(200).end(
        JSON.stringify({
          identity,
          database: 'dealflow_perf',
          postgresMajor: 17,
          mockIntegrations: true,
          dataset: {
            users: 100,
            listings: 500,
            conversations: 500,
            messages: 5000,
            dealId: 1,
          },
        })
      );
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = 'http://127.0.0.1:' + server.address().port;
    try {
      await expect(verifyApi(origin, challenge)).rejects.toThrow('identity');
      behavior = 'redirect';
      await expect(verifyApi(origin, challenge)).rejects.toThrow();
      behavior = 'isolated';
      await expect(verifyApi(origin, 'incorrect')).rejects.toThrow('identity');
      await expect(verifyApi(origin, challenge)).resolves.toMatchObject({
        identity,
      });
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});

it('allocates separate report directories for identical scenario names and timestamps', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dealflow-k6-test-'));
  try {
    const [first, second] = await Promise.all([
      createReports(directory, 'smoke', 'timestamp'),
      createReports(directory, 'smoke', 'timestamp'),
    ]);
    expect(first.html).not.toBe(second.html);
    expect(first.summary).toMatch(/summary\.json$/);
    expect(await readFile(first.config, 'utf8')).toBe('{}\n');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('stops the specified child and leaves other children alive', async () => {
  const children = [0, 1].map(() =>
    spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
  );
  try {
    await Promise.all(children.map(child => once(child, 'spawn')));
    await stopChild(children[0]);
    expect(children[0].signalCode).toBe('SIGTERM');
    expect(children[1].exitCode).toBeNull();
    expect(children[1].signalCode).toBeNull();
  } finally {
    await Promise.all(children.map(stopChild));
  }
});
