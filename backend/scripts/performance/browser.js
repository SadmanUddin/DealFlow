import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const frontend = 'http://localhost:5173';
const chromeBinary = process.env.DEALFLOW_PERF_CHROME;
if (!chromeBinary)
  throw new Error('Set DEALFLOW_PERF_CHROME to the Chrome binary path.');
const fetch = globalThis.fetch;
const waitFor = async (probe, description) => {
  const until = Date.now() + 15_000;
  while (Date.now() < until) {
    const result = await probe();
    if (result) return result;
    await sleep(100);
  }
  throw new Error('Timed out waiting for ' + description);
};
const profile = await mkdtemp(join(tmpdir(), 'dealflow-browser-'));
const children = [];
let websocket;
try {
  const api = spawn(
    process.execPath,
    ['backend/scripts/performance/run.js', 'browser-api'],
    { stdio: ['ignore', 'pipe', 'inherit'] }
  );
  children.push(api);
  await waitFor(
    () => api.stdout.read()?.toString().includes('browser-test API listening'),
    'synthetic API'
  );
  const dist = resolve(process.argv[2] ?? 'frontend/dist');
  const vite = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      'preview',
      '--host',
      'localhost',
      '--port',
      '5173',
      '--strictPort',
      '--outDir',
      dist,
    ],
    {
      cwd: 'frontend',
      stdio: ['ignore', 'pipe', 'inherit'],
    }
  );
  children.push(vite);
  await waitFor(
    () => vite.stdout.read()?.toString().includes('http://localhost:5173'),
    'Vite preview'
  );
  const chrome = spawn(
    chromeBinary,
    [
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      '--user-data-dir=' + profile,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  children.push(chrome);
  const port = await waitFor(
    () =>
      readFile(join(profile, 'DevToolsActivePort'), 'utf8').then(
        body => body.split('\n')[0],
        () => null
      ),
    'Chrome DevTools'
  );
  const targets = await (
    await fetch('http://127.0.0.1:' + port + '/json/list')
  ).json();
  websocket = new globalThis.WebSocket(
    targets.find(target => target.type === 'page').webSocketDebuggerUrl
  );
  await new Promise((done, fail) => {
    websocket.addEventListener('open', done, { once: true });
    websocket.addEventListener('error', fail, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  let requests = new Map();
  websocket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const callback = pending.get(message.id);
      pending.delete(message.id);
      callback?.(message);
    }
    if (message.method === 'Network.requestWillBeSent') {
      requests.set(message.params.requestId, {
        url: message.params.request.url,
        method: message.params.request.method,
        type: message.params.type,
      });
    }
    if (message.method === 'Network.loadingFinished') {
      const item = requests.get(message.params.requestId);
      if (item) item.encodedBytes = message.params.encodedDataLength;
    }
  });
  const invoke = (method, params = {}) =>
    new Promise((done, fail) => {
      const id = ++sequence;
      pending.set(id, message =>
        message.error
          ? fail(new Error(method + ' failed'))
          : done(message.result)
      );
      websocket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async expression => {
    const result = await invoke('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error('Browser evaluation failed');
    return result.result.value;
  };
  await invoke('Page.enable');
  await invoke('Network.enable');
  await invoke('Network.setCacheDisabled', { cacheDisabled: true });

  async function navigate(path, text, viewport, extra = '') {
    requests = new Map();
    const url = frontend + path;
    await invoke('Page.navigate', { url });
    const check = `location.pathname === ${JSON.stringify(new URL(url).pathname)} && document.readyState === 'complete'
      && document.body?.innerText.includes(${JSON.stringify(text)}) ${extra}`;
    await waitFor(() => evaluate(check).catch(() => false), path + ' content');
    const measured = await evaluate(`(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      return {
        loadMs: navigation.loadEventEnd,
        fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        resources: performance.getEntriesByType('resource').filter(entry =>
          new URL(entry.name).pathname.endsWith('.js')).map(entry => new URL(entry.name).pathname)
      };
    })()`);
    const api = [...requests.values()].filter(
      item =>
        item.url.startsWith('http://localhost:3000/api/') &&
        item.method !== 'OPTIONS'
    );
    const scripts = new Set(measured.resources);
    console.log(
      JSON.stringify({
        path,
        viewport,
        loadMs: measured.loadMs,
        fcpMs: measured.fcpMs,
        horizontalOverflow: measured.horizontalOverflow,
        scriptCount: scripts.size,
        jsTransferBytes: [...requests.values()]
          .filter(item => scripts.has(new URL(item.url).pathname))
          .reduce((bytes, item) => bytes + (item.encodedBytes ?? 0), 0),
        apiRequests: api.length,
        duplicateApiRequests:
          api.length -
          new Set(api.map(item => item.method + ' ' + item.url)).size,
      })
    );
    assert.equal(measured.horizontalOverflow, false);
    if (
      path === '/' ||
      path.startsWith('/marketplace') ||
      path.startsWith('/listings/')
    ) {
      assert.ok(
        [...scripts].every(
          script =>
            !/CartesianChart|AdminOverviewPage|SellerAnalyticsPage/.test(script)
        )
      );
    }
    return api;
  }

  async function login(id) {
    const status =
      await evaluate(`fetch('http://localhost:3000/api/auth/sign-in', {
      method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({email:'perf-${id}@example.test', password:'Synthetic benchmark account 123!'})
    }).then(response => response.status)`);
    assert.equal(status, 200);
  }

  for (const width of [375, 768, 1440]) {
    await invoke('Emulation.setDeviceMetricsOverride', {
      width,
      height: 950,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await navigate('/', 'DealFlow', width, '&& !!document.querySelector("h1")');
    await navigate('/marketplace', 'Benchmark business', width);
    await navigate(
      '/marketplace?industry=Software&location=London&q=Benchmark',
      'Benchmark business',
      width
    );
    await navigate('/listings/1', 'Benchmark business 1', width);
    if (process.env.DEALFLOW_PERF_PUBLIC_ONLY === '1') continue;
    await login(1);
    const buyerRequests = await navigate(
      '/buyer',
      'Recent deal activity',
      width
    );
    if (process.env.DEALFLOW_PERF_EXPECT_DEDUPED === '1') {
      const unreadRequests = buyerRequests.filter(item => {
        const url = new URL(item.url);
        return (
          url.pathname === '/api/notifications' &&
          url.searchParams.get('unread') === 'true' &&
          url.searchParams.get('limit') === '1'
        );
      });
      assert.equal(unreadRequests.length, 1);
    }
    await navigate(
      '/buyer/conversations?conversation=1',
      'Synthetic inquiry message',
      width
    );
    await navigate('/buyer/deals/1', 'Offer and counteroffer history', width);
    await login(10);
    await navigate('/seller', 'Listing portfolio', width);
    await navigate('/seller/analytics', 'Acquisition activity funnel', width);
    await login(100);
    await navigate('/admin', 'User distribution', width);
    await invoke('Network.clearBrowserCookies');
  }
  if (process.env.DEALFLOW_PERF_PUBLIC_ONLY !== '1') {
    await invoke('Network.setBlockedURLs', {
      urls: ['http://localhost:3000/api/*'],
    });
    await navigate('/marketplace', 'Marketplace unavailable', 1440);
    await invoke('Network.setBlockedURLs', { urls: [] });
    await navigate('/marketplace', 'Benchmark business', 1440);
  }
} finally {
  websocket?.close();
  await Promise.all(
    children.reverse().map(async child => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill('SIGTERM');
      const closed = once(child, 'exit');
      await Promise.race([closed, sleep(2000)]);
      if (child.exitCode === null && child.signalCode === null)
        child.kill('SIGKILL');
      await closed;
    })
  );
  await rm(profile, { recursive: true, force: true });
}
