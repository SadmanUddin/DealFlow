import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { dealDocuments, deals } from '#models/deal.model.js';
import { users } from '#models/user.model.js';

const timestamps = () => ({
  created_at: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const dealChecklistItems = pgTable(
  'deal_checklist_items',
  {
    id: serial('id').primaryKey(),
    deal_id: integer('deal_id')
      .notNull()
      .references(() => deals.id, { onDelete: 'cascade' }),
    created_by: integer('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    creation_key: uuid('creation_key').notNull(),
    title: varchar('title', { length: 160 }).notNull(),
    description: text('description').notNull(),
    category: varchar('category', { length: 16 }).notNull(),
    assigned_to: varchar('assigned_to', { length: 6 }).notNull(),
    status: varchar('status', { length: 16 }).default('pending').notNull(),
    due_date: date('due_date'),
    completed_at: timestamp('completed_at', { withTimezone: true }),
    revision: integer('revision').default(0).notNull(),
    ...timestamps(),
  },
  table => [
    uniqueIndex('deal_checklist_creation_uidx').on(
      table.deal_id,
      table.created_by,
      table.creation_key
    ),
    index('deal_checklist_page_idx').on(table.deal_id, table.id),
    check(
      'deal_checklist_category_valid',
      sql`${table.category} IN ('financial','legal','operational','commercial','technology','other')`
    ),
    check(
      'deal_checklist_assignment_valid',
      sql`${table.assigned_to} IN ('buyer','seller')`
    ),
    check(
      'deal_checklist_status_valid',
      sql`${table.status} IN ('pending','in_progress','completed','blocked') AND (${table.status} = 'completed') = (${table.completed_at} IS NOT NULL)`
    ),
  ]
);

export const dealDocumentRequests = pgTable(
  'deal_document_requests',
  {
    id: serial('id').primaryKey(),
    deal_id: integer('deal_id')
      .notNull()
      .references(() => deals.id, { onDelete: 'cascade' }),
    requested_by: integer('requested_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    responsible_id: integer('responsible_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    creation_key: uuid('creation_key').notNull(),
    title: varchar('title', { length: 160 }).notNull(),
    description: text('description').notNull(),
    status: varchar('status', { length: 20 }).default('requested').notNull(),
    due_date: date('due_date'),
    document_id: integer('document_id'),
    reviewed_by: integer('reviewed_by').references(() => users.id, {
      onDelete: 'restrict',
    }),
    reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
    feedback: text('feedback'),
    revision: integer('revision').default(0).notNull(),
    ...timestamps(),
  },
  table => [
    uniqueIndex('deal_document_request_creation_uidx').on(
      table.deal_id,
      table.requested_by,
      table.creation_key
    ),
    index('deal_document_request_page_idx').on(table.deal_id, table.id),
    index('deal_document_request_file_idx').on(
      table.deal_id,
      table.document_id
    ),
    foreignKey({
      name: 'deal_document_requests_same_deal_document_fk',
      columns: [table.deal_id, table.document_id],
      foreignColumns: [
        dealDocuments.deal_id,
        dealDocuments.conversation_document_id,
      ],
    }),
    check(
      'deal_document_request_roles_valid',
      sql`${table.requested_by} <> ${table.responsible_id} AND (${table.reviewed_by} IS NULL OR ${table.reviewed_by} = ${table.requested_by})`
    ),
    check(
      'deal_document_request_status_valid',
      sql`
    (${table.status} = 'requested' AND ${table.document_id} IS NULL AND ${table.reviewed_by} IS NULL AND ${table.reviewed_at} IS NULL)
    OR (${table.status} = 'submitted' AND ${table.document_id} IS NOT NULL AND ${table.reviewed_by} IS NULL AND ${table.reviewed_at} IS NULL)
    OR (${table.status} IN ('under_review','accepted','changes_requested') AND ${table.document_id} IS NOT NULL AND ${table.reviewed_by} IS NOT NULL AND ${table.reviewed_at} IS NOT NULL)`
    ),
  ]
);
