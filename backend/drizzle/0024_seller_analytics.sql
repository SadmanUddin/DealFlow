CREATE TABLE "listing_view_events" (
	"listing_id" integer NOT NULL,
	"viewed_on" date NOT NULL,
	"viewer_key" varchar(64)
);
--> statement-breakpoint
ALTER TABLE "listing_view_events" ADD CONSTRAINT "listing_view_events_listing_id_business_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."business_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "listing_view_events_daily_viewer_uidx" ON "listing_view_events" USING btree ("listing_id","viewed_on","viewer_key");--> statement-breakpoint
CREATE INDEX "listing_view_events_key_cleanup_idx" ON "listing_view_events" USING btree ("viewed_on") WHERE "listing_view_events"."viewer_key" IS NOT NULL;