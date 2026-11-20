import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.TEST_DATABASE_URL = 'postgresql://localhost:5432/dealflow_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-32-chars';
process.env.ARCJET_KEY = 'test-only-arcjet-key';

vi.mock('../src/config/database.js', async () => {
  const { db } = await import('./helpers/mock-database.js');
  return { db };
});

vi.mock('../src/models/user.model.js', async () => {
  const { modelTables } = await import('./helpers/mock-database.js');
  return modelTables;
});

vi.mock('../src/models/listing.model.js', async () => {
  const { modelTables } = await import('./helpers/mock-database.js');
  return { businessListings: modelTables.businessListings };
});

vi.mock('../src/config/arcjet.js', () => {
  const client = {
    withRule: () => client,
    protect: async () => ({ isDenied: () => false }),
  };
  return { default: client };
});

vi.mock('../src/config/logger.js', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('drizzle-orm', async () => {
  const { drizzleOperators } = await import('./helpers/mock-database.js');
  return drizzleOperators;
});

const [{ default: app }, mockDatabase, authMiddleware] = await Promise.all([
  import('../src/app.js'),
  import('./helpers/mock-database.js'),
  import('../src/middleware/auth.middleware.js'),
]);

const validPassword = 'A-strong-test-password-42';
const buyerRegistration = overrides => ({
  name: 'Test Buyer',
  email: 'buyer@example.test',
  password: validPassword,
  role: 'buyer',
  ...overrides,
});

const register = (overrides = {}) =>
  request(app).post('/api/auth/sign-up').send(buyerRegistration(overrides));

const cookieCredentials = response => {
  const setCookie = response.headers['set-cookie'];
  const cookieHeader = setCookie.map(cookie => cookie.split(';')[0]).join('; ');
  return { cookieHeader, csrfToken: response.body.csrfToken };
};

const csrfRequest = (requestBuilder, credentials) =>
  requestBuilder
    .set('Cookie', credentials.cookieHeader)
    .set('X-CSRF-Token', credentials.csrfToken);

const invokeMiddleware = (middleware, user) =>
  new Promise(resolve => {
    middleware({ user }, {}, error => resolve(error));
  });

beforeEach(() => {
  mockDatabase.resetDatabase();
});

describe('registration', () => {
  it('registers a buyer and does not return a password hash', async () => {
    const response = await register();

    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe('buyer');
    expect(response.body.user).not.toHaveProperty('password');
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect(mockDatabase.databaseState.users[0].password).not.toBe(
      validPassword
    );
  });

  it('registers a seller', async () => {
    const response = await register({
      role: 'seller',
      email: 'seller@example.test',
      name: 'Test Seller',
    });

    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe('seller');
  });

  it('rejects invalid email, weak password, missing fields, and admin role input', async () => {
    const invalidEmail = await register({ email: 'not-an-email' });
    const weakPassword = await register({ password: 'short' });
    const adminAttempt = await register({ role: 'admin' });
    const missingName = await request(app)
      .post('/api/auth/sign-up')
      .send({ email: 'missing@example.test', password: validPassword });

    expect(invalidEmail.status).toBe(400);
    expect(weakPassword.status).toBe(400);
    expect(adminAttempt.status).toBe(400);
    expect(missingName.status).toBe(400);
    expect(mockDatabase.databaseState.users).toHaveLength(0);
  });

  it('returns conflict for duplicate email registrations', async () => {
    await register();
    const duplicate = await register({ name: 'Second Account' });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });
});

describe('login and authentication', () => {
  it('logs in with correct credentials and sets secure session cookies', async () => {
    await register();
    const response = await request(app)
      .post('/api/auth/sign-in')
      .send({ email: 'buyer@example.test', password: validPassword });

    expect(response.status).toBe(200);
    expect(response.body.user).not.toHaveProperty('password');
    expect(response.body.csrfToken).toBeTruthy();
    expect(
      response.headers['set-cookie'].some(cookie => cookie.includes('HttpOnly'))
    ).toBe(true);
  });

  it('rejects an incorrect password, an unknown email, and invalid input', async () => {
    await register();
    const wrongPassword = await request(app)
      .post('/api/auth/sign-in')
      .send({ email: 'buyer@example.test', password: 'wrong password' });
    const unknownUser = await request(app)
      .post('/api/auth/sign-in')
      .send({ email: 'unknown@example.test', password: validPassword });
    const invalidInput = await request(app)
      .post('/api/auth/sign-in')
      .send({ email: 'invalid', password: '' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(invalidInput.status).toBe(400);
  });

  it('rejects deactivated users at login', async () => {
    await register();
    mockDatabase.databaseState.users[0].is_active = false;
    const response = await request(app)
      .post('/api/auth/sign-in')
      .send({ email: 'buyer@example.test', password: validPassword });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCOUNT_DEACTIVATED');
  });

  it('rejects missing, invalid, and expired tokens and accepts a valid token', async () => {
    const noToken = await request(app).get('/api/auth/me');
    const invalidToken = await request(app)
      .get('/api/auth/me')
      .set('Cookie', 'token=not-a-jwt');
    const expired = jwt.sign(
      { sid: 'expired-session' },
      process.env.JWT_SECRET,
      {
        algorithm: 'HS256',
        subject: '1',
        issuer: 'dealflow-api',
        audience: 'dealflow-client',
        expiresIn: '-1s',
      }
    );
    const expiredToken = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `token=${expired}`);
    const registration = await register();
    const credentials = cookieCredentials(registration);
    const authenticated = await request(app)
      .get('/api/auth/me')
      .set('Cookie', credentials.cookieHeader);
    mockDatabase.databaseState.auth_sessions[0].expires_at = new Date(0);
    const expiredSession = await request(app)
      .get('/api/auth/me')
      .set('Cookie', credentials.cookieHeader);

    expect(noToken.status).toBe(401);
    expect(invalidToken.status).toBe(401);
    expect(expiredToken.status).toBe(401);
    expect(authenticated.status).toBe(200);
    expect(expiredSession.status).toBe(401);
    expect(authenticated.body.user.email).toBe('buyer@example.test');
  });

  it('revokes the active session at logout', async () => {
    const registration = await register();
    const credentials = cookieCredentials(registration);
    const response = await csrfRequest(
      request(app).post('/api/auth/sign-out'),
      credentials
    );
    const laterRequest = await request(app)
      .get('/api/auth/me')
      .set('Cookie', credentials.cookieHeader);

    expect(response.status).toBe(200);
    expect(
      response.headers['set-cookie'].some(cookie =>
        cookie.includes('Expires=Thu, 01 Jan 1970')
      )
    ).toBe(true);
    expect(laterRequest.status).toBe(401);
  });

  it('rejects cookie-authenticated state changes without the CSRF header', async () => {
    const registration = await register();
    const credentials = cookieCredentials(registration);
    const response = await request(app)
      .patch('/api/users/profile')
      .set('Cookie', credentials.cookieHeader)
      .send({ name: 'CSRF Attempt' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_VALIDATION_FAILED');
  });
});

describe('role authorization middleware', () => {
  it('allows the intended role and denies buyer, seller, and non-admin access violations', async () => {
    expect(
      await invokeMiddleware(authMiddleware.authorizeRoles('buyer'), {
        role: 'buyer',
      })
    ).toBeUndefined();
    expect(
      (
        await invokeMiddleware(authMiddleware.authorizeRoles('seller'), {
          role: 'buyer',
        })
      ).status
    ).toBe(403);
    expect(
      (
        await invokeMiddleware(authMiddleware.authorizeRoles('buyer'), {
          role: 'seller',
        })
      ).status
    ).toBe(403);
    expect(
      (
        await invokeMiddleware(authMiddleware.authorizeRoles('admin'), {
          role: 'seller',
        })
      ).status
    ).toBe(403);
    expect(
      await invokeMiddleware(authMiddleware.authorizeRoles('admin'), {
        role: 'admin',
      })
    ).toBeUndefined();
  });
});

describe('user profile and deactivation', () => {
  it('retrieves and updates only the authenticated user profile', async () => {
    const registration = await register();
    const credentials = cookieCredentials(registration);
    const csrfRefresh = await request(app)
      .get('/api/auth/csrf')
      .set('Cookie', credentials.cookieHeader);
    const profile = await request(app)
      .get('/api/users/profile')
      .set('Cookie', credentials.cookieHeader);
    const updated = await csrfRequest(
      request(app).patch('/api/users/profile').send({ name: 'Updated Buyer' }),
      credentials
    );
    const protectedFieldResponses = await Promise.all(
      [
        { id: 99 },
        { role: 'admin' },
        { password: 'replacement-password' },
        { email_verified: true },
        { is_active: false },
      ].map(fields =>
        csrfRequest(
          request(app).patch('/api/users/profile').send(fields),
          credentials
        )
      )
    );

    expect(profile.status).toBe(200);
    expect(csrfRefresh.status).toBe(200);
    expect(csrfRefresh.body.csrfToken).toBe(credentials.csrfToken);
    expect(profile.body.user.email).toBe('buyer@example.test');
    expect(profile.body.user).not.toHaveProperty('password');
    expect(updated.status).toBe(200);
    expect(updated.body.user.name).toBe('Updated Buyer');
    expect(
      protectedFieldResponses.every(response => response.status === 400)
    ).toBe(true);
    expect(mockDatabase.databaseState.users[0].role).toBe('buyer');
  });

  it('deactivates the account after password confirmation and invalidates its sessions', async () => {
    const registration = await register();
    const credentials = cookieCredentials(registration);
    const response = await csrfRequest(
      request(app)
        .patch('/api/users/deactivate')
        .send({ password: validPassword }),
      credentials
    );
    const laterRequest = await request(app)
      .get('/api/auth/me')
      .set('Cookie', credentials.cookieHeader);

    expect(response.status).toBe(200);
    expect(mockDatabase.databaseState.users[0].is_active).toBe(false);
    expect(
      mockDatabase.databaseState.auth_sessions[0].revoked_at
    ).toBeInstanceOf(Date);
    expect(laterRequest.status).toBe(401);
  });
});

describe('email verification', () => {
  it('verifies a valid token and prevents reuse', async () => {
    const registration = await register();
    const token = registration.body.verificationToken;
    const firstUse = await request(app)
      .post('/api/auth/verify-email')
      .send({ token });
    const secondUse = await request(app)
      .post('/api/auth/verify-email')
      .send({ token });

    expect(firstUse.status).toBe(200);
    expect(mockDatabase.databaseState.users[0].email_verified).toBe(true);
    expect(secondUse.status).toBe(400);
  });

  it('rejects invalid and expired verification tokens', async () => {
    const invalid = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: 'x'.repeat(40) });
    const registration = await register();
    mockDatabase.databaseState.auth_tokens[0].expires_at = new Date(0);
    const expired = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: registration.body.verificationToken });

    expect(invalid.status).toBe(400);
    expect(expired.status).toBe(400);
  });

  it('does not consume a verification token if the user update fails', async () => {
    const registration = await register();
    const tokenRow = mockDatabase.databaseState.auth_tokens[0];
    mockDatabase.databaseState.failNext = new Error('simulated update failure');
    mockDatabase.databaseState.failOn = { table: 'users', operation: 'update' };

    const response = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: registration.body.verificationToken });

    expect(response.status).toBe(500);
    expect(tokenRow.consumed_at).toBeNull();
    expect(mockDatabase.databaseState.users[0].email_verified).toBe(false);
  });
});

describe('password recovery', () => {
  it('uses a generic forgot-password response and completes a valid reset', async () => {
    const registration = await register();
    const oldCredentials = cookieCredentials(registration);
    const known = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'buyer@example.test' });
    const unknown = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'unknown@example.test' });
    const reset = await request(app).post('/api/auth/reset-password').send({
      token: known.body.resetToken,
      password: 'New-strong-password-81',
    });
    process.env.NODE_ENV = 'production';
    const productionResponse = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'buyer@example.test' });
    process.env.NODE_ENV = 'test';
    const oldPassword = await request(app)
      .post('/api/auth/sign-in')
      .send({ email: 'buyer@example.test', password: validPassword });
    const newPassword = await request(app).post('/api/auth/sign-in').send({
      email: 'buyer@example.test',
      password: 'New-strong-password-81',
    });
    const oldSession = await request(app)
      .get('/api/auth/me')
      .set('Cookie', oldCredentials.cookieHeader);

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);
    expect(productionResponse.body).not.toHaveProperty('resetToken');
    expect(reset.status).toBe(200);
    expect(oldPassword.status).toBe(401);
    expect(newPassword.status).toBe(200);
    expect(oldSession.status).toBe(401);
  });

  it('rejects invalid, expired, and reused reset tokens', async () => {
    await register();
    const invalid = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'x'.repeat(40), password: 'New-strong-password-81' });
    const forgotten = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'buyer@example.test' });
    mockDatabase.databaseState.auth_tokens.at(-1).expires_at = new Date(0);
    const expired = await request(app).post('/api/auth/reset-password').send({
      token: forgotten.body.resetToken,
      password: 'New-strong-password-81',
    });
    const fresh = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'buyer@example.test' });
    const usedOnce = await request(app).post('/api/auth/reset-password').send({
      token: fresh.body.resetToken,
      password: 'New-strong-password-81',
    });
    const reused = await request(app).post('/api/auth/reset-password').send({
      token: fresh.body.resetToken,
      password: 'Another-strong-password-92',
    });

    expect(invalid.status).toBe(400);
    expect(expired.status).toBe(400);
    expect(usedOnce.status).toBe(200);
    expect(reused.status).toBe(400);
  });

  it('keeps the reset token, password, and sessions unchanged if session revocation fails', async () => {
    await register();
    const resetRequest = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'buyer@example.test' });
    const resetToken = mockDatabase.databaseState.auth_tokens.at(-1);
    const passwordHash = mockDatabase.databaseState.users[0].password;
    mockDatabase.databaseState.failNext = new Error('simulated revoke failure');
    mockDatabase.databaseState.failOn = {
      table: 'auth_sessions',
      operation: 'update',
    };

    const response = await request(app).post('/api/auth/reset-password').send({
      token: resetRequest.body.resetToken,
      password: 'New-strong-password-81',
    });

    expect(response.status).toBe(500);
    expect(resetToken.consumed_at).toBeNull();
    expect(mockDatabase.databaseState.users[0].password).toBe(passwordHash);
    expect(
      mockDatabase.databaseState.auth_sessions.every(
        session => session.revoked_at == null
      )
    ).toBe(true);
  });
});
