-- Offer creation holds the deal row lock before calling this function.
-- A volatile SQL function checks pending offers with a fresh READ COMMITTED
-- snapshot, including offers committed while the caller waited for the lock.
CREATE FUNCTION public.has_pending_deal_offer(p_deal_id integer, p_actor_id integer)
RETURNS boolean
LANGUAGE sql
VOLATILE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.deal_offers AS offer
    WHERE offer.deal_id = p_deal_id
      AND offer.created_by = p_actor_id
      AND offer.status = 'pending'
  );
$$;
