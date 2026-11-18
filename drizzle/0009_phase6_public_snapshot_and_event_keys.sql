ALTER TABLE business_listings ADD COLUMN public_snapshot jsonb;

-- Preserve the approved version for existing published listings. The 0008
-- trigger does not treat this internal snapshot column as a public edit.
UPDATE business_listings
SET public_snapshot = jsonb_build_object(
  'title', title,
  'description', description,
  'industry', industry,
  'location', location,
  'askingPrice', asking_price,
  'annualRevenue', annual_revenue,
  'ebitda', ebitda,
  'currency', currency
)
WHERE status = 'published';

-- 0008 could queue price/detail events containing unapproved pending values.
-- They cannot be safely distinguished from approved changes, so do not replay
-- any of those old queued events after installing the snapshot-aware trigger.
UPDATE outbox_events
SET status = 'dead',
    locked_at = NULL,
    lock_token = NULL,
    last_error = 'Superseded by the privacy-safe listing notification migration'
WHERE type IN ('listing.price_changed', 'listing.details_changed')
  AND status IN ('pending', 'processing');

CREATE OR REPLACE FUNCTION capture_listing_public_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'published' THEN
    NEW.public_snapshot = jsonb_build_object(
      'title', NEW.title,
      'description', NEW.description,
      'industry', NEW.industry,
      'location', NEW.location,
      'askingPrice', NEW.asking_price,
      'annualRevenue', NEW.annual_revenue,
      'ebitda', NEW.ebitda,
      'currency', NEW.currency
    );
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER business_listings_capture_public_snapshot
BEFORE INSERT OR UPDATE ON business_listings
FOR EACH ROW EXECUTE FUNCTION capture_listing_public_snapshot();

CREATE OR REPLACE FUNCTION enqueue_listing_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  event_type text;
  event_snapshot jsonb;
  current_snapshot jsonb;
  recipients jsonb;
  price_changed boolean := false;
  details_changed boolean := false;
  event_fingerprint text;
  event_key text;
BEGIN
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;

  current_snapshot := jsonb_build_object(
    'title', NEW.title,
    'description', NEW.description,
    'industry', NEW.industry,
    'location', NEW.location,
    'askingPrice', NEW.asking_price,
    'annualRevenue', NEW.annual_revenue,
    'ebitda', NEW.ebitda,
    'currency', NEW.currency
  );
  event_type := NULL;

  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
    event_type := 'listing.approved';
    IF OLD.public_snapshot IS NOT NULL THEN
      price_changed := OLD.public_snapshot->'askingPrice' IS DISTINCT FROM current_snapshot->'askingPrice';
      details_changed := (OLD.public_snapshot - 'askingPrice') IS DISTINCT FROM (current_snapshot - 'askingPrice');
    END IF;
    event_snapshot := current_snapshot;
  ELSIF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    event_type := 'listing.rejected';
    event_snapshot := COALESCE(OLD.public_snapshot, jsonb_build_object('title', 'A saved listing', 'askingPrice', NULL, 'currency', NEW.currency));
  ELSIF OLD.status = 'published' AND NEW.status = 'archived' THEN
    event_type := 'listing.archived';
    event_snapshot := COALESCE(OLD.public_snapshot, current_snapshot);
  ELSIF OLD.status = 'published' AND NEW.status = 'published' THEN
    price_changed := OLD.public_snapshot->'askingPrice' IS DISTINCT FROM current_snapshot->'askingPrice';
    details_changed := (OLD.public_snapshot - 'askingPrice') IS DISTINCT FROM (current_snapshot - 'askingPrice');
    IF price_changed THEN
      event_type := 'listing.price_changed';
    ELSIF details_changed THEN
      event_type := 'listing.details_changed';
    END IF;
    event_snapshot := current_snapshot;
  END IF;

  IF event_type IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(user_id ORDER BY user_id), '[]'::jsonb)
    INTO recipients FROM favorites WHERE listing_id = NEW.id;

    IF jsonb_array_length(recipients) > 0 THEN
      event_fingerprint := md5(
        COALESCE(OLD.public_snapshot::text, '') || ':' ||
        COALESCE(event_snapshot::text, '') || ':' || NEW.status
      );
      event_key := 'listing:' || NEW.id || ':' || event_type || ':' ||
        to_char(NEW.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') || ':' || event_fingerprint;

      INSERT INTO outbox_events(event_key, type, payload)
      VALUES (
        event_key,
        event_type,
        jsonb_build_object(
          'listingId', NEW.id,
          'title', COALESCE(event_snapshot->>'title', 'A saved listing'),
          'askingPrice', event_snapshot->'askingPrice',
          'currency', event_snapshot->>'currency',
          'priceChanged', price_changed,
          'detailsChanged', details_changed,
          'userIds', recipients
        )
      )
      ON CONFLICT (event_key) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END $$;
