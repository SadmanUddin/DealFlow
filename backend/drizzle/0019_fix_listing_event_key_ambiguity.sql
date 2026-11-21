-- Keep the existing trigger and event behavior, but avoid a PL/pgSQL variable
-- named event_key colliding with outbox_events.event_key in ON CONFLICT.
CREATE OR REPLACE FUNCTION enqueue_listing_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_type text;
  v_event_snapshot jsonb;
  v_current_snapshot jsonb;
  v_recipients jsonb;
  v_price_changed boolean := false;
  v_details_changed boolean := false;
  v_event_fingerprint text;
  v_event_key text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  v_current_snapshot := jsonb_build_object(
    'title', NEW.title,
    'description', NEW.description,
    'industry', NEW.industry,
    'location', NEW.location,
    'askingPrice', NEW.asking_price,
    'annualRevenue', NEW.annual_revenue,
    'ebitda', NEW.ebitda,
    'currency', NEW.currency
  );
  v_event_type := NULL;

  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
    v_event_type := 'listing.approved';
    IF OLD.public_snapshot IS NOT NULL THEN
      v_price_changed := OLD.public_snapshot->'askingPrice' IS DISTINCT FROM v_current_snapshot->'askingPrice';
      v_details_changed := (OLD.public_snapshot - 'askingPrice') IS DISTINCT FROM (v_current_snapshot - 'askingPrice');
    END IF;
    v_event_snapshot := v_current_snapshot;
  ELSIF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    v_event_type := 'listing.rejected';
    v_event_snapshot := COALESCE(OLD.public_snapshot, jsonb_build_object('title', 'A saved listing', 'askingPrice', NULL, 'currency', NEW.currency));
  ELSIF OLD.status = 'published' AND NEW.status = 'archived' THEN
    v_event_type := 'listing.archived';
    v_event_snapshot := COALESCE(OLD.public_snapshot, v_current_snapshot);
  ELSIF OLD.status = 'published' AND NEW.status = 'published' THEN
    v_price_changed := OLD.public_snapshot->'askingPrice' IS DISTINCT FROM v_current_snapshot->'askingPrice';
    v_details_changed := (OLD.public_snapshot - 'askingPrice') IS DISTINCT FROM (v_current_snapshot - 'askingPrice');
    IF v_price_changed THEN
      v_event_type := 'listing.price_changed';
    ELSIF v_details_changed THEN
      v_event_type := 'listing.details_changed';
    END IF;
    v_event_snapshot := v_current_snapshot;
  END IF;

  IF v_event_type IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(favorite.user_id ORDER BY favorite.user_id), '[]'::jsonb)
    INTO v_recipients
    FROM favorites AS favorite
    WHERE favorite.listing_id = NEW.id;

    IF jsonb_array_length(v_recipients) > 0 THEN
      v_event_fingerprint := md5(
        COALESCE(OLD.public_snapshot::text, '') || ':' ||
        COALESCE(v_event_snapshot::text, '') || ':' || NEW.status
      );
      v_event_key := 'listing:' || NEW.id || ':' || v_event_type || ':' ||
        to_char(NEW.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') || ':' || v_event_fingerprint;

      INSERT INTO outbox_events AS outbox_event (event_key, type, payload)
      VALUES (
        v_event_key,
        v_event_type,
        jsonb_build_object(
          'listingId', NEW.id,
          'title', COALESCE(v_event_snapshot->>'title', 'A saved listing'),
          'askingPrice', v_event_snapshot->'askingPrice',
          'currency', v_event_snapshot->>'currency',
          'priceChanged', v_price_changed,
          'detailsChanged', v_details_changed,
          'userIds', v_recipients
        )
      )
      ON CONFLICT (event_key) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
