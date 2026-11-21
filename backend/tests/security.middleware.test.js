import { beforeEach, describe, expect, it, vi } from 'vitest';

const arcjetMocks = vi.hoisted(() => ({
  rules: [],
  slidingWindow: vi.fn(rule => rule),
  withRule: vi.fn(),
  protect: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('#config/arcjet.js', () => {
  const client = {
    withRule: arcjetMocks.withRule,
    protect: arcjetMocks.protect,
  };
  arcjetMocks.withRule.mockImplementation(rule => {
    arcjetMocks.rules.push(rule);
    return client;
  });
  return { default: client };
});

vi.mock('@arcjet/node', () => ({
  slidingWindow: arcjetMocks.slidingWindow,
}));

vi.mock('#config/logger.js', () => ({
  default: { warn: arcjetMocks.warn, error: arcjetMocks.error },
}));

const { default: securityMiddleware, getRateLimitPolicy } =
  await import('#middleware/security.middleware.js');

const allowedDecision = {
  conclusion: 'ALLOW',
  id: 'decision-allow',
  isDenied: () => false,
  reason: { isRateLimit: () => false, type: 'REQUEST_ALLOWED' },
};

const createRequest = ({
  method = 'GET',
  path = '/api/deals',
  role,
  userId = 7,
  body,
  headers = {},
  ip = '192.0.2.10',
} = {}) => ({
  method,
  path,
  originalUrl: path,
  ip,
  headers,
  body,
  requestId: '00000000-0000-4000-8000-000000000001',
  user: role ? { id: userId, role } : undefined,
});

const runMiddleware = async options => {
  const req = createRequest(options);
  const next = vi.fn();
  const res = {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };
  await securityMiddleware(req, res, next);
  return { req, res, next };
};

describe('Arcjet endpoint policy selection', () => {
  it('uses an IP policy for anonymous public listing search and detail reads', () => {
    for (const path of ['/api/listings', '/api/listings/42']) {
      expect(getRateLimitPolicy(createRequest({ path }))).toMatchObject({
        name: 'public-listings-guest-read',
        limits: [
          expect.objectContaining({
            name: 'public-listings-ip',
            interval: '1m',
            max: 240,
            characteristics: ['ip.src'],
          }),
        ],
      });
    }
  });

  it('partitions authenticated reads by account and applies a higher shared-IP ceiling', () => {
    const policy = getRateLimitPolicy(
      createRequest({ path: '/api/notifications', role: 'buyer', userId: 17 })
    );
    expect(policy.name).toBe('authenticated-api-read');
    expect(policy.limits).toEqual([
      expect.objectContaining({
        name: 'authenticated-read-user',
        max: 240,
        characteristics: ['userId'],
      }),
      expect.objectContaining({
        name: 'authenticated-read-shared-ip',
        max: 1200,
        characteristics: ['ip.src'],
      }),
    ]);
  });

  it.each([
    ['/api/deals', 'authenticated-api-read'],
    ['/api/favorites', 'authenticated-api-read'],
    ['/api/notifications', 'authenticated-api-read'],
    ['/api/conversations', 'authenticated-api-read'],
    ['/api/users/profile', 'authenticated-api-read'],
    ['/api/admin/dashboard', 'authenticated-api-read'],
  ])('classifies %s as a normal authenticated read', (path, name) => {
    expect(
      getRateLimitPolicy(createRequest({ path, role: 'buyer' })).name
    ).toBe(name);
  });

  it('adds a per-account and per-IP ceiling to sign-in attempts without using raw email', () => {
    const policy = getRateLimitPolicy(
      createRequest({
        method: 'POST',
        path: '/api/auth/sign-in',
        body: { email: ' Buyer@example.test ' },
      })
    );
    expect(policy.name).toBe('authentication-sign-in');
    expect(policy.limits.map(limit => limit.name)).toEqual([
      'sign-in-account',
      'sign-in-shared-ip',
    ]);
    expect(policy.accountKey).toMatch(/^[a-f0-9]{64}$/);
    expect(policy.accountKey).not.toContain('buyer');
    expect(
      getRateLimitPolicy(
        createRequest({
          method: 'POST',
          path: '/api/auth/sign-in',
          body: { email: 'buyer@example.test' },
        })
      ).accountKey
    ).toBe(policy.accountKey);
  });

  it('limits registration and recovery email operations more tightly than reads', () => {
    const registration = getRateLimitPolicy(
      createRequest({
        method: 'POST',
        path: '/api/auth/sign-up',
        body: { email: 'seller@example.test' },
      })
    );
    const resend = getRateLimitPolicy(
      createRequest({
        method: 'POST',
        path: '/api/auth/resend-verification',
        body: { email: 'seller@example.test' },
      })
    );
    expect(registration.limits[0]).toMatchObject({ interval: '1h', max: 5 });
    expect(resend.limits[0]).toMatchObject({ interval: '1h', max: 4 });
  });

  it('limits document uploads and downloads independently', () => {
    expect(
      getRateLimitPolicy(
        createRequest({
          method: 'POST',
          path: '/api/conversations/8/documents',
          role: 'seller',
        })
      )
    ).toMatchObject({
      name: 'private-document-upload',
      limits: [
        expect.objectContaining({ interval: '1h', max: 12 }),
        expect.objectContaining({ interval: '1h', max: 80 }),
      ],
    });
    expect(
      getRateLimitPolicy(
        createRequest({
          path: '/api/deals/5/documents/12/download',
          role: 'buyer',
        })
      ).name
    ).toBe('private-document-download');
  });

  it('uses distinct write budgets for listings, negotiations, conversations, reports, and admin actions', () => {
    expect(
      getRateLimitPolicy(
        createRequest({ method: 'POST', path: '/api/listings', role: 'seller' })
      )
    ).toMatchObject({
      name: 'seller-listing-write',
      limits: expect.arrayContaining([
        expect.objectContaining({ interval: '1h', max: 20 }),
        expect.objectContaining({ interval: '1h', max: 120 }),
      ]),
    });
    expect(
      getRateLimitPolicy(
        createRequest({
          method: 'POST',
          path: '/api/deals/5/offers',
          role: 'buyer',
        })
      )
    ).toMatchObject({
      name: 'deal-negotiation-write',
      limits: expect.arrayContaining([
        expect.objectContaining({ interval: '1m', max: 20 }),
        expect.objectContaining({ interval: '1m', max: 120 }),
      ]),
    });
    expect(
      getRateLimitPolicy(
        createRequest({
          method: 'POST',
          path: '/api/conversations/8/messages',
          role: 'buyer',
        })
      )
    ).toMatchObject({
      name: 'conversation-write',
      limits: expect.arrayContaining([
        expect.objectContaining({ interval: '1m', max: 60 }),
        expect.objectContaining({ interval: '1m', max: 360 }),
      ]),
    });
    expect(
      getRateLimitPolicy(
        createRequest({ method: 'POST', path: '/api/reports', role: 'buyer' })
      ).name
    ).toBe('report-submission');
    expect(
      getRateLimitPolicy(
        createRequest({
          method: 'PATCH',
          path: '/api/admin/users/3/status',
          role: 'admin',
        })
      ).name
    ).toBe('admin-api-write');
  });

  it('does not apply route rate rules to CORS preflight or non-API assets', () => {
    expect(
      getRateLimitPolicy(createRequest({ method: 'OPTIONS' })).limits
    ).toHaveLength(0);
  });

  it('protects the API status route after moving it behind global middleware', () => {
    expect(getRateLimitPolicy(createRequest({ path: '/api' }))).toMatchObject({
      name: 'public-api-status',
      limits: [expect.objectContaining({ max: 120, interval: '1m' })],
    });
  });
});

describe('Arcjet request middleware', () => {
  beforeEach(() => {
    arcjetMocks.rules.length = 0;
    arcjetMocks.slidingWindow.mockClear();
    arcjetMocks.withRule.mockClear();
    arcjetMocks.protect.mockReset().mockResolvedValue(allowedDecision);
    arcjetMocks.warn.mockClear();
    arcjetMocks.error.mockClear();
  });

  it('makes one protect call for a read, with the authenticated user characteristic', async () => {
    const { req, next } = await runMiddleware({
      path: '/api/deals',
      role: 'buyer',
      userId: 17,
    });
    expect(next).toHaveBeenCalledWith();
    expect(arcjetMocks.protect).toHaveBeenCalledOnce();
    expect(arcjetMocks.protect).toHaveBeenCalledWith(req, { userId: '17' });
    expect(arcjetMocks.rules).toHaveLength(2);
    expect(arcjetMocks.rules.every(rule => rule.mode === 'DRY_RUN')).toBe(true);
  });

  it('does not trust a forwarded address over Express’s configured client IP', async () => {
    const { req } = await runMiddleware({
      path: '/api/listings',
      headers: { 'x-forwarded-for': '198.51.100.200' },
      ip: '192.0.2.10',
    });
    expect(req.ip).toBe('192.0.2.10');
    expect(arcjetMocks.protect).toHaveBeenCalledWith(req, {});
  });

  it('keeps simultaneous users on the same IP in separate user buckets', async () => {
    const first = createRequest({
      path: '/api/deals',
      role: 'buyer',
      userId: '1',
    });
    const second = createRequest({
      path: '/api/deals',
      role: 'buyer',
      userId: '2',
    });
    const next = vi.fn();
    const res = { setHeader: vi.fn() };
    await Promise.all([
      securityMiddleware(first, res, next),
      securityMiddleware(second, res, next),
    ]);
    expect(arcjetMocks.protect).toHaveBeenNthCalledWith(1, first, {
      userId: '1',
    });
    expect(arcjetMocks.protect).toHaveBeenNthCalledWith(2, second, {
      userId: '2',
    });
    expect(arcjetMocks.protect).toHaveBeenCalledTimes(2);
  });

  it('returns a consistent 429 with Retry-After and rate-limit headers', async () => {
    const denied = {
      conclusion: 'DENY',
      id: 'decision-limited',
      isDenied: () => true,
      reason: {
        isRateLimit: () => true,
        type: 'RATE_LIMIT',
        max: 240,
        remaining: 0,
        window: 60,
        reset: 23.2,
      },
    };
    arcjetMocks.protect.mockResolvedValueOnce(denied);
    const { next, res, req } = await runMiddleware({ path: '/api/listings' });
    const error = next.mock.calls[0][0];
    expect(error).toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Too many requests. Try again in 24 seconds.',
    });
    expect(res.headers).toEqual({
      RateLimit: 'limit=240, remaining=0, reset=24',
      'RateLimit-Policy': '240;w=60',
      'Retry-After': '24',
    });
    expect(arcjetMocks.warn).toHaveBeenCalledWith(
      'Arcjet rejected an API request',
      expect.objectContaining({
        requestId: req.requestId,
        endpoint: '/api/listings',
        policy: 'public-listings-guest-read',
        reason: 'RATE_LIMIT',
        authenticated: false,
      })
    );
    expect(JSON.stringify(arcjetMocks.warn.mock.calls)).not.toContain('198.51');
  });

  it('logs a denied write policy without logging body content', async () => {
    arcjetMocks.protect.mockResolvedValueOnce({
      ...allowedDecision,
      conclusion: 'DENY',
      isDenied: () => true,
      reason: { isRateLimit: () => false, type: 'BOT' },
    });
    await runMiddleware({
      method: 'POST',
      path: '/api/conversations/4/messages',
      role: 'buyer',
      body: { content: 'private message body' },
    });
    expect(arcjetMocks.warn).toHaveBeenCalledWith(
      'Arcjet rejected an API request',
      expect.objectContaining({
        policy: 'conversation-write',
        appliedPolicies: [
          'conversation-write-user',
          'conversation-write-shared-ip',
        ],
        authenticated: true,
      })
    );
    expect(JSON.stringify(arcjetMocks.warn.mock.calls)).not.toContain(
      'private message body'
    );
  });

  it('allows non-API paths without contacting Arcjet', async () => {
    const { next } = await runMiddleware({ path: '/not-an-api-route' });
    expect(next).toHaveBeenCalledWith();
    expect(arcjetMocks.protect).not.toHaveBeenCalled();
  });

  it('applies one Arcjet decision to the API status route', async () => {
    const { next } = await runMiddleware({ path: '/api' });
    expect(next).toHaveBeenCalledWith();
    expect(arcjetMocks.protect).toHaveBeenCalledOnce();
  });

  it('fails open on Arcjet service errors and emits a diagnostic', async () => {
    arcjetMocks.protect.mockRejectedValueOnce(new Error('provider offline'));
    const { req, next } = await runMiddleware({ path: '/api/deals' });
    expect(next).toHaveBeenCalledWith();
    expect(arcjetMocks.error).toHaveBeenCalledWith(
      'Arcjet protection threw unexpectedly; request allowed',
      expect.objectContaining({
        requestId: req.requestId,
        policy: 'guest-api-read',
        errorName: 'Error',
      })
    );
    expect(JSON.stringify(arcjetMocks.error.mock.calls)).not.toContain(
      'provider offline'
    );
  });
});
