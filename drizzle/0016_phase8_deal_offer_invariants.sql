ALTER TABLE "deals" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
UPDATE deals AS deal
SET accepted_at = (
  SELECT min(activity.created_at)
  FROM deal_activities AS activity
  WHERE activity.deal_id = deal.id
    AND activity.event_type = 'deal.status_changed'
    AND activity.metadata->>'to' = 'accepted'
)
WHERE EXISTS (
  SELECT 1 FROM deal_activities AS activity
  WHERE activity.deal_id = deal.id
    AND activity.event_type = 'deal.status_changed'
    AND activity.metadata->>'to' = 'accepted'
);--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_accepted_at_valid"
CHECK (("deals"."status" NOT IN ('accepted','completed') OR "deals"."accepted_at" IS NOT NULL)
  AND ("deals"."accepted_at" IS NULL OR "deals"."status" IN ('accepted','completed','cancelled')));--> statement-breakpoint

CREATE FUNCTION enforce_deal_status_transitions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'proposed' OR NEW.accepted_at IS NOT NULL THEN
      RAISE EXCEPTION 'New deals must start as proposed without an acceptance timestamp'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'proposed' AND NEW.status IN ('negotiating','accepted','cancelled','rejected')) OR
    (OLD.status = 'negotiating' AND NEW.status IN ('due_diligence','accepted','cancelled','rejected')) OR
    (OLD.status = 'due_diligence' AND NEW.status IN ('accepted','cancelled','rejected')) OR
    (OLD.status = 'accepted' AND NEW.status IN ('completed','cancelled'))
  ) THEN
    RAISE EXCEPTION 'Invalid deal status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  IF OLD.accepted_at IS NOT NULL THEN
    IF NEW.accepted_at IS DISTINCT FROM OLD.accepted_at THEN
      RAISE EXCEPTION 'Deal acceptance timestamp is immutable' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.status = 'accepted' THEN
    NEW.accepted_at := now();
  ELSIF NEW.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Acceptance timestamp can only be set by accepting a deal'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "deals_status_transition_guard"
BEFORE INSERT OR UPDATE OF status, accepted_at ON "deals"
FOR EACH ROW EXECUTE FUNCTION enforce_deal_status_transitions();--> statement-breakpoint

CREATE FUNCTION require_pending_offer_on_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'pending' THEN
    RAISE EXCEPTION 'New offers must start as pending' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "deal_offers_pending_insert_guard"
BEFORE INSERT ON "deal_offers"
FOR EACH ROW EXECUTE FUNCTION require_pending_offer_on_insert();--> statement-breakpoint

CREATE FUNCTION prevent_deal_offer_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Deal offers are historical records and cannot be deleted'
    USING ERRCODE = '23514';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "deal_offers_no_delete"
BEFORE DELETE ON "deal_offers"
FOR EACH ROW EXECUTE FUNCTION prevent_deal_offer_delete();--> statement-breakpoint

CREATE FUNCTION enforce_deal_offer_lifecycle_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  checked_deal_id integer;
  current_status varchar(24);
  current_accepted_at timestamp with time zone;
  accepted_offer_id integer;
BEGIN
  IF TG_TABLE_NAME = 'deals' THEN
    IF TG_OP = 'DELETE' THEN
      checked_deal_id := OLD.id;
    ELSE
      checked_deal_id := NEW.id;
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      checked_deal_id := OLD.deal_id;
    ELSE
      checked_deal_id := NEW.deal_id;
    END IF;
  END IF;

  SELECT deal.status, deal.accepted_at INTO current_status, current_accepted_at
  FROM deals AS deal WHERE deal.id = checked_deal_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT offer.id INTO accepted_offer_id
  FROM deal_offers AS offer
  WHERE offer.deal_id = checked_deal_id AND offer.status = 'accepted';

  IF (current_status = 'accepted' OR current_accepted_at IS NOT NULL)
     AND (accepted_offer_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM deal_activities AS activity
       WHERE activity.deal_id = checked_deal_id
         AND activity.event_type = 'offer.accepted'
         AND activity.metadata->>'offerId' = accepted_offer_id::text
     )) THEN
    RAISE EXCEPTION 'An accepted deal lifecycle must have its accepted offer and history event'
      USING ERRCODE = '23514';
  END IF;

  IF accepted_offer_id IS NOT NULL AND (
    current_accepted_at IS NULL OR
    current_status NOT IN ('accepted','completed','cancelled') OR
    NOT EXISTS (
      SELECT 1 FROM deal_activities AS activity
      WHERE activity.deal_id = checked_deal_id
        AND activity.event_type = 'offer.accepted'
        AND activity.metadata->>'offerId' = accepted_offer_id::text
    )
  ) THEN
    RAISE EXCEPTION 'An accepted offer must belong to its accepted deal lifecycle'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint

-- Validate existing rows without rewriting historical negotiation records.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM deals AS deal
    LEFT JOIN deal_offers AS offer
      ON offer.deal_id = deal.id AND offer.status = 'accepted'
    WHERE (deal.status IN ('accepted','completed') AND deal.accepted_at IS NULL)
       OR (deal.accepted_at IS NOT NULL AND deal.status NOT IN ('accepted','completed','cancelled'))
       OR ((deal.status = 'accepted' OR deal.accepted_at IS NOT NULL)
         AND (offer.id IS NULL OR NOT EXISTS (
           SELECT 1 FROM deal_activities AS activity
           WHERE activity.deal_id = deal.id
             AND activity.event_type = 'offer.accepted'
             AND activity.metadata->>'offerId' = offer.id::text
         )))
       OR (offer.id IS NOT NULL AND (
         deal.accepted_at IS NULL OR deal.status NOT IN ('accepted','completed','cancelled')
         OR NOT EXISTS (
           SELECT 1 FROM deal_activities AS activity
           WHERE activity.deal_id = deal.id
             AND activity.event_type = 'offer.accepted'
             AND activity.metadata->>'offerId' = offer.id::text
         )
       ))
  ) THEN
    RAISE EXCEPTION 'Existing deals and offers violate accepted-offer lifecycle integrity';
  END IF;
END;
$$;--> statement-breakpoint

CREATE CONSTRAINT TRIGGER "deals_offer_lifecycle_integrity"
AFTER INSERT OR UPDATE OR DELETE ON "deals"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_deal_offer_lifecycle_integrity();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "offers_deal_lifecycle_integrity"
AFTER INSERT OR UPDATE OR DELETE ON "deal_offers"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_deal_offer_lifecycle_integrity();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "deal_activity_offer_lifecycle_integrity"
AFTER INSERT ON "deal_activities"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_deal_offer_lifecycle_integrity();
