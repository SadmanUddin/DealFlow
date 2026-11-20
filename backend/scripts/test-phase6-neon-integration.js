import dotenv from 'dotenv';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

dotenv.config({ quiet: true });
if (!process.env.TEST_DATABASE_URL) {
  console.error(
    'TEST_DATABASE_URL is required to run Phase 6 Neon integration tests.'
  );
  process.exit(1);
}
const databaseName = decodeURIComponent(
  new URL(process.env.TEST_DATABASE_URL).pathname.slice(1)
);
const targetUrl = new URL(process.env.TEST_DATABASE_URL);
const safeNeonTestTarget =
  targetUrl.hostname ===
    'ep-super-king-b9pem88j-pooler.c-7.eu-central-1.aws.neon.tech' &&
  databaseName === 'neondb' &&
  decodeURIComponent(targetUrl.username) === 'neondb_owner';
if (!safeNeonTestTarget) {
  console.error(
    'Refusing to run Phase 6 integration tests: TEST_DATABASE_URL does not match the repository’s designated Neon test database.'
  );
  process.exit(1);
}
const vitestCli = fileURLToPath(
  new URL('../node_modules/vitest/vitest.mjs', import.meta.url)
);
const result = spawnSync(
  process.execPath,
  [vitestCli, 'run', 'tests/integration/phase6.neon.test.js'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
      EMAIL_PROVIDER: 'mock',
    },
  }
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
