import { gte, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { usageLog } from '../db/schema/index.js';

export interface UsageEntry {
  userId?: string | undefined;
  runId?: string | undefined;
  taskKey: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  success: boolean;
  errorCode?: string | undefined;
}

export interface UsageSink {
  log(entry: UsageEntry): Promise<void>;
}

/** Writes one usage_log row per provider call attempt. Logging failures never break a request. */
export class UsageLogger implements UsageSink {
  constructor(
    private readonly db: Database,
    private readonly onError: (err: unknown) => void = () => undefined,
  ) {}

  async log(entry: UsageEntry): Promise<void> {
    try {
      await this.db.insert(usageLog).values({
        userId: entry.userId ?? null,
        runId: entry.runId ?? null,
        taskKey: entry.taskKey,
        provider: entry.provider,
        model: entry.model,
        tokensIn: Math.round(entry.tokensIn),
        tokensOut: Math.round(entry.tokensOut),
        latencyMs: Math.round(entry.latencyMs),
        success: entry.success,
        errorCode: entry.errorCode ?? null,
      });
    } catch (err) {
      this.onError(err);
    }
  }
}

/** UTC instant of today's midnight in `timeZone`. */
export function startOfDay(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const localAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  const offsetMs = localAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')) - offsetMs);
}

export function startOfMonth(now: Date, timeZone: string): Date {
  const day = startOfDay(now, timeZone);
  const dayOfMonth = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone, day: '2-digit' }).formatToParts(now).find((p) => p.type === 'day')?.value ?? '1',
  );
  return new Date(day.getTime() - (dayOfMonth - 1) * 86_400_000);
}

export interface QuotaStatus {
  allowed: boolean;
  callsToday: number;
  tokensToday: number;
  dailyCalls: number;
  dailyTokens: number;
}

/** Daily quota per visitor and for the whole site (config). When exceeded the pipelines answer from DB/cache only. */
export class QuotaService {
  constructor(
    private readonly db: Database,
    private readonly config: { dailyCalls: number; dailyTokens: number; globalDailyCalls?: number; timezone: string },
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Today's calls of the whole site against its ceiling, for the admin panel. */
  async site(): Promise<{ callsToday: number; dailyCalls: number }> {
    const since = startOfDay(this.now(), this.config.timezone);
    const [row] = await this.db.select({ calls: sql<number>`count(*)::int` }).from(usageLog).where(gte(usageLog.createdAt, since));
    return { callsToday: row?.calls ?? 0, dailyCalls: this.config.globalDailyCalls ?? 0 };
  }

  async status(userId: string | undefined): Promise<QuotaStatus> {
    const since = startOfDay(this.now(), this.config.timezone);
    const mine = userId ? sql`${usageLog.userId} = ${userId}` : sql`${usageLog.userId} is null`;
    const [row] = await this.db
      .select({
        calls: sql<number>`(count(*) filter (where ${mine}))::int`,
        tokens: sql<number>`coalesce(sum(${usageLog.tokensIn} + ${usageLog.tokensOut}) filter (where ${mine}), 0)::int`,
        siteCalls: sql<number>`count(*)::int`,
      })
      .from(usageLog)
      .where(gte(usageLog.createdAt, since));
    const callsToday = row?.calls ?? 0;
    const tokensToday = row?.tokens ?? 0;
    const siteOpen = (row?.siteCalls ?? 0) < (this.config.globalDailyCalls ?? Number.POSITIVE_INFINITY);
    return {
      allowed: siteOpen && callsToday < this.config.dailyCalls && tokensToday < this.config.dailyTokens,
      callsToday,
      tokensToday,
      dailyCalls: this.config.dailyCalls,
      dailyTokens: this.config.dailyTokens,
    };
  }
}
