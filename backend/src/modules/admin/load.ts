import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';
import { and, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { CallPacer } from '../../ai/rate-limit.js';
import type { Database } from '../../db/client.js';
import { suggestionRuns, usageLog } from '../../db/schema/index.js';
import type { Slots } from '../../lib/slots.js';

/**
 * The site's load right now (D-214): what the admin panel shows and what the alerts watch. Analyses running and
 * waiting come from this process; durations and provider failures from the last quarter hour in the database, so
 * they hold across restarts and across processes.
 */

export const WINDOW_MS = 15 * 60_000;
export const CHECK_EVERY_MS = 60_000;
/** An analysis the rep waits longer than this for is a slow one; the alert fires when the slowest twentieth are. */
export const SLOW_P95_MS = 20_000;
export const MIN_RUNS = 5;
/** Provider failures — overloaded, rate-limited, timed out — above this share of calls. */
export const FAILING_SHARE = 0.3;
export const MIN_CALLS = 20;
/** The failures the provider is to blame for; a call we cut off ourselves (deadline, cancel) is not one. */
export const PROVIDER_FAILURES = ['unavailable', 'rate_limited', 'timeout'] as const;

export type AlertKey = 'slow' | 'failing' | 'busy';

export interface LoadSnapshot {
  analyses: { running: number; waiting: number; size: number; queueMax: number; waitP95Ms: number | null };
  lastQuarter: {
    runs: number;
    p50Ms: number | null;
    p95Ms: number | null;
    calls: number;
    failed: number;
    byProvider: { provider: string; calls: number; failed: number }[];
  };
  pacing: { model: string; inLastMinute: number; ceiling: number }[];
  process: { rssMb: number; heapMb: number; eventLoopP99Ms: number; uptimeS: number };
  alerts: { key: AlertKey; since: string }[];
}

export interface LoadMonitorDeps {
  db: Database;
  slots: Slots;
  pacer: CallPacer;
  ntfyUrl: string | undefined;
  log: FastifyBaseLogger;
  fetch?: typeof fetch;
  now?: () => number;
}

const percentile = (values: readonly number[], q: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
};

const seconds = (ms: number): string => (ms / 1000).toFixed(1).replace('.', ',');

export class LoadMonitor {
  private readonly loop: IntervalHistogram = monitorEventLoopDelay({ resolution: 20 });
  private readonly active = new Map<AlertKey, number>();
  private queuedLastCheck = false;
  private timer: NodeJS.Timeout | undefined;
  private readonly now: () => number;

  constructor(private readonly deps: LoadMonitorDeps) {
    this.now = deps.now ?? (() => Date.now());
  }

  /** Starts the event-loop meter, and the alert checks when there is somewhere to send them. */
  start(): void {
    this.loop.enable();
    if (!this.deps.ntfyUrl || this.timer) return;
    this.timer = setInterval(() => {
      this.check().catch((err: unknown) => this.deps.log.warn({ err }, 'load check failed'));
    }, CHECK_EVERY_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.loop.disable();
  }

  async snapshot(): Promise<LoadSnapshot> {
    const since = new Date(this.now() - WINDOW_MS);
    const runs = await this.deps.db
      .select({ latencyMs: suggestionRuns.latencyMs })
      .from(suggestionRuns)
      .where(and(gte(suggestionRuns.createdAt, since), isNotNull(suggestionRuns.latencyMs)));
    const latencies = runs.map((r) => r.latencyMs ?? 0);
    const byProvider = await this.deps.db
      .select({
        provider: usageLog.provider,
        calls: sql<number>`count(*)::int`,
        failed: sql<number>`(count(*) filter (where ${inArray(usageLog.errorCode, [...PROVIDER_FAILURES])}))::int`,
      })
      .from(usageLog)
      .where(gte(usageLog.createdAt, since))
      .groupBy(usageLog.provider)
      .orderBy(usageLog.provider);
    const slots = this.deps.slots.stats();
    const memory = process.memoryUsage();
    return {
      analyses: {
        running: slots.running,
        waiting: slots.waiting,
        size: slots.size,
        queueMax: this.deps.slots.maxWaiting,
        waitP95Ms: percentile(slots.waitsMs, 0.95),
      },
      lastQuarter: {
        runs: latencies.length,
        p50Ms: percentile(latencies, 0.5),
        p95Ms: percentile(latencies, 0.95),
        calls: byProvider.reduce((sum, row) => sum + row.calls, 0),
        failed: byProvider.reduce((sum, row) => sum + row.failed, 0),
        byProvider,
      },
      pacing: Object.entries(this.deps.pacer.snapshot()).map(([model, value]) => ({ model, ...value })),
      process: {
        rssMb: Math.round(memory.rss / 1_048_576),
        heapMb: Math.round(memory.heapUsed / 1_048_576),
        eventLoopP99Ms: this.loop.count > 0 ? Math.round(this.loop.percentile(99) / 1e6) : 0,
        uptimeS: Math.round(process.uptime()),
      },
      alerts: [...this.active].map(([key, at]) => ({ key, since: new Date(at).toISOString() })),
    };
  }

  /** One round of the alert checks: a notice when a problem starts and one when it is over, never one a minute. */
  async check(): Promise<void> {
    const load = await this.snapshot();
    const queued = load.analyses.waiting > 0;
    const state: Record<AlertKey, string | null> = {
      slow:
        load.lastQuarter.runs >= MIN_RUNS && (load.lastQuarter.p95Ms ?? 0) > SLOW_P95_MS
          ? `Analizler yavaşladı: son 15 dakikada en yavaş yüzde 5'i ${seconds(load.lastQuarter.p95Ms ?? 0)} sn sürdü (${load.lastQuarter.runs} analiz).`
          : null,
      failing:
        load.lastQuarter.calls >= MIN_CALLS && load.lastQuarter.failed / load.lastQuarter.calls > FAILING_SHARE
          ? `Yapay zekâ çağrılarının %${Math.round((load.lastQuarter.failed / load.lastQuarter.calls) * 100)}'i başarısız (son 15 dakika, ${load.lastQuarter.calls} çağrı). Öneriler daha çok havuzdan geliyor.`
          : null,
      // Two checks in a row: one burst that the queue absorbed in seconds is the queue doing its job.
      busy: queued && this.queuedLastCheck ? `Analiz kuyruğu dolu: ${load.analyses.running} analiz çalışıyor, ${load.analyses.waiting} analiz sırada.` : null,
    };
    this.queuedLastCheck = queued;
    for (const key of Object.keys(state) as AlertKey[]) {
      const message = state[key];
      if (message && !this.active.has(key)) {
        this.active.set(key, this.now());
        await this.notify(message, 'high');
      } else if (!message && this.active.has(key)) {
        this.active.delete(key);
        await this.notify(RECOVERED[key], 'default');
      }
    }
    this.loop.reset();
  }

  private async notify(message: string, priority: 'high' | 'default'): Promise<void> {
    if (!this.deps.ntfyUrl) return;
    try {
      const response = await (this.deps.fetch ?? fetch)(this.deps.ntfyUrl, {
        method: 'POST',
        body: message,
        // Header values must be ASCII: the Turkish text goes in the body.
        headers: { Title: 'Menu Kopilot', Priority: priority, Tags: priority === 'high' ? 'warning' : 'white_check_mark' },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) this.deps.log.warn({ status: response.status }, 'load alert not delivered');
    } catch (err) {
      this.deps.log.warn({ err }, 'load alert not delivered');
    }
  }
}

const RECOVERED: Record<AlertKey, string> = {
  slow: 'Düzeldi: analizler yine normal sürede bitiyor.',
  failing: 'Düzeldi: yapay zekâ çağrıları yine yanıt veriyor.',
  busy: 'Düzeldi: analiz kuyruğu boşaldı.',
};
