import 'dotenv/config';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL is required for the Drizzle testing configuration; refusing to use DATABASE_URL.'
  );
}

export default {
  schema: './src/models/*.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.TEST_DATABASE_URL,
  },
};
