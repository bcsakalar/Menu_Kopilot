import { parseDurationMs } from '../lib/duration.js';

/**
 * Header/error driven rate limiting. Free-tier limits are not hard-coded anywhere: we read what the
 * provider tells us (Groq x-ratelimit-* / retry-after, Gemini RetryInfo.retryDelay) and back off.
 */

export interface RateLimitSnapshot {
  limitRequests?: number;
  remainingRequests?: number;
  resetRequestsMs?: number;
  limitTokens?: number;
  remainingTokens?: number;
  resetTokensMs?: number;
  retryAfterMs?: number;
}

type HeaderGetter = (name: string) => string | null | undefined;

const toInt = (value: string | null | undefined): number | undefined => {
  if (value === null || value === undefined || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

export function parseRateLimitHeaders(get: HeaderGetter): RateLimitSnapshot {
  const snapshot: RateLimitSnapshot = {};
  const assign = <K extends keyof RateLimitSnapshot>(key: K, value: number | undefined) => {
    if (value !== undefined) snapshot[key] = value;
  };
  assign('limitRequests', toInt(get('x-ratelimit-limit-requests')));
  assign('remainingRequests', toInt(get('x-ratelimit-remaining-requests')));
  assign('resetRequestsMs', parseDurationMs(get('x-ratelimit-reset-requests')));
  assign('limitTokens', toInt(get('x-ratelimit-limit-tokens')));
  assign('remainingTokens', toInt(get('x-ratelimit-remaining-tokens')));
  assign('resetTokensMs', parseDurationMs(get('x-ratelimit-reset-tokens')));
  assign('retryAfterMs', parseDurationMs(get('retry-after')));
  return snapshot;
}

export function headerGetterFrom(headers: unknown): HeaderGetter {
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return (name) => headers.get(name);
  }
  if (typeof headers === 'object' && headers !== null) {
    const lower = new Map<string, string>();
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string') lower.set(key.toLowerCase(), value);
    }
    return (name) => lower.get(name.toLowerCase());
  }
  return () => undefined;
}

/** Finds `"retryDelay": "34s"` (google.rpc.RetryInfo) anywhere in an error message/body. */
export function parseGoogleRetryDelayMs(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const match = /"?retryDelay"?\s*[:=]\s*"?(\d+(?:\.\d+)?s)"?/i.exec(text);
  return match?.[1] ? parseDurationMs(match[1]) : undefined;
}

/** Per provider:model cooldowns derived from 429s and exhausted token budgets. */
export class CooldownTracker {
  private readonly until = new Map<string, number>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  cooldown(key: string, ms: number): void {
    const until = this.now() + Math.max(0, ms);
    this.until.set(key, Math.max(this.until.get(key) ?? 0, until));
  }

  remainingMs(key: string): number {
    const until = this.until.get(key);
    if (until === undefined) return 0;
    const left = until - this.now();
    if (left <= 0) {
      this.until.delete(key);
      return 0;
    }
    return left;
  }

  isCooling(key: string): boolean {
    return this.remainingMs(key) > 0;
  }

  reset(): void {
    this.until.clear();
  }

  /** Proactive throttle: if the provider says we are out of tokens/requests, wait for its reset. */
  observe(key: string, snapshot: RateLimitSnapshot | undefined, nextRequestTokens = 0): void {
    if (!snapshot) return;
    if (snapshot.remainingRequests !== undefined && snapshot.remainingRequests <= 0 && snapshot.resetRequestsMs) {
      this.cooldown(key, snapshot.resetRequestsMs);
    }
    if (
      snapshot.remainingTokens !== undefined &&
      snapshot.resetTokensMs !== undefined &&
      snapshot.remainingTokens < Math.max(1, nextRequestTokens)
    ) {
      this.cooldown(key, snapshot.resetTokensMs);
    }
  }
}

/**
 * Calls per provider:model in the trailing minute, paced by what each model has shown it takes (D-214). No limit is
 * configured anywhere: free and paid tiers differ by the hundreds and change without notice. A 429 says "this many
 * in a minute was one too many", so that count, less one, becomes the model's ceiling; every quiet minute raises it
 * by one, so a model that was only briefly busy is soon used at full speed again. A route at its ceiling is skipped
 * and the chain moves on, instead of spending a call on a 429 we could have predicted.
 */
export class CallPacer {
  private readonly calls = new Map<string, number[]>();
  private readonly ceilings = new Map<string, { limit: number; at: number }>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  record(key: string): void {
    const list = this.recent(key);
    list.push(this.now());
    this.calls.set(key, list);
  }

  limited(key: string): void {
    this.ceilings.set(key, { limit: Math.max(1, this.recent(key).length - 1), at: this.now() });
  }

  isFull(key: string): boolean {
    const limit = this.ceiling(key);
    return limit !== undefined && this.recent(key).length >= limit;
  }

  /** The learned ceiling per model, for the admin's load view; models that never hit a 429 are not listed. */
  snapshot(): Record<string, { inLastMinute: number; ceiling: number }> {
    const out: Record<string, { inLastMinute: number; ceiling: number }> = {};
    for (const key of this.ceilings.keys()) {
      const ceiling = this.ceiling(key);
      if (ceiling !== undefined) out[key] = { inLastMinute: this.recent(key).length, ceiling };
    }
    return out;
  }

  private ceiling(key: string): number | undefined {
    const entry = this.ceilings.get(key);
    if (!entry) return undefined;
    const grown = entry.limit + Math.floor((this.now() - entry.at) / 60_000);
    // Grown back past anything it was ever asked for: forget it.
    if (grown > entry.limit + 60) {
      this.ceilings.delete(key);
      return undefined;
    }
    return grown;
  }

  private recent(key: string): number[] {
    const cutoff = this.now() - 60_000;
    const list = (this.calls.get(key) ?? []).filter((at) => at > cutoff);
    this.calls.set(key, list);
    return list;
  }
}

/** Exponential backoff with full jitter. */
export function backoffDelayMs(
  attempt: number,
  options: { baseMs?: number; maxMs?: number; random?: () => number } = {},
): number {
  const base = options.baseMs ?? 500;
  const max = options.maxMs ?? 8000;
  const random = options.random ?? Math.random;
  return Math.round(random() * Math.min(max, base * 2 ** attempt));
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new Error('aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
