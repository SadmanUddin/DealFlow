# Authentication and account lifecycle

## Authentication flow

Signup accepts only `buyer` or `seller`; the role is validated by the server and
the database defaults to `buyer`. The request schema rejects a client-supplied
`admin` role. Admin access is provisioned outside public APIs by a trusted
database operator after identity review. The migration demotes legacy `admin`
and unknown role values to `buyer`; existing `seller` values remain sellers.

Signin creates a 15-minute HS256 JWT and a corresponding server-side session.
The JWT is stored in an HttpOnly cookie. The session record stores a hash of a
CSRF token derived from the server secret and session ID. Browser clients send
that value in `X-CSRF-Token` on state-changing requests authenticated by the
cookie. Login/signup responses include the CSRF token; after a page reload,
authenticated clients can retrieve it from `GET /api/auth/csrf`. Authentication
uses the HttpOnly cookie. CORS allows only origins listed in `CORS_ORIGINS`.

Logout revokes the current session in PostgreSQL and clears the auth cookie. The
authentication middleware checks the JWT signature, issuer, audience, expiry,
session state, and current account status on protected requests. Password reset
and account deactivation revoke all active sessions for that user.

Access tokens expire after 15 minutes and there is no refresh-token endpoint;
users must sign in again after expiry. Expired and revoked session/token rows
are retained; scheduled cleanup is not implemented yet.

## Verification and password recovery delivery

Verification and password-reset tokens are cryptographically random, stored
only as SHA-256 hashes, expire, and can be consumed once. No email provider is
configured in this repository. Signup returns an email-verification token in
development and test environments. Password-reset tokens are returned only in
the test environment; development and production responses do not expose them.
No email is sent, so production verification and password recovery require
integrating an email provider and sending the corresponding verification/reset
link. Until then, password recovery can only be exercised through the test
environment.

Forgot-password responses are generic for known and unknown addresses. Only in
the test environment, a random decoy token is returned for unknown addresses
so the test response shape matches that of a known address. No token is
returned to development or production clients.

## Required environment

Copy `.env.example` to `.env` and set `DATABASE_URL`, a unique random
`JWT_SECRET` of at least 32 characters, a valid `ARCJET_KEY`, and the trusted
comma-separated `CORS_ORIGINS`. `.env` is ignored by Git. Never commit actual
credentials.

## Applying the migration

Point `DATABASE_URL` at a local or explicitly selected non-production database,
review the SQL in `drizzle/0001_brainy_ink.sql`, then run:

```sh
npm run db:migrate
```

The migration keeps user rows, maps legacy `seller` roles to `seller`, and maps
legacy `user`, `admin`, and unknown role values to `buyer` so accounts created
under the former public-admin-registration behavior do not retain admin access.
It adds session and one-time-token tables with user foreign keys and lookup
indexes. This repository does not run migrations automatically at application
startup.
