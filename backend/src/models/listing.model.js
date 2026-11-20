import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from '#models/user.model.js';

export const listingStatus = pgEnum('listing_status', [
  'draft',
  'pending',
  'published',
  'rejected',
  'archived',
  'suspended',
]);

export const businessListings = pgTable(
  'business_listings',
  {
    id: serial('id').primaryKey(),
    seller_id: integer('seller_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description').notNull(),
    industry: varchar('industry', { length: 120 }),
    location: varchar('location', { length: 160 }),
    asking_price: numeric('asking_price', { precision: 18, scale: 2 }),
    annual_revenue: numeric('annual_revenue', { precision: 18, scale: 2 }),
    ebitda: numeric('ebitda', { precision: 18, scale: 2 }),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    status: listingStatus('status').notNull().default('draft'),
    public_snapshot: jsonb('public_snapshot'),
    rejection_reason: text('rejection_reason'),
    moderation_reason: text('moderation_reason'),
    moderated_by: integer('moderated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    moderated_at: timestamp('moderated_at', { withTimezone: true }),
    suspended_at: timestamp('suspended_at', { withTimezone: true }),
    suspended_by: integer('suspended_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    published_at: timestamp('published_at'),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    index('business_listings_seller_id_idx').on(table.seller_id),
    uniqueIndex('business_listings_id_seller_id_uidx').on(
      table.id,
      table.seller_id
    ),
    index('business_listings_status_created_at_idx').on(
      table.status,
      table.created_at
    ),
    index('business_listings_status_published_at_idx').on(
      table.status,
      table.published_at,
      table.id
    ),
    index('business_listings_status_industry_idx').on(
      table.status,
      table.industry
    ),
    index('business_listings_status_location_idx').on(
      table.status,
      table.location
    ),
    index('business_listings_status_asking_price_idx').on(
      table.status,
      table.asking_price
    ),
    index('business_listings_status_annual_revenue_idx').on(
      table.status,
      table.annual_revenue
    ),
    index('business_listings_status_ebitda_idx').on(table.status, table.ebitda),
    index('business_listings_title_trgm_idx').using(
      'gin',
      sql`${table.title} gin_trgm_ops`
    ),
    index('business_listings_description_trgm_idx').using(
      'gin',
      sql`${table.description} gin_trgm_ops`
    ),
    index('business_listings_industry_trgm_idx').using(
      'gin',
      sql`${table.industry} gin_trgm_ops`
    ),
    index('business_listings_location_trgm_idx').using(
      'gin',
      sql`${table.location} gin_trgm_ops`
    ),
    check(
      'business_listings_financials_nonnegative',
      sql`(${table.asking_price} IS NULL OR ${table.asking_price} >= 0) AND (${table.annual_revenue} IS NULL OR ${table.annual_revenue} >= 0) AND (${table.ebitda} IS NULL OR ${table.ebitda} >= 0)`
    ),
    check(
      'business_listings_currency_format',
      sql`${table.currency} ~ '^[A-Z]{3}$'`
    ),
  ]
);
