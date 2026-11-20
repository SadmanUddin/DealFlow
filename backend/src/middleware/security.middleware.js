import aj from '#config/arcjet.js';
import logger from '#config/logger.js';
import { slidingWindow } from '@arcjet/node';
import { AppError } from '#utils/app-error.js';

const requestLimits = {
  buyer: 10,
  seller: 10,
  admin: 20,
  guest: 5,
};

const securityMiddleware = async (req, _res, next) => {
  const role = req.user?.role || 'guest';
  try {
    const client = aj.withRule(
      slidingWindow({
        mode: 'LIVE',
        interval: '1m',
        max: requestLimits[role] ?? requestLimits.guest,
        name: `${role}-rate-limit`,
      })
    );
    const decision = await client.protect(req);
    if (decision.isDenied()) {
      const rateLimited = decision.reason.isRateLimit();
      logger.warn('Request denied by Arcjet', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        reason: decision.reason.type,
      });
      return next(
        new AppError(
          rateLimited ? 429 : 403,
          rateLimited ? 'RATE_LIMITED' : 'REQUEST_BLOCKED',
          rateLimited
            ? 'Too many requests'
            : 'Request blocked by security policy'
        )
      );
    }
    next();
  } catch (error) {
    logger.error('Arcjet request protection failed', {
      error: error.message,
      path: req.path,
      method: req.method,
    });
    next(
      new AppError(
        503,
        'SECURITY_SERVICE_UNAVAILABLE',
        'Security checks are temporarily unavailable'
      )
    );
  }
};

export default securityMiddleware;
