ALTER TABLE conversations ADD COLUMN status varchar(16) NOT NULL DEFAULT 'pending';
ALTER TABLE conversations ADD COLUMN status_updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE conversations ADD CONSTRAINT conversations_status_valid CHECK (status IN ('pending', 'in_review', 'accepted', 'rejected', 'closed'));

CREATE TABLE favorites (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id integer NOT NULL REFERENCES business_listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT favorites_user_listing_uidx UNIQUE (user_id, listing_id)
);
CREATE INDEX favorites_user_created_idx ON favorites(user_id, created_at, id);
CREATE INDEX favorites_listing_idx ON favorites(listing_id);
CREATE OR REPLACE FUNCTION reject_own_listing_favorite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM business_listings WHERE id = NEW.listing_id AND seller_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Users cannot favorite their own listings' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER favorites_reject_own_listing BEFORE INSERT OR UPDATE ON favorites FOR EACH ROW EXECUTE FUNCTION reject_own_listing_favorite();

CREATE TABLE notifications (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dedupe_key varchar(255) UNIQUE,
  type varchar(64) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_created_idx ON notifications(user_id, created_at, id);
CREATE INDEX notifications_user_unread_idx ON notifications(user_id, created_at) WHERE read_at IS NULL;

CREATE TABLE notification_email_preferences (
  user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  listing_status boolean NOT NULL DEFAULT true,
  listing_price boolean NOT NULL DEFAULT true,
  listing_details boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox_events (
  id serial PRIMARY KEY,
  event_key varchar(255) NOT NULL UNIQUE,
  type varchar(64) NOT NULL,
  payload jsonb NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  lock_token varchar(36),
  last_error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbox_events_status_valid CHECK (status IN ('pending', 'processing', 'processed', 'dead'))
);
CREATE INDEX outbox_events_pending_idx ON outbox_events(status, available_at, id);

-- Trigger writes are part of the same PostgreSQL statement/transaction as listing changes.
CREATE OR REPLACE FUNCTION enqueue_listing_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event_type text;
BEGIN
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
  event_type := NULL;
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('published', 'rejected', 'archived') THEN
    event_type := CASE NEW.status WHEN 'published' THEN 'listing.approved' WHEN 'rejected' THEN 'listing.rejected' ELSE 'listing.archived' END;
  ELSIF OLD.asking_price IS DISTINCT FROM NEW.asking_price THEN
    event_type := 'listing.price_changed';
  ELSIF OLD.title IS DISTINCT FROM NEW.title OR OLD.description IS DISTINCT FROM NEW.description OR OLD.industry IS DISTINCT FROM NEW.industry OR OLD.location IS DISTINCT FROM NEW.location OR OLD.annual_revenue IS DISTINCT FROM NEW.annual_revenue OR OLD.ebitda IS DISTINCT FROM NEW.ebitda OR OLD.currency IS DISTINCT FROM NEW.currency THEN
    event_type := 'listing.details_changed';
  END IF;
  IF event_type IS NOT NULL THEN
    INSERT INTO outbox_events(event_key, type, payload)
    VALUES ('listing:' || NEW.id || ':' || gen_random_uuid()::text, event_type,
      jsonb_build_object('listingId', NEW.id, 'title', NEW.title, 'askingPrice', NEW.asking_price, 'currency', NEW.currency,
        'userIds', COALESCE((SELECT jsonb_agg(user_id ORDER BY user_id) FROM favorites WHERE listing_id = NEW.id), '[]'::jsonb)));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER business_listings_enqueue_change AFTER UPDATE ON business_listings FOR EACH ROW EXECUTE FUNCTION enqueue_listing_change();
