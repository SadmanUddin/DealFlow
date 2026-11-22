ALTER TYPE "public"."listing_status" ADD VALUE 'sold';--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "closing_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "closing_amount" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "closing_currency" varchar(3);--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "closing_proposed_by" integer;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "closing_agreed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "buyer_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "seller_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "buyer_price_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "seller_price_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "closing_disputed_by" integer;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "business_listings" ADD COLUMN "sold_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "business_listings" ADD COLUMN "public_sale_price" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "business_listings" ADD COLUMN "public_sale_currency" varchar(3);--> statement-breakpoint
CREATE UNIQUE INDEX "deals_one_confirmed_sale_per_listing_uidx" ON "deals" USING btree ("listing_id") WHERE "deals"."completed_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_closing_amount_positive" CHECK ("deals"."closing_amount" > 0);--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_completion_valid" CHECK ("deals"."completed_at" IS NULL OR ("deals"."status" = 'completed' AND
        "deals"."closing_amount" IS NOT NULL AND "deals"."closing_currency" IS NOT NULL AND
        "deals"."closing_agreed_at" IS NOT NULL AND "deals"."buyer_confirmed_at" IS NOT NULL AND
        "deals"."seller_confirmed_at" IS NOT NULL AND "deals"."closing_disputed_by" IS NULL));--> statement-breakpoint
ALTER TABLE "business_listings" ADD CONSTRAINT "listing_sold_state_valid" CHECK (("business_listings"."status"::text = 'sold') = ("business_listings"."sold_at" IS NOT NULL)
        AND ("business_listings"."public_sale_price" IS NULL) = ("business_listings"."public_sale_currency" IS NULL)
        AND ("business_listings"."public_sale_price" IS NULL OR ("business_listings"."sold_at" IS NOT NULL AND "business_listings"."public_sale_price" > 0)));
--> statement-breakpoint
-- Serialize new inquiries and deals against a sale using the listing row.
CREATE FUNCTION require_available_listing_for_inquiry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM business_listings
  WHERE id = NEW.listing_id AND status = 'published' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The listing is no longer available' USING ERRCODE = '23514',
      CONSTRAINT = 'listing_available_for_inquiry';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER conversations_available_listing
BEFORE INSERT ON conversations
FOR EACH ROW EXECUTE FUNCTION require_available_listing_for_inquiry();
--> statement-breakpoint
CREATE FUNCTION guard_sold_listing() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status::text = 'sold' THEN
      RAISE EXCEPTION 'Listings cannot be created as sold' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status::text = 'sold' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Sold listings are historical records' USING ERRCODE = '23514';
  END IF;
  IF NEW.status::text = 'sold' AND OLD.status::text <> 'sold' AND (
    OLD.status <> 'published' OR NOT EXISTS (
      SELECT 1 FROM deals AS d
      WHERE d.listing_id = NEW.id AND d.completed_at = NEW.sold_at
        AND NEW.public_sale_price IS NOT DISTINCT FROM
          CASE WHEN d.buyer_price_consent AND d.seller_price_consent THEN d.closing_amount END
        AND NEW.public_sale_currency IS NOT DISTINCT FROM
          CASE WHEN d.buyer_price_consent AND d.seller_price_consent THEN d.closing_currency END
    )
  ) THEN
    RAISE EXCEPTION 'Sold listings require a confirmed acquisition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER business_listings_sold_guard
BEFORE INSERT OR UPDATE ON business_listings
FOR EACH ROW EXECUTE FUNCTION guard_sold_listing();
--> statement-breakpoint
CREATE FUNCTION guard_confirmed_completion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'completed' AND NEW.status = 'completed' AND NOT EXISTS (
    SELECT 1 FROM business_listings AS l
    WHERE l.id = NEW.listing_id AND l.status::text = 'sold' AND l.sold_at = NEW.completed_at
  ) THEN
    RAISE EXCEPTION 'Completion requires the listing to be sold atomically' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER deals_completion_guard
AFTER UPDATE ON deals DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION guard_confirmed_completion();
--> statement-breakpoint
CREATE FUNCTION apply_acquisition_closing(
  p_deal integer, p_user integer, p_action text, p_revision integer,
  p_amount numeric, p_consent boolean
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  d deals%ROWTYPE;
  listing_status_now text;
  is_buyer boolean;
  other_user integer;
  agreed_currency varchar(3);
  event_name text;
  activity_id integer;
  stamp timestamptz;
BEGIN
  -- Always lock listing first, then the deal. Other deal writers lock only
  -- their deal. New inquiries and deals take a shared lock on the listing.
  SELECT l.status::text INTO listing_status_now
  FROM business_listings AS l JOIN deals AS candidate ON candidate.listing_id = l.id
  WHERE candidate.id = p_deal AND p_user IN (candidate.buyer_id, candidate.seller_id)
  FOR UPDATE OF l;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  SELECT * INTO d FROM deals WHERE id = p_deal FOR UPDATE;
  stamp := clock_timestamp();
  is_buyer := p_user = d.buyer_id;
  other_user := CASE WHEN is_buyer THEN d.seller_id ELSE d.buyer_id END;
  IF d.closing_revision <> p_revision THEN RETURN 'stale'; END IF;
  IF p_action = 'confirm' AND (
    (is_buyer AND d.buyer_confirmed_at IS NOT NULL) OR
    (NOT is_buyer AND d.seller_confirmed_at IS NOT NULL)
  ) THEN RETURN 'ok'; END IF;
  IF d.status <> 'accepted' OR listing_status_now <> 'published' THEN
    RETURN 'unavailable';
  END IF;
  IF d.closing_disputed_by IS NOT NULL AND p_action <> 'resolve' THEN
    RETURN 'disputed';
  END IF;

  CASE p_action
    WHEN 'propose' THEN
      IF d.closing_agreed_at IS NOT NULL THEN RETURN 'already_agreed'; END IF;
      IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount, 2)
        OR p_amount >= 10000000000000000 THEN RETURN 'invalid_amount'; END IF;
      SELECT currency INTO agreed_currency FROM deal_offers
      WHERE deal_id = d.id AND status = 'accepted';
      IF NOT FOUND THEN RETURN 'unavailable'; END IF;
      d.closing_revision := d.closing_revision + 1;
      d.closing_amount := p_amount;
      d.closing_currency := agreed_currency;
      d.closing_proposed_by := p_user;
      d.closing_agreed_at := NULL;
      event_name := 'deal.closing_proposed';
    WHEN 'agree' THEN
      IF d.closing_proposed_by IS NULL OR d.closing_proposed_by = p_user THEN
        RETURN 'agreement_required';
      END IF;
      IF d.closing_agreed_at IS NOT NULL THEN RETURN 'ok'; END IF;
      d.closing_agreed_at := stamp;
      event_name := 'deal.closing_agreed';
    WHEN 'confirm' THEN
      IF d.closing_agreed_at IS NULL THEN RETURN 'agreement_required'; END IF;
      IF is_buyer THEN
        d.buyer_confirmed_at := stamp;
        d.buyer_price_consent := coalesce(p_consent, false);
      ELSE
        d.seller_confirmed_at := stamp;
        d.seller_price_consent := coalesce(p_consent, false);
      END IF;
      event_name := 'deal.closing_confirmed';
      IF d.buyer_confirmed_at IS NOT NULL AND d.seller_confirmed_at IS NOT NULL THEN
        d.status := 'completed';
        d.completed_at := stamp;
      END IF;
    WHEN 'dispute' THEN
      d.closing_disputed_by := p_user;
      d.closing_revision := d.closing_revision + 1;
      event_name := 'deal.closing_disputed';
    WHEN 'resolve' THEN
      IF d.closing_disputed_by IS DISTINCT FROM p_user THEN RETURN 'dispute_owner'; END IF;
      d.closing_disputed_by := NULL;
      d.closing_agreed_at := NULL;
      d.closing_proposed_by := NULL;
      d.closing_amount := NULL;
      d.closing_currency := NULL;
      d.closing_revision := d.closing_revision + 1;
      event_name := 'deal.closing_resolved';
    ELSE RETURN 'invalid_action';
  END CASE;

  IF p_action IN ('propose','dispute') THEN
    d.buyer_confirmed_at := NULL;
    d.seller_confirmed_at := NULL;
    d.buyer_price_consent := false;
    d.seller_price_consent := false;
  END IF;

  UPDATE deals SET status = d.status, closing_revision = d.closing_revision,
    closing_amount = d.closing_amount, closing_currency = d.closing_currency,
    closing_proposed_by = d.closing_proposed_by, closing_agreed_at = d.closing_agreed_at,
    closing_disputed_by = d.closing_disputed_by, buyer_confirmed_at = d.buyer_confirmed_at,
    seller_confirmed_at = d.seller_confirmed_at, buyer_price_consent = d.buyer_price_consent,
    seller_price_consent = d.seller_price_consent, completed_at = d.completed_at, updated_at = stamp
  WHERE id = d.id;

  INSERT INTO deal_activities(deal_id, actor_id, event_type, metadata, created_at)
  VALUES (d.id, p_user, event_name,
    jsonb_build_object('revision', d.closing_revision) ||
      CASE WHEN p_action = 'propose' THEN jsonb_build_object('amount', d.closing_amount::text, 'currency', d.closing_currency)
        WHEN p_action = 'confirm' THEN jsonb_build_object('publicPriceConsent', coalesce(p_consent, false))
        ELSE '{}'::jsonb END, stamp)
  RETURNING id INTO activity_id;

  IF d.completed_at IS NULL THEN
    INSERT INTO notifications(user_id, dedupe_key, type, payload)
    VALUES (other_user, 'deal-closing:' || activity_id, event_name, jsonb_build_object('dealId', d.id));
    RETURN 'ok';
  END IF;

  UPDATE business_listings SET status = 'sold', sold_at = stamp, updated_at = stamp,
    public_sale_price = CASE WHEN d.buyer_price_consent AND d.seller_price_consent THEN d.closing_amount END,
    public_sale_currency = CASE WHEN d.buyer_price_consent AND d.seller_price_consent THEN d.closing_currency END
  WHERE id = d.listing_id;

  INSERT INTO deal_activities(deal_id, actor_id, event_type, metadata, created_at)
  VALUES (d.id, p_user, 'deal.status_changed', '{"from":"accepted","to":"completed"}', stamp);

  INSERT INTO notifications(user_id, dedupe_key, type, payload)
  SELECT recipient, 'acquisition-completed:' || d.id || ':' || recipient, 'deal.completed',
    jsonb_build_object('dealId', d.id, 'listingId', d.listing_id)
  FROM unnest(ARRAY[d.buyer_id, d.seller_id]) AS recipients(recipient);

  -- Take the competing deal locks before reading their offers so a negotiation
  -- that finishes waiting here is visible to the subsequent SQL statement.
  PERFORM id FROM deals WHERE listing_id = d.listing_id AND id <> d.id
    AND status IN ('proposed','negotiating','due_diligence','accepted')
    ORDER BY id FOR UPDATE;

  WITH stopped AS (
    UPDATE deals SET status = 'cancelled', updated_at = stamp
    WHERE listing_id = d.listing_id AND id <> d.id
      AND status IN ('proposed','negotiating','due_diligence','accepted')
    RETURNING id, buyer_id
  ), stopped_offers AS (
    UPDATE deal_offers SET status = 'superseded', responded_at = stamp
    WHERE deal_id IN (SELECT id FROM stopped) AND status = 'pending'
  )
  INSERT INTO deal_activities(deal_id, event_type, metadata, created_at)
  SELECT id, 'deal.listing_sold', jsonb_build_object('listingId', d.listing_id), stamp FROM stopped;

  WITH closed_inquiries AS (
    UPDATE conversations SET status = 'closed', status_updated_at = stamp
    WHERE listing_id = d.listing_id AND buyer_id <> d.buyer_id
      AND status IN ('pending','in_review','accepted')
    RETURNING buyer_id
  ), affected AS (
    SELECT buyer_id FROM closed_inquiries
    UNION SELECT buyer_id FROM deals WHERE listing_id = d.listing_id AND status = 'cancelled' AND updated_at = stamp
    UNION SELECT user_id FROM favorites WHERE listing_id = d.listing_id AND user_id <> d.buyer_id
  )
  INSERT INTO notifications(user_id, dedupe_key, type, payload)
  SELECT buyer_id, 'listing-sold:' || d.listing_id || ':' || buyer_id, 'listing.sold',
    jsonb_build_object('listingId', d.listing_id)
  FROM affected ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN 'ok';
END;
$$;
