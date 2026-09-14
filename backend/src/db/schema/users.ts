import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { userRole } from './enums.js';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: userRole('role').notNull().default('uzman'),
  passwordHash: text('password_hash').notNull(),
  /** Bumped to invalidate every issued access token of the user. */
  tokenVersion: integer('token_version').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceName: text('device_name').notNull(),
    /** sha256 of the current opaque refresh token (rotated on every refresh). */
    refreshTokenHash: text('refresh_token_hash'),
    refreshExpiresAt: timestamp('refresh_expires_at', { withTimezone: true }),
    lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('devices_user_idx').on(t.userId), index('devices_refresh_hash_idx').on(t.refreshTokenHash)],
);
