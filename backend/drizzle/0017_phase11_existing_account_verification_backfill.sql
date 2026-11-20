-- Preserve access for accounts that predate email verification enforcement.
-- New accounts created after this one-time migration remain unverified by default.
UPDATE users
SET email_verified = true
WHERE email_verified = false;
