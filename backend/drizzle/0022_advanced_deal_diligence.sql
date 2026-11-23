CREATE TABLE "deal_checklist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"deal_id" integer NOT NULL,
	"created_by" integer NOT NULL,
	"creation_key" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text NOT NULL,
	"category" varchar(16) NOT NULL,
	"assigned_to" varchar(6) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_checklist_category_valid" CHECK ("deal_checklist_items"."category" IN ('financial','legal','operational','commercial','technology','other')),
	CONSTRAINT "deal_checklist_assignment_valid" CHECK ("deal_checklist_items"."assigned_to" IN ('buyer','seller')),
	CONSTRAINT "deal_checklist_status_valid" CHECK ("deal_checklist_items"."status" IN ('pending','in_progress','completed','blocked') AND ("deal_checklist_items"."status" = 'completed') = ("deal_checklist_items"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "deal_document_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"deal_id" integer NOT NULL,
	"requested_by" integer NOT NULL,
	"responsible_id" integer NOT NULL,
	"creation_key" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text NOT NULL,
	"status" varchar(20) DEFAULT 'requested' NOT NULL,
	"due_date" date,
	"document_id" integer,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"feedback" text,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_document_request_roles_valid" CHECK ("deal_document_requests"."requested_by" <> "deal_document_requests"."responsible_id" AND ("deal_document_requests"."reviewed_by" IS NULL OR "deal_document_requests"."reviewed_by" = "deal_document_requests"."requested_by")),
	CONSTRAINT "deal_document_request_status_valid" CHECK (
    ("deal_document_requests"."status" = 'requested' AND "deal_document_requests"."document_id" IS NULL AND "deal_document_requests"."reviewed_by" IS NULL AND "deal_document_requests"."reviewed_at" IS NULL)
    OR ("deal_document_requests"."status" = 'submitted' AND "deal_document_requests"."document_id" IS NOT NULL AND "deal_document_requests"."reviewed_by" IS NULL AND "deal_document_requests"."reviewed_at" IS NULL)
    OR ("deal_document_requests"."status" IN ('under_review','accepted','changes_requested') AND "deal_document_requests"."document_id" IS NOT NULL AND "deal_document_requests"."reviewed_by" IS NOT NULL AND "deal_document_requests"."reviewed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "deal_checklist_items" ADD CONSTRAINT "deal_checklist_items_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_checklist_items" ADD CONSTRAINT "deal_checklist_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_document_requests" ADD CONSTRAINT "deal_document_requests_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_document_requests" ADD CONSTRAINT "deal_document_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_document_requests" ADD CONSTRAINT "deal_document_requests_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_document_requests" ADD CONSTRAINT "deal_document_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_document_requests" ADD CONSTRAINT "deal_document_requests_same_deal_document_fk" FOREIGN KEY ("deal_id","document_id") REFERENCES "public"."deal_documents"("deal_id","conversation_document_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deal_checklist_creation_uidx" ON "deal_checklist_items" USING btree ("deal_id","created_by","creation_key");--> statement-breakpoint
CREATE INDEX "deal_checklist_page_idx" ON "deal_checklist_items" USING btree ("deal_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_document_request_creation_uidx" ON "deal_document_requests" USING btree ("deal_id","requested_by","creation_key");--> statement-breakpoint
CREATE INDEX "deal_document_request_page_idx" ON "deal_document_requests" USING btree ("deal_id","id");--> statement-breakpoint
CREATE INDEX "deal_document_request_file_idx" ON "deal_document_requests" USING btree ("deal_id","document_id");