import { createHmac } from 'node:crypto';
import aj from '#config/arcjet.js';
import { getEnvironment } from '#config/env.js';
import logger from '#config/logger.js';
import { slidingWindow } from '@arcjet/node';
import { AppError } from '#utils/app-error.js';

const environment = getEnvironment();
const mode = environment.NODE_ENV === 'production' ? 'LIVE' : 'DRY_RUN';

const ipLimit = (name, interval, max) => ({
  name,
  interval,
  max,
  characteristics: ['ip.src'],
});

const userLimit = (name, interval, max) => ({
  name,
  interval,
  max,
  characteristics: ['userId'],
});

const accountLimit = (name, interval, max) => ({
  name,
  interval,
  max,
  characteristics: ['accountKey'],
});

const authenticatedLimits = (name, perUser = 240, perIp = 1200) => [
  userLimit(`${name}-user`, '1m', perUser),
  ipLimit(`${name}-shared-ip`, '1m', perIp),
];

const writeLimits = (name, perUser = 40, perIp = 300) => [
  userLimit(`${name}-user`, '1m', perUser),
  ipLimit(`${name}-shared-ip`, '1m', perIp),
];

const intervalLimits = (name, interval, perUser, perIp) => [
  userLimit(`${name}-user`, interval, perUser),
  ipLimit(`${name}-shared-ip`, interval, perIp),
];

const accountFingerprint = value =>
  createHmac('sha256', environment.JWT_SECRET).update(value).digest('hex');

const requestAccountKey = req => {
  const userId = req.user?.id;
  if (userId !== null && userId !== undefined && String(userId).trim())
    return accountFingerprint(`user:${String(userId)}`);

  const ip =
    typeof req.ip === 'string' && req.ip.trim()
      ? req.ip.trim()
      : req.socket?.remoteAddress || 'unknown';
  return accountFingerprint(`ip:${ip}`);
};

const emailKey = req => {
  const email = req.body?.email;
  if (typeof email !== 'string' || !email.trim() || email.length > 320)
    return undefined;
  // Pseudonymize account identifiers before they are used as a custom Arcjet
  // characteristic. Neither the email nor this value is written to logs.
  return accountFingerprint(`email:${email.trim().toLowerCase()}`);
};

const isPublicListingRead = req =>
  ['GET', 'HEAD'].includes(req.method) &&
  (req.path === '/api/listings' ||
    /^\/api\/listings\/[1-9]\d*$/.test(req.path));

const isDocumentUpload = req =>
  req.method === 'POST' &&
  /^\/api\/conversations\/[1-9]\d*\/documents$/.test(req.path);

const isDocumentDownload = req =>
  ['GET', 'HEAD'].includes(req.method) &&
  /^\/api\/(?:conversations\/[1-9]\d*|deals\/[1-9]\d*)\/documents\/[1-9]\d*\/download$/.test(
    req.path
  );

const isListingWrite = req =>
  (req.method === 'POST' && req.path === '/api/listings') ||
  (['PATCH', 'POST', 'DELETE'].includes(req.method) &&
    /^\/api\/listings\/[1-9]\d*(?:\/(?:submit|archive))?$/.test(req.path));

const isDealNegotiationWrite = req =>
  (req.method === 'POST' && req.path === '/api/deals') ||
  (req.method === 'PATCH' && /^\/api\/deals\/[1-9]\d*\/status$/.test(req.path)) ||
  (req.method === 'POST' &&
    /^\/api\/deals\/[1-9]\d*\/offers(?:\/[1-9]\d*\/(?:respond|withdraw))?$/.test(
      req.path
    ));

const isConversationWrite = req =>
  ['POST', 'PATCH'].includes(req.method) &&
  /^\/api\/conversations(?:\/[1-9]\d*(?:\/(?:messages|read|status))?)?$/.test(
    req.path
  );

const isAuthEmailOperation = req =>
  req.method === 'POST' &&
  ['/api/auth/forgot-password', '/api/auth/resend-verification'].includes(
    req.path
  );

/**
 * One Arcjet decision per API request, with endpoint-specific independent
 * counters. Authenticated requests use both account and shared-IP safeguards;
 * the IP ceiling is deliberately higher to accommodate NAT and shared networks.
 */
export function getRateLimitPolicy(req) {
  if (req.method === 'OPTIONS') return { name: 'cors-preflight', limits: [] };

  if (req.method === 'POST' && req.path === '/api/auth/sign-in') {
    const key = emailKey(req);
    return {
      name: 'authentication-sign-in',
      limits: [
        ...(key ? [accountLimit('sign-in-account', '15m', 10)] : []),
        ipLimit('sign-in-shared-ip', '15m', 120),
      ],
      accountKey: key,
    };
  }

  if (req.method === 'POST' && req.path === '/api/auth/sign-up') {
    const key = emailKey(req);
    return {
      name: 'authentication-sign-up',
      limits: [
        ...(key ? [accountLimit('sign-up-account', '1h', 5)] : []),
        ipLimit('sign-up-shared-ip', '1h', 30),
      ],
      accountKey: key,
    };
  }

  if (isAuthEmailOperation(req)) {
    const key = emailKey(req);
    return {
      name: 'authentication-email-delivery',
      limits: [
        ...(key ? [accountLimit('auth-email-account', '1h', 4)] : []),
        ipLimit('auth-email-shared-ip', '1h', 60),
      ],
      accountKey: key,
    };
  }

  if (
    req.method === 'POST' &&
    ['/api/auth/verify-email', '/api/auth/reset-password'].includes(req.path)
  ) {
    return {
      name: 'authentication-token-validation',
      limits: [ipLimit('auth-token-validation-ip', '15m', 30)],
    };
  }

  if (isPublicListingRead(req)) {
    return req.user
      ? {
        name: 'public-listings-authenticated-read',
        limits: authenticatedLimits('public-listings', 240, 1200),
      }
      : {
        name: 'public-listings-guest-read',
        limits: [ipLimit('public-listings-ip', '1m', 240)],
      };
  }

  if (req.path === '/api' && ['GET', 'HEAD'].includes(req.method)) {
    return {
      name: 'public-api-status',
      limits: [ipLimit('public-api-status-ip', '1m', 120)],
    };
  }

  if (isDocumentUpload(req)) {
    return req.user
      ? {
        name: 'private-document-upload',
        limits: [
          userLimit('document-upload-user', '1h', 12),
          ipLimit('document-upload-shared-ip', '1h', 80),
        ],
      }
      : {
        name: 'private-document-upload-guest',
        limits: [ipLimit('document-upload-guest-ip', '1h', 10)],
      };
  }

  if (isDocumentDownload(req)) {
    return req.user
      ? {
        name: 'private-document-download',
        limits: [
          userLimit('document-download-user', '1m', 30),
          ipLimit('document-download-shared-ip', '1m', 180),
        ],
      }
      : {
        name: 'private-document-download-guest',
        limits: [ipLimit('document-download-guest-ip', '1m', 30)],
      };
  }

  if (isListingWrite(req)) {
    return req.user
      ? {
        name: 'seller-listing-write',
        limits: intervalLimits('seller-listing-write', '1h', 20, 120),
      }
      : {
        name: 'guest-listing-write',
        limits: [ipLimit('guest-listing-write-ip', '1h', 10)],
      };
  }

  if (isDealNegotiationWrite(req)) {
    return req.user
      ? {
        name: 'deal-negotiation-write',
        limits: intervalLimits('deal-negotiation-write', '1m', 20, 120),
      }
      : {
        name: 'guest-deal-write',
        limits: [ipLimit('guest-deal-write-ip', '1m', 10)],
      };
  }

  if (isConversationWrite(req)) {
    return req.user
      ? {
        name: 'conversation-write',
        limits: intervalLimits('conversation-write', '1m', 60, 360),
      }
      : {
        name: 'guest-conversation-write',
        limits: [ipLimit('guest-conversation-write-ip', '1m', 20)],
      };
  }

  if (req.method === 'POST' && req.path === '/api/reports') {
    return req.user
      ? {
        name: 'report-submission',
        limits: intervalLimits('report-submission', '1h', 10, 60),
      }
      : {
        name: 'guest-report-submission',
        limits: [ipLimit('guest-report-submission-ip', '1h', 10)],
      };
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    return req.user
      ? {
        name: 'authenticated-api-read',
        limits: authenticatedLimits('authenticated-read', 240, 1200),
      }
      : {
        name: 'guest-api-read',
        limits: [ipLimit('guest-api-read-ip', '1m', 180)],
      };
  }

  return req.user
    ? {
      name: req.user.role === 'admin' ? 'admin-api-write' : 'api-write',
      limits: writeLimits(
        req.user.role === 'admin' ? 'admin-write' : 'api-write',
        req.user.role === 'admin' ? 60 : 40,
        req.user.role === 'admin' ? 360 : 300
      ),
    }
    : {
      name: 'guest-api-write',
      limits: [ipLimit('guest-api-write-ip', '1m', 30)],
    };
}

const retrySeconds = reason => {
  const reset = Number(reason?.reset);
  return Number.isFinite(reset) && reset > 0 ? Math.ceil(reset) : 60;
};

const ruleNames = policy => policy.limits.map(limit => limit.name);

const securityMiddleware = async (req, res, next) => {
  if (req.path !== '/api' && !req.path.startsWith('/api/')) return next();

  const policy = getRateLimitPolicy(req);
  if (policy.limits.length === 0) return next();

  try {
    let requestProtector = aj;
    for (const limit of policy.limits) {
      requestProtector = requestProtector.withRule(
        slidingWindow({
          mode,
          interval: limit.interval,
          max: limit.max,
          characteristics: limit.characteristics,
        })
      );
    }

    const characteristics = {
      ...(req.user ? { userId: String(req.user.id) } : {}),
      accountKey: policy.accountKey || requestAccountKey(req),
    };
    const decision = await requestProtector.protect(req, characteristics);

    if (decision.isDenied()) {
      const rateLimited = decision.reason.isRateLimit();
      const seconds = rateLimited ? retrySeconds(decision.reason) : undefined;
      if (rateLimited) {
        const max = Number(decision.reason.max);
        const window = Number(decision.reason.window);
        if (Number.isFinite(max)) {
          res.setHeader(
            'RateLimit',
            `limit=${max}, remaining=0, reset=${seconds}`
          );
          if (Number.isFinite(window))
            res.setHeader('RateLimit-Policy', `${max};w=${window}`);
        }
        res.setHeader('Retry-After', String(seconds));
      }

      logger.warn('Arcjet rejected an API request', {
        requestId: req.requestId,
        method: req.method,
        endpoint: req.path,
        policy: policy.name,
        appliedPolicies: ruleNames(policy),
        reason: decision.reason.type,
        decisionId: decision.id,
        environment: environment.NODE_ENV,
        authenticated: Boolean(req.user),
      });

      return next(
        new AppError(
          rateLimited ? 429 : 403,
          rateLimited ? 'RATE_LIMITED' : 'REQUEST_BLOCKED',
          rateLimited
            ? `Too many requests. Try again in ${seconds} seconds.`
            : 'Request blocked by security policy'
        )
      );
    }

    if (decision.conclusion === 'ERROR') {
      logger.warn('Arcjet decision returned an error; request allowed', {
        requestId: req.requestId,
        method: req.method,
        endpoint: req.path,
        policy: policy.name,
        decisionId: decision.id,
        environment: environment.NODE_ENV,
        authenticated: Boolean(req.user),
      });
    }
    return next();
  } catch (error) {
    // Arcjet's SDK is designed to fail open when its cloud decision service is
    // unavailable. Keep that availability behavior and record a safe diagnostic.
    logger.error('Arcjet protection threw unexpectedly; request allowed', {
      requestId: req.requestId,
      method: req.method,
      endpoint: req.path,
      policy: policy.name,
      environment: environment.NODE_ENV,
      authenticated: Boolean(req.user),
      errorName: error?.name ?? 'Error',
    });
    return next();
  }
};

export default securityMiddleware;
