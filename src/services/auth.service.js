import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '#config/database.js';
import { authSessions, authTokens, users } from '#models/user.model.js';
import { AppError } from '#utils/app-error.js';
import { signAccessToken } from '#utils/jwt.js';
import { getEnvironment } from '#config/env.js';

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_MS = 15 * 60 * 1000;
const EMAIL_TOKEN_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_MS = 60 * 60 * 1000;

const hashToken = token => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');
export const csrfTokenForSession = sessionId =>
  createHmac('sha256', getEnvironment().JWT_SECRET)
    .update(`dealflow-csrf:${sessionId}`)
    .digest('base64url');

export const hashPassword = password => bcrypt.hash(password, BCRYPT_ROUNDS);
export const comparePassword = (password, passwordHash) =>
  bcrypt.compare(password, passwordHash);

export const registerUser = async ({ name, email, password, role }) => {
  const passwordHash = await hashPassword(password);
  try {
    const [user] = await db
      .insert(users)
      .values({ name, email, password: passwordHash, role })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        emailVerified: users.email_verified,
        createdAt: users.created_at,
      });
    return user;
  } catch (error) {
    if (error?.code === '23505') {
      throw new AppError(
        409,
        'EMAIL_ALREADY_REGISTERED',
        'An account with this email already exists'
      );
    }
    throw error;
  }
};

export const authenticateUser = async ({ email, password }) => {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      passwordHash: users.password,
      role: users.role,
      emailVerified: users.email_verified,
      isActive: users.is_active,
      createdAt: users.created_at,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user || !(await comparePassword(password, user.passwordHash))) {
    throw new AppError(
      401,
      'INVALID_CREDENTIALS',
      'Email or password is incorrect'
    );
  }
  if (!user.isActive) {
    throw new AppError(
      403,
      'ACCOUNT_DEACTIVATED',
      'This account is deactivated'
    );
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  };
};

export const createSession = async user => {
  const id = randomUUID();
  const csrfToken = csrfTokenForSession(id);
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_MS);
  await db.insert(authSessions).values({
    id,
    user_id: user.id,
    csrf_token_hash: hashToken(csrfToken),
    expires_at: expiresAt,
  });
  return {
    accessToken: signAccessToken({ userId: user.id, sessionId: id }),
    csrfToken,
    expiresAt,
  };
};

export const findActiveSession = async ({ userId, sessionId }) => {
  const [session] = await db
    .select({
      id: authSessions.id,
      userId: users.id,
      email: users.email,
      role: users.role,
      emailVerified: users.email_verified,
      csrfTokenHash: authSessions.csrf_token_hash,
    })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.user_id, users.id))
    .where(
      and(
        eq(authSessions.id, sessionId),
        eq(authSessions.user_id, userId),
        isNull(authSessions.revoked_at),
        gt(authSessions.expires_at, new Date()),
        eq(users.is_active, true)
      )
    )
    .limit(1);
  return session;
};

export const revokeSession = async sessionId => {
  await db
    .update(authSessions)
    .set({ revoked_at: new Date() })
    .where(
      and(eq(authSessions.id, sessionId), isNull(authSessions.revoked_at))
    );
};

export const revokeUserSessions = async userId => {
  await db
    .update(authSessions)
    .set({ revoked_at: new Date() })
    .where(
      and(eq(authSessions.user_id, userId), isNull(authSessions.revoked_at))
    );
};

const issueOneTimeToken = async (userId, type, lifetimeMs) => {
  const token = newToken();
  const now = new Date();
  await db
    .update(authTokens)
    .set({ consumed_at: now })
    .where(
      and(
        eq(authTokens.user_id, userId),
        eq(authTokens.type, type),
        isNull(authTokens.consumed_at)
      )
    );
  await db.insert(authTokens).values({
    token_hash: hashToken(token),
    user_id: userId,
    type,
    expires_at: new Date(now.getTime() + lifetimeMs),
  });
  return token;
};

const consumeOneTimeToken = async (token, type) => {
  const [record] = await db
    .update(authTokens)
    .set({ consumed_at: new Date() })
    .where(
      and(
        eq(authTokens.token_hash, hashToken(token)),
        eq(authTokens.type, type),
        isNull(authTokens.consumed_at),
        gt(authTokens.expires_at, new Date())
      )
    )
    .returning({ userId: authTokens.user_id });
  if (!record) {
    throw new AppError(
      400,
      'INVALID_OR_EXPIRED_TOKEN',
      'Token is invalid, expired, or already used'
    );
  }
  return record.userId;
};

export const createEmailVerificationToken = userId =>
  issueOneTimeToken(userId, 'email_verification', EMAIL_TOKEN_MS);

export const verifyEmail = async token => {
  const userId = await consumeOneTimeToken(token, 'email_verification');
  await db
    .update(users)
    .set({ email_verified: true, updated_at: new Date() })
    .where(eq(users.id, userId));
};

export const requestPasswordReset = async email => {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), eq(users.is_active, true)))
    .limit(1);
  if (!user) return { token: null, decoyToken: newToken() };
  return {
    token: await issueOneTimeToken(user.id, 'password_reset', RESET_TOKEN_MS),
  };
};

export const resetPassword = async (token, password) => {
  const userId = await consumeOneTimeToken(token, 'password_reset');
  const passwordHash = await hashPassword(password);
  await db
    .update(users)
    .set({ password: passwordHash, updated_at: new Date() })
    .where(eq(users.id, userId));
  await revokeUserSessions(userId);
};

export const deactivateAccount = async (userId, password) => {
  const [user] = await db
    .select({ passwordHash: users.password, isActive: users.is_active })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (
    !user ||
    !user.isActive ||
    !(await comparePassword(password, user.passwordHash))
  ) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Password is incorrect');
  }
  await db
    .update(users)
    .set({ is_active: false, updated_at: new Date() })
    .where(eq(users.id, userId));
  await revokeUserSessions(userId);
};

export const hashOpaqueToken = hashToken;
