CREATE TABLE "buyer_saved_searches" (
	"id" serial PRIMARY KEY NOT NULL,
	"buyer_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"filters" jsonb NOT NULL,
	"alerts_enabled" boolean DEFAULT true NOT NULL,
	"frequency" varchar(8) DEFAULT 'off' NOT NULL,
	"active_since" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buyer_saved_searches_frequency_valid" CHECK ("buyer_saved_searches"."frequency" IN ('instant','daily','weekly','off')),
	CONSTRAINT "buyer_saved_searches_filters_object" CHECK (jsonb_typeof("buyer_saved_searches"."filters") = 'object')
);
--> statement-breakpoint
CREATE TABLE "saved_search_listing_matches" (
	"saved_search_id" integer NOT NULL,
	"listing_id" integer NOT NULL,
	"matched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivery_key" varchar(255),
	CONSTRAINT "saved_search_listing_matches_saved_search_id_listing_id_pk" PRIMARY KEY("saved_search_id","listing_id")
);
--> statement-breakpoint
ALTER TABLE "buyer_saved_searches" ADD CONSTRAINT "buyer_saved_searches_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_search_listing_matches" ADD CONSTRAINT "saved_search_listing_matches_saved_search_id_buyer_saved_searches_id_fk" FOREIGN KEY ("saved_search_id") REFERENCES "public"."buyer_saved_searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_search_listing_matches" ADD CONSTRAINT "saved_search_listing_matches_listing_id_business_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."business_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buyer_saved_searches_owner_idx" ON "buyer_saved_searches" USING btree ("buyer_id","id");--> statement-breakpoint
CREATE INDEX "buyer_saved_searches_active_idx" ON "buyer_saved_searches" USING btree ("active_since") WHERE "buyer_saved_searches"."alerts_enabled";--> statement-breakpoint
CREATE INDEX "saved_search_matches_listing_idx" ON "saved_search_listing_matches" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "saved_search_matches_delivery_idx" ON "saved_search_listing_matches" USING btree ("delivery_key") WHERE "saved_search_listing_matches"."delivery_key" IS NOT NULL;
--> statement-breakpoint
CREATE FUNCTION enqueue_saved_search_publication() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'published' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'published' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM buyer_saved_searches WHERE alerts_enabled) THEN
    INSERT INTO outbox_events(event_key, type, payload)
    VALUES ('saved-search:publication:' || NEW.id || ':' || gen_random_uuid(),
      'saved_search.publication', jsonb_build_object(
        'listingId', NEW.id,
        'publicationDate', NEW.published_at,
        'occurredAt', clock_timestamp()
      ));
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER listing_saved_search_publication
AFTER INSERT OR UPDATE OF status ON business_listings
FOR EACH ROW EXECUTE FUNCTION enqueue_saved_search_publication();
