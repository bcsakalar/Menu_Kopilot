import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { suggestionRuns } from './suggestions.js';
import { users } from './users.js';

/** One restaurant call on the site: a chat whose analyses are ordinary `suggestion_runs`. */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default('Yeni görüşme'),
    /** The newest run: its product list is what a follow-up message works on. */
    lastRunId: uuid('last_run_id').references(() => suggestionRuns.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('conversations_user_updated_idx').on(t.userId, t.updatedAt), index('conversations_updated_idx').on(t.updatedAt)],
);

/** Images are never stored: a message only remembers how many it carried. */
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role').$type<'user' | 'assistant'>().notNull(),
    text: text('text').notNull().default(''),
    imageCount: integer('image_count').notNull().default(0),
    /** The analysis this answer shows; null for a plain answer. */
    runId: uuid('run_id').references(() => suggestionRuns.id, { onDelete: 'set null' }),
    quickReplies: jsonb('quick_replies').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('chat_messages_conversation_idx').on(t.conversationId, t.createdAt)],
);
