CREATE TYPE "public"."listing_status" AS ENUM('draft', 'pending', 'published', 'rejected', 'archived');--> statement-breakpoint
CREATE TABLE "business_listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"seller_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text NOT NULL,
	"industry" varchar(120),
	"location" varchar(160),
	"asking_price" numeric(18, 2),
	"annual_revenue" numeric(18, 2),
	"ebitda" numeric(18, 2),
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"status" "listing_status" DEFAULT 'draft' NOT NULL,
	"rejection_reason" text,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "business_listings_financials_nonnegative" CHECK (("business_listings"."asking_price" IS NULL OR "business_listings"."asking_price" >= 0) AND ("business_listings"."annual_revenue" IS NULL OR "business_listings"."annual_revenue" >= 0) AND ("business_listings"."ebitda" IS NULL OR "business_listings"."ebitda" >= 0)),
	CONSTRAINT "business_listings_currency_format" CHECK ("business_listings"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "business_listings" ADD CONSTRAINT "business_listings_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_listings_seller_id_idx" ON "business_listings" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "business_listings_status_created_at_idx" ON "business_listings" USING btree ("status","created_at");