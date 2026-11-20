import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from '#models/user.model.js';
import { businessListings } from '#models/listing.model.js';

export const favorites = pgTable(
  'favorites',
  {
    id: serial('id').primaryKey(),
    user_id: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    listing_id: integer('listing_id')
      .notNull()
      .references(() => businessListings.id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex('favorites_user_listing_uidx').on(
      table.user_id,
      table.listing_id
    ),
    index('favorites_user_created_idx').on(
      table.user_id,
      table.created_at,
      table.id
    ),
    index('favorites_listing_idx').on(table.listing_id),
  ]
);

export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    user_id: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    dedupe_key: varchar('dedupe_key', { length: 255 }).unique(),
    type: varchar('type', { length: 64 }).notNull(),
    payload: jsonb('payload').notNull().default({}),
    read_at: timestamp('read_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    index('notifications_user_created_idx').on(
      table.user_id,
      table.created_at,
      table.id
    ),
    index('notifications_user_unread_idx')
      .on(table.user_id, table.created_at)
      .where(sql`${table.read_at} IS NULL`),
  ]
);

export const notificationEmailPreferences = pgTable(
  'notification_email_preferences',
  {
    user_id: integer('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    listing_status: boolean('listing_status').notNull().default(true),
    listing_price: boolean('listing_price').notNull().default(true),
    listing_details: boolean('listing_details').notNull().default(true),
    deal_updates: boolean('deal_updates').notNull().default(true),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  }
);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: serial('id').primaryKey(),
    event_key: varchar('event_key', { length: 255 }).notNull().unique(),
    type: varchar('type', { length: 64 }).notNull(),
    payload: jsonb('payload').notNull(),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    available_at: timestamp('available_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    locked_at: timestamp('locked_at', { withTimezone: true }),
    lock_token: varchar('lock_token', { length: 36 }),
    last_error: text('last_error'),
    processed_at: timestamp('processed_at', { withTimezone: true }),
    quarantined_at: timestamp('quarantined_at', { withTimezone: true }),
    quarantine_reason: text('quarantine_reason'),
    created_at: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    index('outbox_events_pending_idx').on(
      table.status,
      table.available_at,
      table.id
    ),
    check(
      'outbox_events_status_valid',
      sql`${table.status} IN ('pending', 'processing', 'processed', 'dead', 'quarantined')`
    ),
  ]
);
