import dotenv from 'dotenv';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

dotenv.config({ quiet: true });

if (!process.env.TEST_DATABASE_URL) {
  console.error(
    'TEST_DATABASE_URL is required to run the Phase 4 Neon integration tests.'
  );
  process.exit(1);
}

const vitestCli = fileURLToPath(
  new URL('../node_modules/vitest/vitest.mjs', import.meta.url)
);
const testFile = 'tests/integration/phase4.neon.test.js';
const result = spawnSync(process.execPath, [vitestCli, 'run', testFile], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'test',
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
  },
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
