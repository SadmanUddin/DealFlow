import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { getEnvironment } from '#config/env.js';

const { DATABASE_URL } = getEnvironment();
const sql = neon(DATABASE_URL);
const db = drizzle(sql);
export { db, sql };
