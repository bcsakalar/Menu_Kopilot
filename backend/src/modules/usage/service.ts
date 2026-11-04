import { and, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import type { QuotaService } from '../../ai/usage.js';
import { startOfDay, startOfMonth } from '../../ai/usage.js';
import { MODEL_CATALOG } from '../../config/models.js';
import type { Database } from '../../db/client.js';
import { suggestionItems, suggestionRuns, usageLog } from '../../db/schema/index.js';
import { taskLabel } from '../../i18n/tr.js';
import type { UsageSummary } from './schemas.js';

const ratio = (part: number, total: number) => (total === 0 ? 0 : Math.round((part / total) * 1000) / 1000);

/** Admin panel: provider calls (per model / task / error), cache and DB hit ratios across every visitor. */
export class UsageService {
  constructor(
    private readonly db: Database,
    private readonly quota: QuotaService,
    private readonly config: { timezone: string },
    private readonly now: () => Date = () => new Date(),
  ) {}

  async summary(userId: string, range: UsageSummary['range']): Promise<UsageSummary> {
    const now = this.now();
    const from = range === 'today' ? startOfDay(now, this.config.timezone) : startOfMonth(now, this.config.timezone);
    const inRange = gte(usageLog.createdAt, from);
    const counters = {
      calls: sql<number>`count(*)::int`,
      failed: sql<number>`(count(*) filter (where not ${usageLog.success}))::int`,
      tokensIn: sql<number>`coalesce(sum(${usageLog.tokensIn}), 0)::int`,
      tokensOut: sql<number>`coalesce(sum(${usageLog.tokensOut}), 0)::int`,
      avgLatencyMs: sql<number>`coalesce(round(avg(${usageLog.latencyMs})), 0)::int`,
    };

    const [totals] = await this.db.select(counters).from(usageLog).where(inRange);
    const byModel = await this.db
      .select({ provider: usageLog.provider, model: usageLog.model, ...counters })
      .from(usageLog)
      .where(inRange)
      .groupBy(usageLog.provider, usageLog.model)
      .orderBy(desc(sql`count(*)`));
    const byTask = await this.db
      .select({ taskKey: usageLog.taskKey, calls: counters.calls, failed: counters.failed })
      .from(usageLog)
      .where(inRange)
      .groupBy(usageLog.taskKey)
      .orderBy(desc(sql`count(*)`));
    const errors = await this.db
      .select({ code: usageLog.errorCode, count: sql<number>`count(*)::int` })
      .from(usageLog)
      .where(and(inRange, eq(usageLog.success, false), isNotNull(usageLog.errorCode)))
      .groupBy(usageLog.errorCode)
      .orderBy(desc(sql`count(*)`));

    const [runs] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        suggest: sql<number>`(count(*) filter (where ${suggestionRuns.mode} = 'suggest'))::int`,
        gap: sql<number>`(count(*) filter (where ${suggestionRuns.mode} = 'gap'))::int`,
        cacheHit: sql<number>`(count(*) filter (where ${suggestionRuns.cacheHit}))::int`,
      })
      .from(suggestionRuns)
      .where(gte(suggestionRuns.createdAt, from));
    const [cards] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        fromDb: sql<number>`(count(*) filter (where ${suggestionItems.source} in ('seed', 'db')))::int`,
        ai: sql<number>`(count(*) filter (where ${suggestionItems.source} = 'ai'))::int`,
        review: sql<number>`(count(*) filter (where ${suggestionItems.source} = 'review'))::int`,
      })
      .from(suggestionItems)
      .innerJoin(suggestionRuns, eq(suggestionItems.runId, suggestionRuns.id))
      .where(gte(suggestionItems.createdAt, from));

    const quota = await this.quota.status(userId);
    const runTotals = runs ?? { total: 0, suggest: 0, gap: 0, cacheHit: 0 };
    const cardTotals = cards ?? { total: 0, fromDb: 0, ai: 0, review: 0 };
    return {
      range,
      from: from.toISOString(),
      timezone: this.config.timezone,
      totals: totals ?? { calls: 0, failed: 0, tokensIn: 0, tokensOut: 0, avgLatencyMs: 0 },
      byModel: byModel.map((m) => ({ ...m, label: MODEL_CATALOG[m.model]?.label ?? m.model })),
      byTask: byTask.map((t) => ({ ...t, label: taskLabel(t.taskKey) })),
      errors: errors.map((e) => ({ code: e.code ?? 'unknown', count: e.count })),
      runs: { ...runTotals, cacheHitRatio: ratio(runTotals.cacheHit, runTotals.total) },
      cards: { ...cardTotals, dbHitRatio: ratio(cardTotals.fromDb, cardTotals.total) },
      quota: {
        allowed: quota.allowed,
        callsToday: quota.callsToday,
        tokensToday: quota.tokensToday,
        dailyCalls: quota.dailyCalls,
        dailyTokens: quota.dailyTokens,
      },
    };
  }
}
