import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { conversations } from './chat.js';
import { users } from './users.js';

export const FEEDBACK_KINDS = ['oneri', 'hata', 'diger'] as const;
export const FEEDBACK_STATUSES = ['new', 'seen', 'done'] as const;

/** What a rep tells the team from the site; the panel reads it and marks it done (D-206). */
export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** The call the rep was on, when they chose to attach it. */
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
    kind: text('kind', { enum: FEEDBACK_KINDS }).notNull(),
    message: text('message').notNull(),
    /** Visitors have no account: a name is how the team knows who wrote. */
    authorName: text('author_name').notNull().default(''),
    status: text('status', { enum: FEEDBACK_STATUSES }).notNull().default('new'),
    adminNote: text('admin_note').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('feedback_status_created_idx').on(t.status, t.createdAt),
    check('feedback_kind_chk', sql`${t.kind} IN ('oneri', 'hata', 'diger')`),
    check('feedback_status_chk', sql`${t.status} IN ('new', 'seen', 'done')`),
  ],
);
