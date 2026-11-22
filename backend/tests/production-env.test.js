import { afterEach, expect, it, vi } from 'vitest';
import { getEnvironment } from '#config/env.js';

afterEach(() => vi.unstubAllEnvs());

it('rejects insecure production browser and email-link origins', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('DATABASE_URL', 'postgresql://test:test@127.0.0.1:1/test');
  vi.stubEnv('CORS_ORIGINS', 'http://localhost:5173');
  vi.stubEnv('FRONTEND_URL', 'http://localhost:5173');
  expect(() => getEnvironment()).toThrow(/HTTPS in production/);
  vi.stubEnv('CORS_ORIGINS', 'https://dealflow.example.test');
  vi.stubEnv('FRONTEND_URL', 'https://dealflow.example.test');
  expect(getEnvironment().NODE_ENV).toBe('production');
});
