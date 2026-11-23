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

  it('charges encoded diligence route IDs against the same write budget', () => {
    const policy = path =>
      getRateLimitPolicy(createRequest({ method: 'PATCH', path, role: 'buyer' }));
    const canonical = policy('/api/deals/1/diligence/checklist/2');
    expect(canonical.name).toBe('deal-diligence-write');
    expect(policy('/api/deals/%31/diligence/checklist/%32')).toEqual(canonical);
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
    const { next } = await runMiddleware({
      path: '/api/deals',
      role: 'buyer',
      userId: 17,
    });
    expect(next).toHaveBeenCalledWith();
    expect(arcjetMocks.protect).toHaveBeenCalledOnce();
    const characteristics = arcjetMocks.protect.mock.calls[0][1];
    expect(characteristics.userId).toBe('17');
    expect(characteristics.accountKey).toMatch(/^[a-f0-9]{64}$/);
    expect(characteristics.accountKey).not.toBe('17');
    expect(arcjetMocks.rules).toHaveLength(2);
    expect(arcjetMocks.rules.every(rule => rule.mode === 'DRY_RUN')).toBe(true);
  });

  it('provides Arcjet a pseudonymous user characteristic for anonymous requests', async () => {
    const { req } = await runMiddleware({ path: '/api/listings' });
    const characteristics = arcjetMocks.protect.mock.calls[0][1];

    expect(characteristics.userId).toMatch(/^guest:[a-f0-9]{64}$/);
    expect(characteristics.accountKey).toMatch(/^[a-f0-9]{64}$/);
    expect(characteristics.userId).not.toContain(req.ip);
  });

  it('does not trust a forwarded address over Express’s configured client IP', async () => {
    const { req } = await runMiddleware({
      path: '/api/listings',
      headers: { 'x-forwarded-for': '198.51.100.200' },
      ip: '192.0.2.10',
    });
    expect(req.ip).toBe('192.0.2.10');
    const characteristics = arcjetMocks.protect.mock.calls[0][1];
    expect(characteristics.accountKey).toMatch(/^[a-f0-9]{64}$/);
    expect(characteristics.accountKey).not.toContain(req.ip);
  });

  it('keeps authenticated users on the same IP in separate pseudonymous buckets', async () => {
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
    const firstCharacteristics = arcjetMocks.protect.mock.calls[0][1];
    const secondCharacteristics = arcjetMocks.protect.mock.calls[1][1];
    expect(firstCharacteristics.userId).toBe('1');
    expect(secondCharacteristics.userId).toBe('2');
    expect(firstCharacteristics.accountKey).toMatch(/^[a-f0-9]{64}$/);
    expect(secondCharacteristics.accountKey).toMatch(/^[a-f0-9]{64}$/);
    expect(firstCharacteristics.accountKey).not.toBe(
      secondCharacteristics.accountKey
    );
    expect(arcjetMocks.protect).toHaveBeenCalledTimes(2);
  });

  it('generates the same non-empty account key for repeated requests from one user', async () => {
    const first = await runMiddleware({
      path: '/api/deals',
      role: 'buyer',
      userId: 17,
    });
    const repeated = await runMiddleware({
      path: '/api/conversations',
      role: 'buyer',
      userId: 17,
      ip: '192.0.2.99',
    });
    const firstKey = arcjetMocks.protect.mock.calls[0][1].accountKey;
    const repeatedKey = arcjetMocks.protect.mock.calls[1][1].accountKey;
    expect(first.next).toHaveBeenCalledWith();
    expect(repeated.next).toHaveBeenCalledWith();
    expect(firstKey).toMatch(/^[a-f0-9]{64}$/);
    expect(repeatedKey).toBe(firstKey);
  });

  it('uses a stable pseudonymous IP fallback for unauthenticated requests', async () => {
    const first = createRequest({ path: '/api/listings', ip: '192.0.2.20' });
    const repeated = createRequest({ path: '/api/listings', ip: '192.0.2.20' });
    const other = createRequest({ path: '/api/listings', ip: '192.0.2.21' });
    const next = vi.fn();
    const res = { setHeader: vi.fn() };
    await Promise.all([
      securityMiddleware(first, res, next),
      securityMiddleware(repeated, res, next),
      securityMiddleware(other, res, next),
    ]);
    const keys = arcjetMocks.protect.mock.calls.map(call => call[1].accountKey);
    expect(keys[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(keys.join(' ')).not.toContain('192.0.2.20');
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
        policy: 'public-listings-guest-read',
        reason: 'RATE_LIMIT',
        authenticated: false,
      })
    );
    expect(JSON.stringify(arcjetMocks.warn.mock.calls)).not.toContain('198.51');
    expect(arcjetMocks.warn.mock.calls[0][1]).not.toHaveProperty('endpoint');
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

it('applies the same protection to Express-equivalent route spellings', async () => {
  const signIn = { method: 'POST', body: { email: 'buyer@example.test' } };
  expect(
    getRateLimitPolicy(createRequest({ ...signIn, path: '/API/AUTH/SIGN-IN/' }))
  ).toEqual(
    getRateLimitPolicy(createRequest({ ...signIn, path: '/api/auth/sign-in' }))
  );
  const { next } = await runMiddleware({
    ...signIn,
    path: '/API/AUTH/SIGN-IN/',
  });
  expect(next).toHaveBeenCalledOnce();
  expect(
    getRateLimitPolicy(
      createRequest({
        path: '/api/deals/4/closing',
        method: 'POST',
        role: 'buyer',
      })
    ).name
  ).toBe('deal-negotiation-write');
});

it('uses a dedicated account and network limit for administrator MFA changes', () => {
  const policy = getRateLimitPolicy(
    createRequest({
      method: 'POST',
      path: '/api/auth/admin-mfa/recovery',
      role: 'admin',
    })
  );
  expect(policy.name).toBe('administrator-mfa');
  expect(policy.limits).toEqual([
    expect.objectContaining({ max: 10, characteristics: ['userId'] }),
    expect.objectContaining({ max: 60, characteristics: ['ip.src'] }),
  ]);
});
