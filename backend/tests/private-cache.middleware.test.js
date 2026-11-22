import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { privateCacheMiddleware } from '#middleware/private-cache.middleware.js';

describe('API HTTP cache policy', () => {
  it.each([
    ['/api/auth/me', { user: { id: 7 } }],
    ['/api/auth/csrf', { csrfToken: 'short-lived-session-value' }],
    ['/api/users/profile', { user: { id: 7, email: 'buyer@example.test' } }],
    ['/api/favorites', { favorites: [] }],
    ['/api/deals', { deals: [] }],
    ['/api/notifications', { notifications: [] }],
    ['/api/conversations', { conversations: [] }],
    ['/api/conversations/5/documents', { documents: [] }],
    ['/api/admin/dashboard', { statistics: {} }],
    ['/api/listings/mine', { listings: [] }],
  ])(
    'prevents conditional caching of private response %s',
    async (path, body) => {
      const app = express();
      app.use(privateCacheMiddleware);
      app.get(path, (_req, res) => res.json(body));

      const first = await request(app).get(path).expect(200);
      expect(first.headers['cache-control']).toContain('private');
      expect(first.headers['cache-control']).toContain('no-store');
      expect(first.headers.etag).toBeDefined();

      const revalidated = await request(app)
        .get(path)
        .set('If-None-Match', first.headers.etag)
        .set('If-Modified-Since', new Date().toUTCString())
        .expect(200);
      expect(revalidated.body).toEqual(body);
      expect(revalidated.headers['cache-control']).toContain('no-store');
    }
  );

  it.each(['/api/listings', '/api/listings/42'])(
    'allows short public caching for public listing response %s',
    async path => {
      const app = express();
      app.use(privateCacheMiddleware);
      app.get(path, (_req, res) => res.json({ listing: 'published' }));

      const first = await request(app).get(path).expect(200);
      expect(first.headers['cache-control']).toBe(
        'public, no-cache'
      );

      const revalidated = await request(app)
        .get(path)
        .set('If-None-Match', first.headers.etag)
        .expect(304);
      expect(revalidated.headers['cache-control']).toContain('public');
    }
  );

  it('does not alter non-API static or application routes', async () => {
    const app = express();
    app.use(privateCacheMiddleware);
    app.get('/marketplace', (_req, res) => res.json({ page: 'marketplace' }));

    const response = await request(app).get('/marketplace').expect(200);
    expect(response.headers['cache-control']).toBeUndefined();
  });
});
