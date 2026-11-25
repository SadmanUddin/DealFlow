import { createHmac } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '#config/database.js';
import { publicListingStatuses } from '#utils/listing-visibility.js';

export async function recordListingView(
  listingId,
  viewer,
  { since, secret },
  now = new Date()
) {
  if (
    !since ||
    now < new Date(since) ||
    viewer?.emailVerified !== true ||
    !['buyer', 'seller'].includes(viewer.role)
  )
    return;
  const date = now.toISOString().slice(0, 10);
  const key = createHmac('sha256', secret)
    .update(`listing-view:v1:${listingId}:${date}:${viewer.id}`)
    .digest('hex');

  const publicStatuses = sql.join(publicListingStatuses.map(status => sql`${status}`), sql`, `);
  await db.execute(sql`
    INSERT INTO listing_view_events (listing_id, viewed_on, viewer_key)
    SELECT id, ${date}::date, ${key}
    FROM business_listings
    WHERE id = ${listingId} AND seller_id <> ${viewer.id}
      AND status IN (${publicStatuses})
    FOR SHARE
    ON CONFLICT (listing_id, viewed_on, viewer_key) DO NOTHING
  `);
}

export async function clearExpiredListingViewKeys(now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  // Leave yesterday intact to tolerate in-flight writes near midnight.
  await db.execute(sql`
    UPDATE listing_view_events SET viewer_key = NULL
    WHERE viewer_key IS NOT NULL AND viewed_on < ${today}::date - 1
  `);
}
