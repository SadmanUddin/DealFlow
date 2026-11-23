import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from '#models/user.model.js';
import { businessListings } from '#models/listing.model.js';

export const buyerSavedSearches = pgTable(
  'buyer_saved_searches',
  {
    id: serial('id').primaryKey(),
    buyer_id: integer('buyer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    filters: jsonb('filters').notNull(),
    alerts_enabled: boolean('alerts_enabled').default(true).notNull(),
    frequency: varchar('frequency', { length: 8 }).default('off').notNull(),
    active_since: timestamp('active_since', { withTimezone: true })
      .defaultNow()
      .notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    index('buyer_saved_searches_owner_idx').on(table.buyer_id, table.id),
    index('buyer_saved_searches_active_idx')
      .on(table.active_since)
      .where(sql`${table.alerts_enabled}`),
    check(
      'buyer_saved_searches_frequency_valid',
      sql`${table.frequency} IN ('instant','daily','weekly','off')`
    ),
    check(
      'buyer_saved_searches_filters_object',
      sql`jsonb_typeof(${table.filters}) = 'object'`
    ),
  ]
);

export const savedSearchListingMatches = pgTable(
  'saved_search_listing_matches',
  {
    saved_search_id: integer('saved_search_id')
      .notNull()
      .references(() => buyerSavedSearches.id, { onDelete: 'cascade' }),
    listing_id: integer('listing_id')
      .notNull()
      .references(() => businessListings.id, { onDelete: 'cascade' }),
    matched_at: timestamp('matched_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    delivery_key: varchar('delivery_key', { length: 255 }),
  },
  table => [
    primaryKey({ columns: [table.saved_search_id, table.listing_id] }),
    index('saved_search_matches_listing_idx').on(table.listing_id),
    index('saved_search_matches_delivery_idx')
      .on(table.delivery_key)
      .where(sql`${table.delivery_key} IS NOT NULL`),
  ]
);
