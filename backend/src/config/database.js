import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { getEnvironment } from '#config/env.js';

const environment = getEnvironment();
const connectionString =
  environment.NODE_ENV === 'test'
    ? environment.TEST_DATABASE_URL
    : environment.DATABASE_URL;
const sql = neon(connectionString);
const db = drizzle(sql);
export { db, sql };

export const checkDatabase = () =>
  sql.query('SELECT 1', [], {
    fetchOptions: { signal: globalThis.AbortSignal.timeout(1500) },
  });
