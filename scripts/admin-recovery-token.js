import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { randomBytes, createHash } from 'node:crypto';

if (!process.env.DATABASE_URL || !process.env.ADMIN_RECOVERY_EMAIL || process.env.ADMIN_RECOVERY_CONFIRM !== 'I_HAVE_DIRECT_DATABASE_AUTHORIZATION') {
  throw new Error('Set DATABASE_URL, ADMIN_RECOVERY_EMAIL, and ADMIN_RECOVERY_CONFIRM=I_HAVE_DIRECT_DATABASE_AUTHORIZATION from a trusted operator shell.');
}
const token = randomBytes(32).toString('base64url');
const tokenHash = createHash('sha256').update(token).digest('hex');
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  WITH target AS (
    SELECT id FROM public.users
    WHERE email = ${process.env.ADMIN_RECOVERY_EMAIL.trim().toLowerCase()}
      AND role = 'admin' AND is_active = true
  ), consumed AS (
    UPDATE public.auth_tokens SET consumed_at = now()
    WHERE user_id IN (SELECT id FROM target) AND type = 'password_reset' AND consumed_at IS NULL
    RETURNING user_id
  ), issued AS (
    INSERT INTO public.auth_tokens(token_hash, user_id, type, expires_at)
    SELECT ${tokenHash}, id, 'password_reset', now() + interval '15 minutes' FROM target
    RETURNING user_id
  ), revoked AS (
    UPDATE public.auth_sessions SET revoked_at = now()
    WHERE user_id IN (SELECT id FROM target) AND revoked_at IS NULL
    RETURNING user_id
  ), logged AS (
    INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, reason, before_state, after_state)
    SELECT id, 'admin.recovery_token_issued', 'admin', id::text,
      'Trusted operator issued a one-time password recovery token', NULL,
      jsonb_build_object('sessionsRevoked', true) FROM target
    RETURNING id
  ) SELECT id FROM target
`;
if (!rows.length) throw new Error('No active administrator matched the recovery email.');
console.log(`One-time password reset token (valid 15 minutes): ${token}`);
