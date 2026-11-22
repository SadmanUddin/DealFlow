import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

const probe = vi.hoisted(() => vi.fn());
vi.mock('#config/database.js', () => ({ db: {}, checkDatabase: probe }));
vi.mock('../src/config/logger.js', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.TEST_DATABASE_URL = 'postgresql://localhost:5432/dealflow_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-32-chars';
process.env.ARCJET_KEY = 'test-only-arcjet-key';

const { default: app } = await import('../src/app.js');

describe('Health Endpoint', () => {
  it('should return HTTP 200', async () => {
    const response = await request(app)
      .get('/health')
      .set('User-Agent', 'DealFlow-test/1.0');

    expect(response.status).toBe(200);
  });

  it('should return a JSON response', async () => {
    const response = await request(app)
      .get('/health')
      .set('User-Agent', 'DealFlow-test/1.0');

    expect(response.headers['content-type']).toContain('application/json');
  });
});

it('reports database readiness without leaking provider diagnostics', async () => {
  probe
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('fixture provider detail'));
  expect((await request(app).get('/ready')).status).toBe(200);
  const response = await request(app).get('/ready');
  expect(response.status).toBe(503);
  expect(response.body).toEqual({ status: 'unavailable' });
  expect(response.headers['cache-control']).toBe('no-store');
});
