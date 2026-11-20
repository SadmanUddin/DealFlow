import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

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
