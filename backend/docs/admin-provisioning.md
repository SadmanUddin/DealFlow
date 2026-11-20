# Administrator provisioning and recovery

## Initial administrator

1. Apply migrations `0011_phase7_schema.sql` and `0012_phase7_moderation_search_indexes.sql` to the intended database through the normal reviewed deployment process. Migration 0012 uses the `pg_trgm` extension installed by the existing Phase 3 migration. This repository does not run migrations at startup.
2. Create an ordinary buyer or seller through the existing signup flow and verify that account using the configured verification delivery process. Do not enter an administrator role in signup.
3. From a trusted operator shell with network/database access, set `DATABASE_URL` to the intended database, `ADMIN_BOOTSTRAP_EMAIL` to that verified account, and `ADMIN_BOOTSTRAP_CONFIRM=I_HAVE_VERIFIED_THIS_ACCOUNT`.
4. Run `npm run admin:bootstrap` once. The CLI only promotes an existing active, verified buyer/seller, only if there is no active administrator, and records a one-time claim so it cannot be repeated. It creates no password and no public bootstrap endpoint exists.
5. The command prints a one-time password-reset token. Deliver it to the administrator through a trusted channel and have them immediately use the existing `POST /api/auth/reset-password` endpoint. The token is hashed in the database and expires in 15 minutes. Configure email delivery before normal operations; the CLI output is a break-glass process.

The bootstrap requires direct operator database access and is intentionally not mounted in Express. Protect shell history, process environment, terminal output, and the token during the procedure. Never put credentials in source control.

## Additional administrators

An active administrator may call `POST /api/admin/admins` with `{ "email": "...", "reason": "..." }`. This promotes an existing active account and writes an audit entry. The new administrator must have a verified email and should use the existing password-reset flow to ensure account control. Public registration still accepts only buyer/seller.

## Recovery

Preferred recovery is the normal password-reset flow after Resend delivery is configured. If email delivery is unavailable, an authorized database operator can set `DATABASE_URL`, `ADMIN_RECOVERY_EMAIL`, and `ADMIN_RECOVERY_CONFIRM=I_HAVE_DIRECT_DATABASE_AUTHORIZATION` in a trusted shell and run `npm run admin:recovery-token`. It only issues a 15-minute one-time reset token for an active administrator, revokes all that account's current sessions, records the action, and prints the token once. Use the normal reset endpoint, then sign in again. The command cannot create or promote administrators. For a suspended or missing admin account, a separate reviewed database recovery procedure is required; no HTTP or password bypass exists.

## Audit and atomicity

Migration 0011 makes audit rows append-only through a database trigger. Normal API routes expose read-only paginated history only to administrators. User status changes, role changes, session revocations, listing moderation, and report decisions use one PostgreSQL statement with an `UPDATE ... RETURNING` CTE feeding the audit insert. A stale or zero-row update therefore feeds no row to the audit insert; database errors roll back both mutation and audit. Listing updates still run the existing Phase 6 snapshot and outbox triggers in the same statement. These SQL paths use Neon HTTP's supported single-statement execution; they do not use interactive Drizzle transactions. Unit tests model the CTE's conditional behavior, but the statements still require later real Neon integration verification.
