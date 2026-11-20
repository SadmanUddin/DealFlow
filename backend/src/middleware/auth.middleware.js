import { timingSafeEqual } from 'node:crypto';
import { findActiveSession, hashOpaqueToken } from '#services/auth.service.js';
import { AppError } from '#utils/app-error.js';
import { verifyAccessToken } from '#utils/jwt.js';

const getRequestToken = req => {
  if (req.cookies?.token) return req.cookies.token;
  return null;
};

export const optionalAuthentication = async (req, _res, next) => {
  const token = getRequestToken(req);
  if (!token) return next();

  try {
    const tokenClaims = verifyAccessToken(token);
    const session = await findActiveSession(tokenClaims);
    if (!session)
      throw new AppError(
        401,
        'INVALID_SESSION',
        'Authentication session is invalid or expired'
      );
    req.user = {
      id: session.userId,
      email: session.email,
      role: session.role,
      emailVerified: session.emailVerified,
    };
    req.authSession = session;
  } catch (error) {
    if (error instanceof AppError) {
      req.authError = error;
    } else {
      return next(
        new AppError(
          503,
          'AUTHENTICATION_UNAVAILABLE',
          'Authentication is temporarily unavailable'
        )
      );
    }
  }
  next();
};

export const requireAuthentication = (req, _res, next) => {
  if (!req.user) {
    return next(
      req.authError instanceof AppError
        ? req.authError
        : new AppError(401, 'UNAUTHENTICATED', 'Authentication is required')
    );
  }
  next();
};

export const authorizeRoles = (...allowedRoles) => {
  return (req, _res, next) => {
    if (!req.user) {
      return next(
        new AppError(401, 'UNAUTHENTICATED', 'Authentication is required')
      );
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          403,
          'FORBIDDEN',
          'You are not allowed to perform this action'
        )
      );
    }
    next();
  };
};

export const requireAdmin = [requireAuthentication, authorizeRoles('admin')];

export const requireCsrf = (req, _res, next) => {
  if (!req.user) return next();
  const headerToken = req.get('x-csrf-token');
  if (!headerToken) {
    return next(
      new AppError(403, 'CSRF_VALIDATION_FAILED', 'CSRF validation failed')
    );
  }
  const suppliedHash = Buffer.from(hashOpaqueToken(headerToken), 'hex');
  const expectedHash = Buffer.from(req.authSession.csrfTokenHash, 'hex');
  if (
    suppliedHash.length !== expectedHash.length ||
    !timingSafeEqual(suppliedHash, expectedHash)
  ) {
    return next(
      new AppError(403, 'CSRF_VALIDATION_FAILED', 'CSRF validation failed')
    );
  }
  next();
};
