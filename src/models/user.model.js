import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['buyer', 'seller', 'admin']);
export const authTokenType = pgEnum('auth_token_type', [
  'email_verification',
  'password_reset',
]);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', {
    length: 255,
  }).notNull(),
  email: varchar('email', {
    length: 255,
  })
    .notNull()
    .unique(),
  password: varchar('password', {
    length: 255,
  }).notNull(),
  role: userRole('role').notNull().default('buyer'),
  email_verified: boolean('email_verified').notNull().default(false),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp().defaultNow().notNull(),
  updated_at: timestamp().defaultNow().notNull(),
});

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    user_id: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    csrf_token_hash: varchar('csrf_token_hash', { length: 64 }).notNull(),
    expires_at: timestamp({ withTimezone: true }).notNull(),
    revoked_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  table => [index('auth_sessions_user_id_idx').on(table.user_id)]
);

export const authTokens = pgTable(
  'auth_tokens',
  {
    token_hash: varchar('token_hash', { length: 64 }).primaryKey(),
    user_id: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: authTokenType('type').notNull(),
    expires_at: timestamp({ withTimezone: true }).notNull(),
    consumed_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index('auth_tokens_user_type_idx').on(table.user_id, table.type),
    index('auth_tokens_expires_at_idx').on(table.expires_at),
  ]
);
