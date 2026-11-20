ALTER TABLE "deals" ADD CONSTRAINT "deals_listing_seller_fk" FOREIGN KEY ("listing_id","seller_id") REFERENCES "public"."business_listings"("id","seller_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE FUNCTION enforce_deal_offer_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_deal_id integer;
  buyer integer;
  seller integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'Only pending offers may transition';
    END IF;
    IF NEW.deal_id <> OLD.deal_id OR NEW.parent_offer_id IS DISTINCT FROM OLD.parent_offer_id
       OR NEW.created_by <> OLD.created_by OR NEW.amount <> OLD.amount
       OR NEW.currency <> OLD.currency OR NEW.message IS DISTINCT FROM OLD.message
       OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'Offer terms and revision links are immutable';
    END IF;
    IF NEW.status NOT IN ('accepted','rejected','withdrawn','superseded') THEN
      RAISE EXCEPTION 'Invalid offer state transition';
    END IF;
  END IF;
  SELECT buyer_id, seller_id INTO buyer, seller FROM deals WHERE id = NEW.deal_id;
  IF NEW.created_by NOT IN (buyer, seller) THEN
    RAISE EXCEPTION 'Offer creator must be a deal participant';
  END IF;
  IF NEW.parent_offer_id IS NOT NULL THEN
    SELECT deal_id INTO parent_deal_id FROM deal_offers WHERE id = NEW.parent_offer_id;
    IF parent_deal_id IS DISTINCT FROM NEW.deal_id THEN
      RAISE EXCEPTION 'Counteroffer parent must belong to the same deal';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "deal_offers_rules" BEFORE INSERT OR UPDATE ON "deal_offers"
FOR EACH ROW EXECUTE FUNCTION enforce_deal_offer_rules();
--> statement-breakpoint
CREATE FUNCTION require_accepted_offer_for_deal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'accepted' AND NOT EXISTS (
    SELECT 1 FROM deal_offers WHERE deal_id = NEW.id AND status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'A deal cannot be accepted without an accepted offer';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "deals_accepted_offer_required"
AFTER INSERT OR UPDATE ON "deals"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION require_accepted_offer_for_deal();
