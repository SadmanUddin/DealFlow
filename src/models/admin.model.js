import { check, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from '#models/user.model.js';
import { businessListings } from '#models/listing.model.js';

export const moderationReports = pgTable('moderation_reports', {
  id: serial('id').primaryKey(),
  reporter_id: integer('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  listing_id: integer('listing_id').references(() => businessListings.id, { onDelete: 'cascade' }),
  reported_user_id: integer('reported_user_id').references(() => users.id, { onDelete: 'cascade' }),
  category: varchar('category', { length: 48 }).notNull(),
  description: text('description').notNull(),
  status: varchar('status', { length: 16 }).notNull().default('pending'),
  moderator_notes: text('moderator_notes'),
  resolution_reason: text('resolution_reason'),
  assigned_to: integer('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  resolved_by: integer('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  resolved_at: timestamp('resolved_at', { withTimezone: true }),
}, table => [
  check('moderation_reports_one_target', sql`(${table.listing_id} IS NOT NULL)::int + (${table.reported_user_id} IS NOT NULL)::int = 1`),
  check('moderation_reports_status_valid', sql`${table.status} IN ('pending', 'under_review', 'resolved', 'dismissed')`),
  check('moderation_reports_category_valid', sql`${table.category} IN ('suspicious_activity', 'misleading_information', 'potential_scam', 'marketplace_violation', 'other')`),
  check('moderation_reports_description_length', sql`char_length(trim(${table.description})) BETWEEN 10 AND 5000`),
  check('moderation_reports_not_self', sql`${table.reported_user_id} IS NULL OR ${table.reporter_id} <> ${table.reported_user_id}`),
  index('moderation_reports_status_created_idx').on(table.status, table.created_at, table.id),
  index('moderation_reports_reporter_created_idx').on(table.reporter_id, table.created_at, table.id),
  index('moderation_reports_listing_idx').on(table.listing_id),
  index('moderation_reports_reported_user_idx').on(table.reported_user_id),
  index('moderation_reports_description_trgm_idx').using('gin', sql`${table.description} gin_trgm_ops`),
  uniqueIndex('moderation_reports_open_duplicate_uidx').on(table.reporter_id, sql`COALESCE(${table.listing_id}, 0)`, sql`COALESCE(${table.reported_user_id}, 0)`, table.category).where(sql`${table.status} IN ('pending', 'under_review')`),
]);

export const adminAuditLogs = pgTable('admin_audit_logs', {
  id: serial('id').primaryKey(),
  actor_id: integer('actor_id').references(() => users.id),
  action: varchar('action', { length: 80 }).notNull(),
  target_type: varchar('target_type', { length: 40 }).notNull(),
  target_id: varchar('target_id', { length: 100 }).notNull(),
  reason: text('reason'),
  before_state: jsonb('before_state'),
  after_state: jsonb('after_state'),
  request_id: varchar('request_id', { length: 128 }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('admin_audit_created_idx').on(table.created_at, table.id),
  index('admin_audit_actor_created_idx').on(table.actor_id, table.created_at, table.id),
  index('admin_audit_target_idx').on(table.target_type, table.target_id, table.created_at),
]);

export const adminBootstrapClaims = pgTable('admin_bootstrap_claims', {
  id: integer('id').primaryKey(),
  completed_at: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [check('admin_bootstrap_singleton', sql`${table.id} = 1`)]);
