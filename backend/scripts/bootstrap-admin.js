import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { randomBytes, createHash } from 'node:crypto';

if (
  !process.env.DATABASE_URL ||
  !process.env.ADMIN_BOOTSTRAP_EMAIL ||
  process.env.ADMIN_BOOTSTRAP_CONFIRM !== 'I_HAVE_VERIFIED_THIS_ACCOUNT'
) {
  throw new Error(
    'Set DATABASE_URL, ADMIN_BOOTSTRAP_EMAIL, and ADMIN_BOOTSTRAP_CONFIRM=I_HAVE_VERIFIED_THIS_ACCOUNT after verifying the target account and database.'
  );
}
const email = process.env.ADMIN_BOOTSTRAP_EMAIL.trim().toLowerCase();
const token = randomBytes(32).toString('base64url');
const tokenHash = createHash('sha256').update(token).digest('hex');
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  WITH candidate AS (
    SELECT id, role FROM public.users
    WHERE email = ${email} AND is_active = true AND email_verified = true
      AND role IN ('buyer', 'seller')
    LIMIT 1
  ), claim AS (
    INSERT INTO public.admin_bootstrap_claims(id)
    SELECT 1 WHERE EXISTS (SELECT 1 FROM candidate)
      AND NOT EXISTS (SELECT 1 FROM public.users WHERE role = 'admin' AND is_active = true)
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  ), promoted AS (
    UPDATE public.users SET role = 'admin', updated_at = now()
    FROM candidate
    WHERE users.id = candidate.id AND EXISTS (SELECT 1 FROM claim)
    RETURNING users.id, candidate.role AS old_role
  ), token_cleanup AS (
    UPDATE public.auth_tokens SET consumed_at = now()
    WHERE user_id IN (SELECT id FROM promoted) AND type = 'password_reset' AND consumed_at IS NULL
    RETURNING user_id
  ), recovery AS (
    INSERT INTO public.auth_tokens(token_hash, user_id, type, expires_at)
    SELECT ${tokenHash}, id, 'password_reset', now() + interval '15 minutes' FROM promoted
    RETURNING user_id
  ), logged AS (
    INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, reason, before_state, after_state)
    SELECT NULL, 'admin.bootstrapped', 'admin', id::text, 'Initial administrator provisioned by trusted operator CLI',
      jsonb_build_object('role', old_role), jsonb_build_object('role', 'admin') FROM promoted
    RETURNING id
  )
  SELECT id FROM promoted
`;
if (!rows.length)
  throw new Error(
    'Bootstrap did not run: account may be missing/unverified/inactive, an administrator may already exist, or bootstrap was already claimed.'
  );
console.log(
  `Initial administrator provisioned for account id ${rows[0].id}. One-time recovery token (valid 15 minutes): ${token}`
);
