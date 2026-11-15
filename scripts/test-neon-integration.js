import dotenv from 'dotenv';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

dotenv.config({ quiet: true });

if (!process.env.TEST_DATABASE_URL) {
  console.error(
    'TEST_DATABASE_URL is required to run the Neon integration suite.'
  );
  process.exit(1);
}

const vitestCli = fileURLToPath(
  new URL('../node_modules/vitest/vitest.mjs', import.meta.url)
);
const result = spawnSync(
  process.execPath,
  [vitestCli, 'run', 'tests/integration/phase2.neon.test.js'],
  { stdio: 'inherit', env: process.env }
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
