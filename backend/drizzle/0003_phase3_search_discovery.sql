CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "business_listings_status_published_at_idx" ON "business_listings" USING btree ("status","published_at","id");--> statement-breakpoint
CREATE INDEX "business_listings_status_industry_idx" ON "business_listings" USING btree ("status","industry");--> statement-breakpoint
CREATE INDEX "business_listings_status_location_idx" ON "business_listings" USING btree ("status","location");--> statement-breakpoint
CREATE INDEX "business_listings_status_asking_price_idx" ON "business_listings" USING btree ("status","asking_price");--> statement-breakpoint
CREATE INDEX "business_listings_status_annual_revenue_idx" ON "business_listings" USING btree ("status","annual_revenue");--> statement-breakpoint
CREATE INDEX "business_listings_status_ebitda_idx" ON "business_listings" USING btree ("status","ebitda");--> statement-breakpoint
CREATE INDEX "business_listings_title_trgm_idx" ON "business_listings" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "business_listings_description_trgm_idx" ON "business_listings" USING gin ("description" gin_trgm_ops);