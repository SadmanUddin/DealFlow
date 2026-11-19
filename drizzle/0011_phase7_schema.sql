ALTER TYPE "public"."listing_status" ADD VALUE 'suspended';--> statement-breakpoint
CREATE TABLE "admin_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer,
	"action" varchar(80) NOT NULL,
	"target_type" varchar(40) NOT NULL,
	"target_id" varchar(100) NOT NULL,
	"reason" text,
	"before_state" jsonb,
	"after_state" jsonb,
	"request_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_bootstrap_claims" (
	"id" integer PRIMARY KEY NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_bootstrap_singleton" CHECK ("admin_bootstrap_claims"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "moderation_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"reporter_id" integer NOT NULL,
	"listing_id" integer,
	"reported_user_id" integer,
	"category" varchar(48) NOT NULL,
	"description" text NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"moderator_notes" text,
	"resolution_reason" text,
	"assigned_to" integer,
	"resolved_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "moderation_reports_one_target" CHECK (("moderation_reports"."listing_id" IS NOT NULL)::int + ("moderation_reports"."reported_user_id" IS NOT NULL)::int = 1),
	CONSTRAINT "moderation_reports_status_valid" CHECK ("moderation_reports"."status" IN ('pending', 'under_review', 'resolved', 'dismissed')),
	CONSTRAINT "moderation_reports_category_valid" CHECK ("moderation_reports"."category" IN ('suspicious_activity', 'misleading_information', 'potential_scam', 'marketplace_violation', 'other')),
	CONSTRAINT "moderation_reports_description_length" CHECK (char_length(trim("moderation_reports"."description")) BETWEEN 10 AND 5000),
	CONSTRAINT "moderation_reports_not_self" CHECK ("moderation_reports"."reported_user_id" IS NULL OR "moderation_reports"."reporter_id" <> "moderation_reports"."reported_user_id")
);
--> statement-breakpoint
ALTER TABLE "business_listings" ADD COLUMN "moderation_reason" text;--> statement-breakpoint
ALTER TABLE "business_listings" ADD COLUMN "moderated_by" integer;--> statement-breakpoint
ALTER TABLE "business_listings" ADD COLUMN "moderated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "business_listings" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "business_listings" ADD COLUMN "suspended_by" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspension_reason" varchar(2000);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_by" integer;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_reports" ADD CONSTRAINT "moderation_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_reports" ADD CONSTRAINT "moderation_reports_listing_id_business_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."business_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_reports" ADD CONSTRAINT "moderation_reports_reported_user_id_users_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_reports" ADD CONSTRAINT "moderation_reports_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_reports" ADD CONSTRAINT "moderation_reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_created_idx" ON "admin_audit_logs" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "admin_audit_actor_created_idx" ON "admin_audit_logs" USING btree ("actor_id","created_at","id");--> statement-breakpoint
CREATE INDEX "admin_audit_target_idx" ON "admin_audit_logs" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "moderation_reports_status_created_idx" ON "moderation_reports" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE INDEX "moderation_reports_reporter_created_idx" ON "moderation_reports" USING btree ("reporter_id","created_at","id");--> statement-breakpoint
CREATE INDEX "moderation_reports_listing_idx" ON "moderation_reports" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "moderation_reports_reported_user_idx" ON "moderation_reports" USING btree ("reported_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_reports_open_duplicate_uidx" ON "moderation_reports" USING btree ("reporter_id",COALESCE("listing_id", 0),COALESCE("reported_user_id", 0),"category") WHERE "moderation_reports"."status" IN ('pending', 'under_review');--> statement-breakpoint
ALTER TABLE "business_listings" ADD CONSTRAINT "business_listings_moderated_by_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_listings" ADD CONSTRAINT "business_listings_suspended_by_users_id_fk" FOREIGN KEY ("suspended_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_suspended_by_users_id_fk" FOREIGN KEY ("suspended_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION prevent_admin_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'admin audit records are append-only' USING ERRCODE = '55000';
END $$;
--> statement-breakpoint
CREATE TRIGGER admin_audit_logs_append_only
  BEFORE UPDATE OR DELETE ON admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_mutation();
--> statement-breakpoint
CREATE FUNCTION protect_last_active_admin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE remaining_count integer;
BEGIN
  IF OLD.role = 'admin' AND OLD.is_active AND (NEW.role <> 'admin' OR NOT NEW.is_active) THEN
    PERFORM pg_advisory_xact_lock(73219841);
    SELECT count(*) INTO remaining_count
      FROM users WHERE role = 'admin' AND is_active AND id <> OLD.id;
    IF remaining_count = 0 THEN
      RAISE EXCEPTION 'cannot remove the last active administrator' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER users_protect_last_active_admin
  BEFORE UPDATE OF role, is_active ON users
  FOR EACH ROW EXECUTE FUNCTION protect_last_active_admin();
