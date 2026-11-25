import { sql } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  pgTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { businessListings } from '#models/listing.model.js';

export const listingViewEvents = pgTable(
  'listing_view_events',
  {
    listing_id: integer('listing_id')
      .notNull()
      .references(() => businessListings.id, { onDelete: 'cascade' }),
    viewed_on: date('viewed_on').notNull(),
    viewer_key: varchar('viewer_key', { length: 64 }),
  },
  table => [
    uniqueIndex('listing_view_events_daily_viewer_uidx').on(
      table.listing_id,
      table.viewed_on,
      table.viewer_key
    ),
    index('listing_view_events_key_cleanup_idx')
      .on(table.viewed_on)
      .where(sql`${table.viewer_key} IS NOT NULL`),
  ]
);
