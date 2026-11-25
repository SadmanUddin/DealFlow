import { performance } from 'node:perf_hooks';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

import { databaseUrl } from './fixture-config.js';

if (
  process.env.NODE_ENV !== 'test' ||
  process.env.DEALFLOW_PERF_DATABASE_URL !== databaseUrl
) {
  throw new Error('The disposable localhost Phase 12 database is required.');
}

export const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 10,
  connectionTimeoutMillis: 1500,
  statement_timeout: 5000,
});

export const metrics = { queries: 0, failures: 0, durationMs: 0 };
export const statements = new Map();
const query = pool.query.bind(pool);
pool.query = async (config, values) => {
  const start = performance.now();
  try {
    return await query(config, values);
  } catch (error) {
    metrics.failures++;
    throw error;
  } finally {
    metrics.queries++;
    metrics.durationMs += performance.now() - start;
    const statement = typeof config === 'string' ? config : config.text;
    if (/^\s*(select|with|update)\b/i.test(statement)) {
      statements.set(statement, values ?? config.values ?? []);
    }
  }
};

export const db = drizzle(pool);
export const checkDatabase = () => pool.query('SELECT 1');

export async function explainObservedQueries(pattern) {
  const client = await pool.connect();
  try {
    for (const [statement, params] of statements) {
      if (!pattern.test(statement)) continue;
      await client.query('BEGIN');
      try {
        const { rows } = await client.query(
          'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + statement,
          params
        );
        console.log(JSON.stringify({ statement, plan: rows[0]['QUERY PLAN'] }));
      } finally {
        await client.query('ROLLBACK');
      }
    }
  } finally {
    client.release();
  }
}
