CREATE TABLE "deal_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"deal_id" integer NOT NULL,
	"actor_id" integer,
	"event_type" varchar(64) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"deal_id" integer NOT NULL,
	"conversation_document_id" integer NOT NULL,
	"linked_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_offers" (
	"id" serial PRIMARY KEY NOT NULL,
	"deal_id" integer NOT NULL,
	"parent_offer_id" integer,
	"created_by" integer NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"message" text,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "deal_offers_amount_positive" CHECK ("deal_offers"."amount" > 0),
	CONSTRAINT "deal_offers_currency_valid" CHECK ("deal_offers"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "deal_offers_status_valid" CHECK ("deal_offers"."status" IN ('pending','accepted','rejected','withdrawn','superseded')),
	CONSTRAINT "deal_offers_not_self_parent" CHECK ("deal_offers"."parent_offer_id" IS NULL OR "deal_offers"."parent_offer_id" <> "deal_offers"."id")
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" serial PRIMARY KEY NOT NULL,
	"deal_uid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" integer NOT NULL,
	"buyer_id" integer NOT NULL,
	"seller_id" integer NOT NULL,
	"status" varchar(24) DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deals_deal_uid_unique" UNIQUE("deal_uid"),
	CONSTRAINT "deals_status_valid" CHECK ("deals"."status" IN ('proposed','negotiating','due_diligence','accepted','completed','cancelled','rejected')),
	CONSTRAINT "deals_distinct_participants" CHECK ("deals"."buyer_id" <> "deals"."seller_id")
);
--> statement-breakpoint
ALTER TABLE "notification_email_preferences" ADD COLUMN "deal_updates" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "deal_activities" ADD CONSTRAINT "deal_activities_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_activities" ADD CONSTRAINT "deal_activities_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_conversation_document_id_conversation_documents_id_fk" FOREIGN KEY ("conversation_document_id") REFERENCES "public"."conversation_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_linked_by_users_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_offers" ADD CONSTRAINT "deal_offers_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_offers" ADD CONSTRAINT "deal_offers_parent_offer_id_deal_offers_id_fk" FOREIGN KEY ("parent_offer_id") REFERENCES "public"."deal_offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_offers" ADD CONSTRAINT "deal_offers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_listing_id_business_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."business_listings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deal_activities_deal_created_idx" ON "deal_activities" USING btree ("deal_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_documents_deal_document_uidx" ON "deal_documents" USING btree ("deal_id","conversation_document_id");--> statement-breakpoint
CREATE INDEX "deal_offers_deal_created_idx" ON "deal_offers" USING btree ("deal_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_offers_one_accepted_per_deal_uidx" ON "deal_offers" USING btree ("deal_id") WHERE "deal_offers"."status" = 'accepted';--> statement-breakpoint
CREATE UNIQUE INDEX "deals_listing_buyer_active_uidx" ON "deals" USING btree ("listing_id","buyer_id") WHERE "deals"."status" NOT IN ('completed','cancelled','rejected');--> statement-breakpoint
CREATE INDEX "deals_buyer_created_idx" ON "deals" USING btree ("buyer_id","created_at","id");--> statement-breakpoint
CREATE INDEX "deals_seller_created_idx" ON "deals" USING btree ("seller_id","created_at","id");--> statement-breakpoint
CREATE FUNCTION prevent_deal_activity_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Deal activity history is immutable';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "deal_activities_immutable" BEFORE UPDATE OR DELETE ON "deal_activities"
FOR EACH ROW EXECUTE FUNCTION prevent_deal_activity_mutation();
