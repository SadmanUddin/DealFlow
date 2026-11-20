import { beforeEach, describe, expect, it, vi } from 'vitest';

const arcjetMocks = vi.hoisted(() => ({
  rules: [],
  slidingWindow: vi.fn(rule => rule),
  protect: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('#config/arcjet.js', () => {
  const client = {
    withRule: vi.fn(rule => {
      arcjetMocks.rules.push(rule);
      return client;
    }),
    protect: arcjetMocks.protect,
  };
  return { default: client };
});

vi.mock('@arcjet/node', () => ({
  slidingWindow: arcjetMocks.slidingWindow,
}));

vi.mock('#config/logger.js', () => ({
  default: { warn: arcjetMocks.warn, error: arcjetMocks.error },
}));

const { default: securityMiddleware } =
  await import('#middleware/security.middleware.js');

const allowedDecision = {
  isDenied: () => false,
  reason: { isRateLimit: () => false, type: 'REQUEST_ALLOWED' },
};

const runMiddleware = async ({ method, path, role } = {}) => {
  const req = {
    method: method ?? 'GET',
    path: path ?? '/api/auth/me',
    ip: '127.0.0.1',
    user: role ? { role } : undefined,
  };
  const next = vi.fn();
  await securityMiddleware(req, {}, next);
  return next;
};

describe('Arcjet request rate policies', () => {
  beforeEach(() => {
    arcjetMocks.rules.length = 0;
    arcjetMocks.slidingWindow.mockClear();
    arcjetMocks.protect.mockReset().mockResolvedValue(allowedDecision);
  });

  it.each([['/api/auth/me'], ['/api/auth/csrf'], ['/api/users/profile']])(
    'uses a dedicated read-only window for GET %s',
    async path => {
      const next = await runMiddleware({ path });

      expect(next).toHaveBeenCalledWith();
      expect(arcjetMocks.rules).toEqual([
        expect.objectContaining({
          interval: '1m',
          max: 60,
          name: 'session-read-rate-limit',
        }),
      ]);
    }
  );

  it('retains burst and guest per-minute limits for sign-in writes', async () => {
    await runMiddleware({ method: 'POST', path: '/api/auth/sign-in' });

    expect(arcjetMocks.rules).toEqual([
      expect.objectContaining({
        interval: '2s',
        max: 5,
        name: 'request-burst-limit',
      }),
      expect.objectContaining({
        interval: '1m',
        max: 5,
        name: 'guest-rate-limit',
      }),
    ]);
  });

  it('keeps a 429 decision as an error instead of retrying internally', async () => {
    arcjetMocks.protect.mockResolvedValueOnce({
      isDenied: () => true,
      reason: { isRateLimit: () => true, type: 'RATE_LIMIT' },
    });
    const next = await runMiddleware({ path: '/api/auth/me' });

    expect(arcjetMocks.protect).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
    });
  });
});
