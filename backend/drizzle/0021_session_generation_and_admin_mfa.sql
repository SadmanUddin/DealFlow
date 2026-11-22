ALTER TABLE "auth_sessions" ADD COLUMN "session_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "session_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_pending_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_pending_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_last_step" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_recovery" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
CREATE FUNCTION bump_user_session_generation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.password IS DISTINCT FROM OLD.password
    OR NEW.role IS DISTINCT FROM OLD.role
    OR NEW.is_active IS DISTINCT FROM OLD.is_active
    OR NEW.email_verified IS DISTINCT FROM OLD.email_verified
    OR NEW.mfa_secret IS DISTINCT FROM OLD.mfa_secret
  THEN
    NEW.session_generation := OLD.session_generation + 1;
  END IF;
  IF NEW.password IS DISTINCT FROM OLD.password
    OR NEW.role IS DISTINCT FROM OLD.role
    OR NEW.is_active IS DISTINCT FROM OLD.is_active
  THEN
    NEW.mfa_pending_secret := NULL;
    NEW.mfa_pending_until := NULL;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER users_session_generation_guard
BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION bump_user_session_generation();
