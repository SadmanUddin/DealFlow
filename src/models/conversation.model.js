import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { businessListings } from '#models/listing.model.js';
import { users } from '#models/user.model.js';

export const conversations = pgTable(
  'conversations',
  {
    id: serial('id').primaryKey(),
    listing_id: integer('listing_id').notNull(),
    buyer_id: integer('buyer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    seller_id: integer('seller_id').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex('conversations_listing_buyer_uidx').on(
      table.listing_id,
      table.buyer_id
    ),
    index('conversations_buyer_created_idx').on(
      table.buyer_id,
      table.created_at,
      table.id
    ),
    index('conversations_seller_created_idx').on(
      table.seller_id,
      table.created_at,
      table.id
    ),
    check(
      'conversations_distinct_participants',
      sql`${table.buyer_id} <> ${table.seller_id}`
    ),
    foreignKey({
      name: 'conversations_listing_seller_fk',
      columns: [table.listing_id, table.seller_id],
      foreignColumns: [businessListings.id, businessListings.seller_id],
    }).onDelete('cascade'),
  ]
);

export const messages = pgTable(
  'messages',
  {
    id: serial('id').primaryKey(),
    conversation_id: integer('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    sender_id: integer('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    created_at: timestamp('created_at', {
      withTimezone: true,
      precision: 3,
    })
      .defaultNow()
      .notNull(),
    read_at: timestamp('read_at', { withTimezone: true, precision: 3 }),
  },
  table => [
    index('messages_conversation_created_id_idx').on(
      table.conversation_id,
      table.created_at,
      table.id
    ),
    index('messages_conversation_unread_sender_idx')
      .on(table.conversation_id, table.sender_id)
      .where(sql`${table.read_at} IS NULL`),
    check(
      'messages_content_nonempty_and_bounded',
      sql`char_length(trim(${table.content})) BETWEEN 1 AND 10000`
    ),
  ]
);
