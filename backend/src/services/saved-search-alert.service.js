import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '#config/database.js';
import { getEnvironment } from '#config/env.js';
import { sendEmail } from '#services/email/email.adapter.js';
import { savedSearchEmailTemplate } from '#services/email/templates/saved-search.js';
import { savedMarketplaceCriteria } from '#utils/marketplace-criteria.js';

const eventPayload = z.object({
  listingId: z.number().int().positive().max(2147483647),
  publicationDate: z.string().nullable(),
  occurredAt: z.iso.datetime({ offset: true }),
});
const emailPayload = z.object({
  buyerId: z.number().int().positive(),
  frequency: z.enum(['instant', 'daily', 'weekly']),
});

const checked = (schema, value) => {
  const result = schema.safeParse(value);
  if (!result.success) {
    const error = new Error('Invalid saved search event payload');
    error.permanent = true;
    throw error;
  }
  return result.data;
};

export const matchSavedSearchPublication = async raw => {
  const { listingId, publicationDate, occurredAt } = checked(eventPayload, raw);
  // Reserve each digest bucket before adding its matches. Once claimed, late
  // matches move to the next open window instead of changing the claimed email.
  await db.execute(sql`
    WITH listing_scope AS MATERIALIZED (
      SELECT id, title, description, industry, location, asking_price, annual_revenue, ebitda
      FROM business_listings WHERE id = ${listingId} AND status = 'published'
        AND published_at IS NOT DISTINCT FROM ${publicationDate}::timestamp
      FOR SHARE
    ), candidates AS MATERIALIZED (
      SELECT s.id, s.buyer_id, s.name, s.frequency, business_listings.title,
        NOT EXISTS (
          SELECT 1 FROM saved_search_listing_matches m
          JOIN buyer_saved_searches prior ON prior.id = m.saved_search_id
          WHERE m.listing_id = business_listings.id AND prior.buyer_id = s.buyer_id
        ) AS first_for_buyer,
        CASE s.frequency WHEN 'instant' THEN 1 WHEN 'daily' THEN 2 WHEN 'weekly' THEN 3 ELSE 4 END AS priority
      FROM listing_scope business_listings CROSS JOIN buyer_saved_searches s
      JOIN users buyer ON buyer.id = s.buyer_id AND buyer.role = 'buyer' AND buyer.is_active
      WHERE s.alerts_enabled AND s.active_since <= ${occurredAt}::timestamptz
        AND s.filters->>'availability' IN ('available', 'all')
        AND ${savedMarketplaceCriteria(sql`s.filters`)}
    ), schedule AS MATERIALIZED (
      SELECT buyer_id, min(priority) AS priority, clock_timestamp() AT TIME ZONE 'UTC' AS utc_time
      FROM candidates WHERE first_for_buyer GROUP BY buyer_id
    ), jobs AS MATERIALIZED (
      SELECT buyer_id, priority,
        CASE priority WHEN 1 THEN 'instant' WHEN 2 THEN 'daily' WHEN 3 THEN 'weekly' END AS frequency,
        CASE priority
          WHEN 1 THEN 'saved-search:instant:' || buyer_id || ':' || ${listingId}::text
          WHEN 2 THEN 'saved-search:daily:' || buyer_id || ':' || utc_time::date
          WHEN 3 THEN 'saved-search:weekly:' || buyer_id || ':' || date_trunc('week', utc_time)::date END AS delivery_key,
        CASE priority
          WHEN 1 THEN clock_timestamp()
          WHEN 2 THEN (date_trunc('day', utc_time) + interval '1 day 5 minutes') AT TIME ZONE 'UTC'
          WHEN 3 THEN (date_trunc('week', utc_time) + interval '1 week 5 minutes') AT TIME ZONE 'UTC'
        END AS due,
        CASE priority WHEN 2 THEN interval '1 day' WHEN 3 THEN interval '1 week' END AS period
      FROM schedule
    ), grouped AS (
      SELECT buyer_id, max(title) AS title, (array_agg(name ORDER BY id))[1:10] AS names
      FROM candidates WHERE first_for_buyer GROUP BY buyer_id
    ), notified AS (
      INSERT INTO notifications(user_id, dedupe_key, type, payload)
      SELECT buyer_id, 'saved-search:listing:' || buyer_id || ':' || ${listingId}::text,
        'saved_search.match', jsonb_build_object('listingId', ${listingId}::int, 'title', title, 'searchNames', names)
      FROM grouped ON CONFLICT (dedupe_key) DO NOTHING RETURNING user_id
    ), queued AS (
      INSERT INTO outbox_events(event_key, type, payload, available_at)
      SELECT j.delivery_key, 'saved_search.email',
        jsonb_build_object('buyerId', j.buyer_id, 'frequency', j.frequency), j.due
      FROM jobs j JOIN notified n ON n.user_id = j.buyer_id
      WHERE j.delivery_key IS NOT NULL
      ORDER BY j.delivery_key
      ON CONFLICT (event_key) DO UPDATE SET available_at = outbox_events.available_at
        WHERE outbox_events.status = 'pending' AND outbox_events.attempts = 0
      RETURNING event_key
    ), next_windows AS (
      SELECT j.*,
        greatest(j.due AT TIME ZONE 'UTC' - interval '5 minutes',
          date_trunc(CASE WHEN j.frequency = 'daily' THEN 'day' ELSE 'week' END, clock_timestamp() AT TIME ZONE 'UTC')
        ) AS window_start
      FROM jobs j JOIN notified n ON n.user_id = j.buyer_id
      WHERE j.period IS NOT NULL AND NOT EXISTS (SELECT 1 FROM queued q WHERE q.event_key = j.delivery_key)
    ), next_keys AS (
      SELECT buyer_id, frequency, 'saved-search:' || frequency || ':' || buyer_id || ':' || window_start::date AS delivery_key,
        (window_start + period + interval '5 minutes') AT TIME ZONE 'UTC' AS due
      FROM next_windows
    ), queued_next AS (
      INSERT INTO outbox_events(event_key, type, payload, available_at)
      SELECT delivery_key, 'saved_search.email', jsonb_build_object('buyerId', buyer_id, 'frequency', frequency), due
      FROM next_keys ORDER BY delivery_key
      ON CONFLICT (event_key) DO UPDATE SET available_at = outbox_events.available_at
        WHERE outbox_events.status = 'pending' AND outbox_events.attempts = 0
      RETURNING event_key
    )
    INSERT INTO saved_search_listing_matches(saved_search_id, listing_id, delivery_key)
    SELECT c.id, ${listingId}, coalesce(q.event_key, later.event_key)
    FROM candidates c
    LEFT JOIN jobs j ON j.buyer_id = c.buyer_id AND j.priority = c.priority
    LEFT JOIN queued q ON q.event_key = j.delivery_key
    LEFT JOIN next_keys k ON k.buyer_id = j.buyer_id
    LEFT JOIN queued_next later ON later.event_key = k.delivery_key
    ON CONFLICT DO NOTHING
  `);
};

export const sendSavedSearchEmail = async (event, assertLease) => {
  const { buyerId, frequency } = checked(emailPayload, event.payload);
  await assertLease();
  const result = await db.execute(sql`
    SELECT buyer.name AS "buyerName", buyer.email, business_listings.id, business_listings.title, business_listings.industry, business_listings.location,
      array_agg(DISTINCT search.name ORDER BY search.name) AS searches
    FROM saved_search_listing_matches match
    JOIN buyer_saved_searches search ON search.id = match.saved_search_id
    JOIN business_listings ON business_listings.id = match.listing_id AND business_listings.status = 'published'
    JOIN users buyer ON buyer.id = search.buyer_id AND buyer.role = 'buyer' AND buyer.is_active AND buyer.email_verified
    LEFT JOIN notification_email_preferences preferences ON preferences.user_id = buyer.id
    WHERE match.delivery_key = ${event.eventKey} AND buyer.id = ${buyerId}
      AND search.alerts_enabled AND search.frequency = ${frequency}
      AND search.active_since <= match.matched_at AND coalesce(preferences.listing_status, true)
    AND ${savedMarketplaceCriteria(sql`search.filters`)}
    GROUP BY buyer.name, buyer.email, business_listings.id
    ORDER BY business_listings.id LIMIT 51
  `);
  const listings = Array.isArray(result) ? result : result.rows;
  if (!listings.length) return;
  const env = getEnvironment();
  const base = env.FRONTEND_URL || env.CORS_ORIGINS.split(',')[0].trim();
  const template = savedSearchEmailTemplate({
    buyerName: listings[0].buyerName,
    listings: listings.slice(0, 50),
    hasMore: listings.length > 50,
    frequency,
    base,
  });
  await assertLease();
  await sendEmail({
    to: listings[0].email,
    ...template,
    idempotencyKey: event.eventKey,
    signal: event.signal,
  });
};
