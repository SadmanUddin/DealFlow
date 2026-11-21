// Set deterministic, non-production values before test modules are imported.
// The port is intentionally closed; this suite must never connect to a database.
process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL =
  'postgresql://test:test@127.0.0.1:1/dealflow_test';
process.env.JWT_SECRET = 'dealflow-vitest-only-secret-never-use-outside-tests';
process.env.ARCJET_KEY = 'ajkey_test_dummy_not_a_real_credential';
process.env.DOCUMENT_STORAGE_DRIVER = 'mock';
process.env.EMAIL_PROVIDER = 'mock';
