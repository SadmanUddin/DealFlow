import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { businessListings } from '#models/listing.model.js';
import { users } from '#models/user.model.js';
import { conversationDocuments } from '#models/conversation.model.js';
import { ISO_4217_CURRENCIES } from '#utils/iso4217.js';

const isoCurrencySql = sql.raw(
  ISO_4217_CURRENCIES.map(currency => `'${currency}'`).join(', ')
);

export const deals = pgTable(
  'deals',
  {
    id: serial('id').primaryKey(),
    deal_uid: uuid('deal_uid').notNull().defaultRandom().unique(),
    listing_id: integer('listing_id')
      .notNull()
      .references(() => businessListings.id, { onDelete: 'restrict' }),
    buyer_id: integer('buyer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    seller_id: integer('seller_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: varchar('status', { length: 24 }).notNull().default('proposed'),
    accepted_at: timestamp('accepted_at', { withTimezone: true }),
    closing_revision: integer('closing_revision').notNull().default(0),
    closing_amount: numeric('closing_amount', { precision: 18, scale: 2 }),
    closing_currency: varchar('closing_currency', { length: 3 }),
    closing_proposed_by: integer('closing_proposed_by'),
    closing_agreed_at: timestamp('closing_agreed_at', { withTimezone: true }),
    buyer_confirmed_at: timestamp('buyer_confirmed_at', { withTimezone: true }),
    seller_confirmed_at: timestamp('seller_confirmed_at', {
      withTimezone: true,
    }),
    buyer_price_consent: boolean('buyer_price_consent')
      .notNull()
      .default(false),
    seller_price_consent: boolean('seller_price_consent')
      .notNull()
      .default(false),
    closing_disputed_by: integer('closing_disputed_by'),
    completed_at: timestamp('completed_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => [
    check(
      'deals_status_valid',
      sql`${table.status} IN ('proposed','negotiating','due_diligence','accepted','completed','cancelled','rejected')`
    ),
    check(
      'deals_distinct_participants',
      sql`${table.buyer_id} <> ${table.seller_id}`
    ),
    check(
      'deals_accepted_at_valid',
      sql`(${table.status} NOT IN ('accepted','completed') OR ${table.accepted_at} IS NOT NULL) AND (${table.accepted_at} IS NULL OR ${table.status} IN ('accepted','completed','cancelled'))`
    ),
    check('deals_closing_amount_positive', sql`${table.closing_amount} > 0`),
    check(
      'deals_completion_valid',
      sql`${table.completed_at} IS NULL OR (${table.status} = 'completed' AND
        ${table.closing_amount} IS NOT NULL AND ${table.closing_currency} IS NOT NULL AND
        ${table.closing_agreed_at} IS NOT NULL AND ${table.buyer_confirmed_at} IS NOT NULL AND
        ${table.seller_confirmed_at} IS NOT NULL AND ${table.closing_disputed_by} IS NULL)`
    ),
    uniqueIndex('deals_one_confirmed_sale_per_listing_uidx')
      .on(table.listing_id)
      .where(sql`${table.completed_at} IS NOT NULL`),
    uniqueIndex('deals_listing_buyer_active_uidx')
      .on(table.listing_id, table.buyer_id)
      .where(sql`${table.status} NOT IN ('completed','cancelled','rejected')`),
    index('deals_buyer_created_idx').on(
      table.buyer_id,
      table.created_at,
      table.id
    ),
    index('deals_seller_created_idx').on(
      table.seller_id,
      table.created_at,
      table.id
    ),
    foreignKey({
      name: 'deals_listing_seller_fk',
      columns: [table.listing_id, table.seller_id],
      foreignColumns: [businessListings.id, businessListings.seller_id],
    }).onDelete('restrict'),
  ]
);

export const dealOffers = pgTable(
  'deal_offers',
  {
    id: serial('id').primaryKey(),
    deal_id: integer('deal_id')
      .notNull()
      .references(() => deals.id, { onDelete: 'cascade' }),
    parent_offer_id: integer('parent_offer_id').references(
      () => dealOffers.id,
      { onDelete: 'restrict' }
    ),
    created_by: integer('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    message: text('message'),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    responded_at: timestamp('responded_at', { withTimezone: true }),
  },
  table => [
    check('deal_offers_amount_positive', sql`${table.amount} > 0`),
    check(
      'deal_offers_currency_valid',
      sql`${table.currency} IN (${isoCurrencySql})`
    ),
    check(
      'deal_offers_status_valid',
      sql`${table.status} IN ('pending','accepted','rejected','withdrawn','superseded')`
    ),
    check(
      'deal_offers_not_self_parent',
      sql`${table.parent_offer_id} IS NULL OR ${table.parent_offer_id} <> ${table.id}`
    ),
    index('deal_offers_deal_created_idx').on(
      table.deal_id,
      table.created_at,
      table.id
    ),
    uniqueIndex('deal_offers_one_accepted_per_deal_uidx')
      .on(table.deal_id)
      .where(sql`${table.status} = 'accepted'`),
  ]
);

export const dealActivities = pgTable(
  'deal_activities',
  {
    id: serial('id').primaryKey(),
    deal_id: integer('deal_id')
      .notNull()
      .references(() => deals.id, { onDelete: 'cascade' }),
    actor_id: integer('actor_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    event_type: varchar('event_type', { length: 64 }).notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => [
    index('deal_activities_deal_created_idx').on(
      table.deal_id,
      table.created_at,
      table.id
    ),
  ]
);

export const dealDocuments = pgTable(
  'deal_documents',
  {
    id: serial('id').primaryKey(),
    deal_id: integer('deal_id')
      .notNull()
      .references(() => deals.id, { onDelete: 'cascade' }),
    conversation_document_id: integer('conversation_document_id')
      .notNull()
      .references(() => conversationDocuments.id, { onDelete: 'cascade' }),
    linked_by: integer('linked_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => [
    uniqueIndex('deal_documents_deal_document_uidx').on(
      table.deal_id,
      table.conversation_document_id
    ),
  ]
);
