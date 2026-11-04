import { desc, eq, gte, lt, sql } from 'drizzle-orm';
import { startOfDay, startOfMonth, type QuotaService } from '../../ai/usage.js';
import type { Database } from '../../db/client.js';
import { chatMessages, conversations, cuisines, menuItems, suggestionItems, suggestionRuns, usageLog, users } from '../../db/schema/index.js';
import { notFound } from '../../lib/errors.js';
import type { ChatService } from '../chat/service.js';

const TOP_CUISINES = 8;

/** The panel's view across every visitor: chat and analyses themselves stay scoped to their owner. */
export class AdminService {
  constructor(
    private readonly db: Database,
    private readonly chat: ChatService,
    private readonly quota: QuotaService,
    private readonly config: { timezone: string },
    private readonly now: () => Date = () => new Date(),
  ) {}

  async overview(range: 'today' | 'month') {
    const now = this.now();
    const from = range === 'today' ? startOfDay(now, this.config.timezone) : startOfMonth(now, this.config.timezone);
    const count = sql<number>`count(*)::int`;

    const [conversationRow] = await this.db
      .select({ conversations: count, visitors: sql<number>`count(distinct ${conversations.userId})::int` })
      .from(conversations)
      .where(gte(conversations.createdAt, from));
    const [runRow] = await this.db.select({ runs: count }).from(suggestionRuns).where(gte(suggestionRuns.createdAt, from));
    const [cardRow] = await this.db
      .select({
        total: count,
        accepted: sql<number>`(count(*) filter (where ${suggestionItems.answer} = 'yes'))::int`,
        rejected: sql<number>`(count(*) filter (where ${suggestionItems.answer} = 'no'))::int`,
        later: sql<number>`(count(*) filter (where ${suggestionItems.answer} = 'later'))::int`,
      })
      .from(suggestionItems)
      .where(gte(suggestionItems.createdAt, from));
    const [llmRow] = await this.db
      .select({
        calls: count,
        failed: sql<number>`(count(*) filter (where not ${usageLog.success}))::int`,
        tokens: sql<number>`coalesce(sum(${usageLog.tokensIn} + ${usageLog.tokensOut}), 0)::int`,
      })
      .from(usageLog)
      .where(gte(usageLog.createdAt, from));
    const [draftRow] = await this.db.select({ drafts: count }).from(menuItems).where(sql`${menuItems.approved} = false and ${menuItems.needsReview}`);
    const topCuisines = await this.db
      .select({ name: cuisines.name, runs: count })
      .from(suggestionRuns)
      .innerJoin(cuisines, eq(cuisines.id, suggestionRuns.cuisineId))
      .where(gte(suggestionRuns.createdAt, from))
      .groupBy(cuisines.name)
      .orderBy(desc(count))
      .limit(TOP_CUISINES);
    const site = await this.quota.site();

    return {
      range,
      visitors: conversationRow?.visitors ?? 0,
      conversations: conversationRow?.conversations ?? 0,
      runs: runRow?.runs ?? 0,
      cards: cardRow ?? { total: 0, accepted: 0, rejected: 0, later: 0 },
      llm: llmRow ?? { calls: 0, failed: 0, tokens: 0 },
      drafts: draftRow?.drafts ?? 0,
      topCuisines,
      site,
    };
  }

  async conversations(limit: number, before: string | undefined) {
    const rows = await this.db
      .select({
        id: conversations.id,
        title: conversations.title,
        updatedAt: conversations.updatedAt,
        createdAt: conversations.createdAt,
        visitorEmail: users.email,
        messages: sql<number>`(select count(*)::int from ${chatMessages} where ${chatMessages.conversationId} = ${conversations.id})`,
      })
      .from(conversations)
      .innerJoin(users, eq(users.id, conversations.userId))
      .where(before ? lt(conversations.updatedAt, new Date(before)) : undefined)
      .orderBy(desc(conversations.updatedAt))
      .limit(limit);
    return {
      data: rows.map((r) => ({
        id: r.id,
        title: r.title,
        messages: r.messages,
        // The panel needs to tell visitors apart, not to know them: visitor rows have no real e-mail.
        visitor: r.visitorEmail.slice(0, 8),
        updatedAt: r.updatedAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
      nextBefore: rows.length === limit ? (rows.at(-1)?.updatedAt.toISOString() ?? null) : null,
    };
  }

  async conversation(id: string) {
    const [row] = await this.db.select({ userId: conversations.userId }).from(conversations).where(eq(conversations.id, id));
    if (!row) throw notFound('Görüşme');
    return this.chat.detail(row.userId, id);
  }
}
