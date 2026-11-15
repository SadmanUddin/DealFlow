import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

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
