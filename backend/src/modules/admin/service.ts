import { type AnyColumn, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { MIN_BRANCH_ITEMS } from '../../agents/gap-analyst.js';
import { startOfDay, startOfMonth, type QuotaService } from '../../ai/usage.js';
import type { Database } from '../../db/client.js';
import {
  chatMessages,
  conversations,
  cuisines,
  feedback,
  menuItems,
  suggestionItems,
  suggestionRuns,
  usageLog,
  users,
} from '../../db/schema/index.js';
import { notFound } from '../../lib/errors.js';
import type { ChatService } from '../chat/service.js';

const TOP_CUISINES = 8;
const DAILY_DAYS = 14;
const THIN_CUISINES = 6;
const DAY_MS = 86_400_000;

/** The panel's view across every visitor: chat and analyses themselves stay scoped to their owner. */
export class AdminService {
  constructor(
    private readonly db: Database,
    private readonly chat: ChatService,
    private readonly quota: QuotaService,
    private readonly config: { timezone: string },
    private readonly now: () => Date = () => new Date(),
  ) {}

  async overview(range: 'today' | 'week' | 'month') {
    const now = this.now();
    const today = startOfDay(now, this.config.timezone);
    const from =
      range === 'today' ? today : range === 'week' ? new Date(today.getTime() - 6 * DAY_MS) : startOfMonth(now, this.config.timezone);
    const count = sql<number>`count(*)::int`;

    const [conversationRow] = await this.db
      .select({ conversations: count, visitors: sql<number>`count(distinct ${conversations.userId})::int` })
      .from(conversations)
      .where(gte(conversations.createdAt, from));
    const [runRow] = await this.db.select({ runs: count }).from(suggestionRuns).where(gte(suggestionRuns.createdAt, from));
    const [cardRow] = await this.db.select({ cards: count }).from(suggestionItems).where(gte(suggestionItems.createdAt, from));
    const [llmRow] = await this.db
      .select({
        calls: count,
        failed: sql<number>`(count(*) filter (where not ${usageLog.success}))::int`,
        tokens: sql<number>`coalesce(sum(${usageLog.tokensIn} + ${usageLog.tokensOut}), 0)::int`,
      })
      .from(usageLog)
      .where(gte(usageLog.createdAt, from));
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
      cards: cardRow?.cards ?? 0,
      llm: llmRow ?? { calls: 0, failed: 0, tokens: 0 },
      topCuisines,
      site,
      daily: await this.daily(now),
      quality: await this.qualityShare(from),
      pool: await this.pool(),
      feedback: await this.feedbackCounts(),
    };
  }

  /** Analyses and new conversations per day, the last DAILY_DAYS days in the site's timezone (empty days included). */
  private async daily(now: Date) {
    const tz = this.config.timezone;
    const since = new Date(startOfDay(now, tz).getTime() - (DAILY_DAYS - 1) * DAY_MS);
    const day = (column: AnyColumn) => sql<string>`to_char(${column} at time zone ${tz}, 'YYYY-MM-DD')`;
    const runs = await this.db
      .select({ day: day(suggestionRuns.createdAt), n: sql<number>`count(*)::int` })
      .from(suggestionRuns)
      .where(gte(suggestionRuns.createdAt, since))
      .groupBy(sql`1`);
    const calls = await this.db
      .select({ day: day(conversations.createdAt), n: sql<number>`count(*)::int` })
      .from(conversations)
      .where(gte(conversations.createdAt, since))
      .groupBy(sql`1`);
    const runsBy = new Map(runs.map((r) => [r.day, r.n]));
    const callsBy = new Map(calls.map((r) => [r.day, r.n]));
    const format = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    return Array.from({ length: DAILY_DAYS }, (_, i) => {
      // Noon of each day keeps DST shifts from landing on the wrong date.
      const date = format.format(new Date(since.getTime() + i * DAY_MS + 12 * 3_600_000));
      return { date, runs: runsBy.get(date) ?? 0, conversations: callsBy.get(date) ?? 0 };
    });
  }

  /** How many analyses in the range missed each opening rule (D-206); runs stored before the checklist do not count. */
  private async qualityShare(from: Date) {
    const missed = (path: string) =>
      sql<number>`(count(*) filter (where ${suggestionRuns.counts} #>> ${`{quality,${path},ok}`} = 'false'))::int`;
    const [row] = await this.db
      .select({
        runs: sql<number>`(count(*) filter (where ${suggestionRuns.counts} ? 'quality'))::int`,
        products: missed('products'),
        drinks: missed('drinks'),
        descriptions: missed('descriptions'),
        images: missed('images'),
        writing: missed('writing'),
      })
      .from(suggestionRuns)
      .where(gte(suggestionRuns.createdAt, from));
    return row ?? { runs: 0, products: 0, drinks: 0, descriptions: 0, images: 0, writing: 0 };
  }

  /** The template pool, and the cuisines whose own templates fall furthest short of their opening target. */
  private async pool() {
    const rows = await this.db
      .select({
        name: cuisines.name,
        minItemCount: cuisines.minItemCount,
        templates: sql<number>`(select count(*)::int from ${menuItems} where ${menuItems.cuisineId} = ${cuisines.id} and ${menuItems.approved})`,
      })
      .from(cuisines);
    const [totals] = await this.db
      .select({
        templates: sql<number>`(count(*) filter (where ${menuItems.approved}))::int`,
        imported: sql<number>`(count(*) filter (where ${menuItems.approved} and ${menuItems.source} = 'imported'))::int`,
      })
      .from(menuItems);
    const thin = rows
      .map((r) => ({ name: r.name, templates: r.templates, target: Math.max(MIN_BRANCH_ITEMS, r.minItemCount) }))
      .filter((r) => r.templates < r.target)
      .sort((a, b) => b.target - b.templates - (a.target - a.templates))
      .slice(0, THIN_CUISINES);
    return { templates: totals?.templates ?? 0, imported: totals?.imported ?? 0, cuisines: rows.length, thin };
  }

  private async feedbackCounts() {
    const rows = await this.db.select({ status: feedback.status, n: sql<number>`count(*)::int` }).from(feedback).groupBy(feedback.status);
    return { new: rows.find((r) => r.status === 'new')?.n ?? 0, open: rows.filter((r) => r.status !== 'done').reduce((s, r) => s + r.n, 0) };
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
