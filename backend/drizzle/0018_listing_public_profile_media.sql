ALTER TABLE business_listings
  ADD COLUMN website varchar(2048),
  ADD COLUMN image_key varchar(512),
  ADD COLUMN image_mime_type varchar(32);

ALTER TABLE business_listings
  ADD CONSTRAINT business_listings_image_mime_type_check
  CHECK (image_mime_type IS NULL OR image_mime_type IN ('image/jpeg', 'image/png', 'image/webp'));

ALTER TABLE business_listings
  ADD CONSTRAINT business_listings_image_metadata_consistent_check
  CHECK ((image_key IS NULL) = (image_mime_type IS NULL));
