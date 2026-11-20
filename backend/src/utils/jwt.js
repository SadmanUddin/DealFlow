import jwt from 'jsonwebtoken';
import { getEnvironment } from '#config/env.js';
import { AppError } from '#utils/app-error.js';

const ISSUER = 'dealflow-api';
const AUDIENCE = 'dealflow-client';
const ACCESS_TOKEN_LIFETIME = '15m';

export const signAccessToken = ({ userId, sessionId }) => {
  const { JWT_SECRET } = getEnvironment();
  return jwt.sign({ sid: sessionId }, JWT_SECRET, {
    algorithm: 'HS256',
    subject: String(userId),
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: ACCESS_TOKEN_LIFETIME,
  });
};

export const verifyAccessToken = token => {
  const { JWT_SECRET } = getEnvironment();
  try {
    const claims = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof claims === 'string' || !claims.sub || !claims.sid) {
      throw new Error('Required token claims are missing');
    }
    return { userId: Number(claims.sub), sessionId: claims.sid };
  } catch {
    throw new AppError(
      401,
      'INVALID_TOKEN',
      'Authentication token is invalid or expired'
    );
  }
};
