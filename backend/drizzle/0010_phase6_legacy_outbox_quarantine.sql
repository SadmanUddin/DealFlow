ALTER TABLE outbox_events
  ADD COLUMN quarantined_at timestamptz,
  ADD COLUMN quarantine_reason text;

ALTER TABLE outbox_events
  DROP CONSTRAINT outbox_events_status_valid;
ALTER TABLE outbox_events
  ADD CONSTRAINT outbox_events_status_valid
  CHECK (status IN ('pending', 'processing', 'processed', 'dead', 'quarantined'));

-- Migration 0008 used keys of the form listing:<id>:<random UUID>. Migration
-- 0009's keys include the event type and timestamp, so they do not match this
-- legacy signature. Quarantine first so no ambiguous event remains claimable
-- while the safe approval subset is being identified. Preserve every row.
UPDATE outbox_events AS event
SET status = 'quarantined',
    quarantined_at = now(),
    quarantine_reason = CASE
      WHEN event.attempts > 0 THEN 'Legacy event has a nonzero attempt count; delivery may already have partially occurred'
      WHEN event.type = 'listing.price_changed' THEN 'Legacy price event cannot be proven safe against approved public history and duplicate delivery'
      WHEN event.type = 'listing.details_changed' THEN 'Legacy details event does not identify the changed public fields or their approval'
      WHEN event.type = 'listing.rejected' THEN 'Legacy rejection payload cannot be proven to match the last approved public version'
      WHEN event.type = 'listing.archived' THEN 'Legacy archive payload cannot be proven to match the last approved public version'
      WHEN event.type = 'listing.approved' THEN 'Legacy approval origin or payload could not be established reliably'
      ELSE 'Unrecognized legacy listing event cannot be established reliably'
    END,
    locked_at = NULL,
    lock_token = NULL
WHERE event.event_key ~ '^listing:[0-9]+:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  AND event.status <> 'quarantined'
  AND (
    event.attempts > 0
    OR event.status IN ('pending', 'processing')
    OR event.status = 'dead'
  );

-- Recover only zero-attempt approval events whose 0008 origin and complete
-- user-visible payload are established. A matching approval event with the
-- same snapshot and recipient list makes the old event ambiguous, so both
-- remain quarantined instead of risking duplicate delivery.
UPDATE outbox_events AS event
SET status = 'pending',
    quarantine_reason = NULL,
    quarantined_at = NULL,
    locked_at = NULL,
    lock_token = NULL
WHERE event.type = 'listing.approved'
  AND event.status = 'quarantined'
  AND event.quarantine_reason = 'Legacy approval origin or payload could not be established reliably'
  AND event.attempts = 0
  AND event.event_key ~ '^listing:[0-9]+:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  AND jsonb_typeof(event.payload->'listingId') = 'number'
  AND event.payload->>'listingId' ~ '^[0-9]+$'
  AND event.event_key ~ ('^listing:' || (event.payload->>'listingId') || ':[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
  AND jsonb_typeof(event.payload->'title') = 'string'
  AND jsonb_typeof(event.payload->'currency') = 'string'
  AND jsonb_typeof(event.payload->'userIds') = 'array'
  AND (jsonb_typeof(event.payload->'askingPrice') IN ('number', 'null'))
  AND NOT EXISTS (
    SELECT 1
    FROM outbox_events AS other
    WHERE other.id <> event.id
      AND other.type = 'listing.approved'
      AND other.payload->'listingId' = event.payload->'listingId'
      AND other.payload->'title' = event.payload->'title'
      AND other.payload->'askingPrice' = event.payload->'askingPrice'
      AND other.payload->'currency' = event.payload->'currency'
      AND other.payload->'userIds' = event.payload->'userIds'
  );
