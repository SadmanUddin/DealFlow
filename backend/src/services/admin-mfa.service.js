import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';
import bcrypt from 'bcrypt';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { Secret, TOTP } from 'otpauth';
import QRCode from 'qrcode';
import { db } from '#config/database.js';
import { getEnvironment } from '#config/env.js';
import logger from '#config/logger.js';
import { users } from '#models/user.model.js';
import { AppError } from '#utils/app-error.js';

const period = 30;
const setupLifetimeMs = 10 * 60 * 1000;
const invalidFactor = () =>
  new AppError(
    403,
    'MFA_INVALID',
    'Enter a fresh authenticator code or an unused recovery code.'
  );
const changed = () =>
  new AppError(
    409,
    'MFA_STATE_CHANGED',
    'Security settings changed. Sign in and try again.'
  );
const key = () => {
  const value = getEnvironment().ADMIN_MFA_ENCRYPTION_KEY;
  if (!value)
    throw new AppError(
      503,
      'MFA_UNAVAILABLE',
      'Administrator MFA is unavailable'
    );
  return Buffer.from(value, 'hex');
};
const context = id => Buffer.from(`dealflow-admin-mfa:v1:${id}`);
const encrypt = (id, secret) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(context(id));
  const encrypted = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map(part => part.toString('base64url'))
    .join('.');
};
const decrypt = (id, encrypted) => {
  const [iv, tag, data] = encrypted
    .split('.')
    .map(part => Buffer.from(part, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(context(id));
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
};
const authenticator = (secret, label = 'Administrator') =>
  new TOTP({
    issuer: 'DealFlow',
    label,
    secret: Secret.fromBase32(secret),
    period,
  });

const stepFor = (id, encrypted, code) => {
  if (!/^\d{6}$/.test(code)) throw invalidFactor();
  const timestamp = Date.now();
  const offset = authenticator(decrypt(id, encrypted)).validate({
    token: code,
    window: 1,
    timestamp,
  });
  if (offset === null) throw invalidFactor();
  return Math.floor(timestamp / (period * 1000)) + offset;
};
const recoveryHash = (id, code) =>
  createHmac('sha256', key())
    .update(`dealflow-mfa-recovery:v1:${id}:${code.toUpperCase()}`)
    .digest('hex');
const newRecoveryCodes = () =>
  Array.from({ length: 10 }, () =>
    randomBytes(16).toString('hex').toUpperCase()
  );

const adminWhere = (id, generation) =>
  and(
    eq(users.id, id),
    eq(users.role, 'admin'),
    eq(users.is_active, true),
    eq(users.email_verified, true),
    eq(users.session_generation, generation)
  );

const loadAdmin = async id => {
  const [admin] = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.password,
      generation: users.session_generation,
      secret: users.mfa_secret,
      pending: users.mfa_pending_secret,
      pendingUntil: users.mfa_pending_until,
    })
    .from(users)
    .where(
      and(
        eq(users.id, id),
        eq(users.role, 'admin'),
        eq(users.is_active, true),
        eq(users.email_verified, true)
      )
    )
    .limit(1);
  if (!admin)
    throw new AppError(403, 'FORBIDDEN', 'Administrator access is required');
  return admin;
};
const reauthenticate = async (id, password) => {
  const admin = await loadAdmin(id);
  if (!(await bcrypt.compare(password, admin.passwordHash))) {
    throw new AppError(
      403,
      'MFA_REAUTH_REQUIRED',
      'Confirm your current password'
    );
  }
  return admin;
};
const save = async (values, where) => {
  const [row] = await db
    .update(users)
    .set(values)
    .where(where)
    .returning({ id: users.id });
  return Boolean(row);
};

export const verifyAdminFactor = async (admin, code) => {
  if (!admin.secret) {
    if (getEnvironment().ADMIN_MFA_REQUIRED) {
      throw new AppError(
        403,
        'MFA_ENROLLMENT_REQUIRED',
        'Contact your administrator to arrange MFA enrollment'
      );
    }
    return;
  }
  if (!code)
    throw new AppError(
      403,
      'MFA_REQUIRED',
      'Enter your authenticator code or a recovery code'
    );
  const scope = and(
    adminWhere(admin.id, admin.generation),
    eq(users.mfa_secret, admin.secret)
  );
  let verified;
  if (/^[A-Fa-f0-9]{32}$/.test(code)) {
    const digest = recoveryHash(admin.id, code);
    verified = await save(
      {
        mfa_recovery: sql`${users.mfa_recovery} - ${digest}::text`,
      },
      and(scope, sql`${users.mfa_recovery} ? ${digest}::text`)
    );
    if (verified)
      logger.info('Administrator MFA recovery code used', { userId: admin.id });
  } else {
    const step = stepFor(admin.id, admin.secret, code);
    verified = await save(
      { mfa_last_step: step },
      and(
        scope,
        sql`(${users.mfa_last_step} IS NULL OR ${users.mfa_last_step} < ${step})`
      )
    );
  }
  if (!verified) throw invalidFactor();
};

export const getAdminMfaStatus = async id => {
  const admin = await loadAdmin(id);
  const environment = getEnvironment();
  return {
    enrolled: Boolean(admin.secret),
    required: environment.ADMIN_MFA_REQUIRED,
    configured: Boolean(environment.ADMIN_MFA_ENCRYPTION_KEY),
  };
};

export const beginAdminMfa = async (id, password) => {
  if (getEnvironment().ADMIN_MFA_REQUIRED) throw changed();
  const admin = await reauthenticate(id, password);
  if (admin.secret) throw changed();
  const secret = new Secret({ size: 20 }).base32;
  const encrypted = encrypt(id, secret);
  const qr = await QRCode.toDataURL(
    authenticator(secret, admin.email).toString()
  );
  const updated = await save(
    {
      mfa_pending_secret: encrypted,
      mfa_pending_until: new Date(Date.now() + setupLifetimeMs),
    },
    and(adminWhere(id, admin.generation), isNull(users.mfa_secret))
  );
  if (!updated) throw changed();
  return { secret, qr };
};

export const activateAdminMfa = async (id, password, code) => {
  if (getEnvironment().ADMIN_MFA_REQUIRED) throw changed();
  const admin = await reauthenticate(id, password);
  if (!admin.pending || admin.secret || admin.pendingUntil <= new Date())
    throw changed();
  const step = stepFor(id, admin.pending, code);
  const recoveryCodes = newRecoveryCodes();
  const updated = await save(
    {
      mfa_secret: admin.pending,
      mfa_pending_secret: null,
      mfa_pending_until: null,
      mfa_last_step: step,
      mfa_recovery: recoveryCodes.map(value => recoveryHash(id, value)),
    },
    and(
      adminWhere(id, admin.generation),
      isNull(users.mfa_secret),
      eq(users.mfa_pending_secret, admin.pending),
      sql`${users.mfa_pending_until} > now()`
    )
  );
  if (!updated) throw changed();
  logger.info('Administrator MFA enrolled', { userId: id });
  return { recoveryCodes };
};

export const replaceAdminMfaRecovery = async (id, password, code) => {
  const admin = await reauthenticate(id, password);
  if (!admin.secret) throw changed();
  await verifyAdminFactor(admin, code);
  const recoveryCodes = newRecoveryCodes();
  if (
    !(await save(
      {
        mfa_recovery: recoveryCodes.map(value => recoveryHash(id, value)),
        session_generation: sql`${users.session_generation} + 1`,
      },
      and(adminWhere(id, admin.generation), eq(users.mfa_secret, admin.secret))
    ))
  )
    throw changed();
  logger.info('Administrator MFA recovery codes replaced', { userId: id });
  return { recoveryCodes };
};

export const removeAdminMfa = async (id, password, code) => {
  if (getEnvironment().ADMIN_MFA_REQUIRED) {
    throw new AppError(
      409,
      'MFA_ENFORCED',
      'MFA removal requires an approved administrator maintenance window'
    );
  }
  const admin = await reauthenticate(id, password);
  if (!admin.secret) throw changed();
  await verifyAdminFactor(admin, code);
  const updated = await save(
    {
      mfa_secret: null,
      mfa_pending_secret: null,
      mfa_pending_until: null,
      mfa_last_step: null,
      mfa_recovery: [],
    },
    and(adminWhere(id, admin.generation), eq(users.mfa_secret, admin.secret))
  );
  if (!updated) throw changed();
  logger.info('Administrator MFA removed', { userId: id });
};
