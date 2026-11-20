import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { privateCacheMiddleware } from '#middleware/private-cache.middleware.js';

describe('private API cache headers', () => {
  it.each([
    ['/api/auth/me', { user: { id: 7 } }],
    ['/api/auth/csrf', { csrfToken: 'short-lived-session-value' }],
    ['/api/users/profile', { user: { id: 7, email: 'buyer@example.test' } }],
  ])(
    'does not return 304 for a conditional request to %s',
    async (path, body) => {
      const app = express();
      app.use(privateCacheMiddleware);
      app.get(path, (_req, res) => res.json(body));

      const first = await request(app).get(path).expect(200);
      expect(first.headers['cache-control']).toContain('no-store');
      expect(first.headers.etag).toBeDefined();

      const revalidated = await request(app)
        .get(path)
        .set('If-None-Match', first.headers.etag)
        .expect(200);
      expect(revalidated.body).toEqual(body);
      expect(revalidated.headers['cache-control']).toContain('no-store');
    }
  );

  it('leaves public responses outside the private cache policy', async () => {
    const app = express();
    app.use(privateCacheMiddleware);
    app.get('/api/listings', (_req, res) => res.json({ listings: [] }));

    const response = await request(app).get('/api/listings').expect(200);
    expect(response.headers['cache-control']).toBeUndefined();
  });
});
