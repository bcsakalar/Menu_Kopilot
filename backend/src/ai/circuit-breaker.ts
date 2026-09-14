/**
 * Per-provider circuit breaker: `failureThreshold` consecutive failures open the circuit for `openMs`
 * (default 3 failures → 60 s). After that one trial request is let through (half-open); success closes
 * the circuit, failure re-opens it.
 */

export type CircuitState = 'closed' | 'open' | 'half_open';

interface Entry {
  failures: number;
  openUntil: number;
  trialInFlight: boolean;
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  openMs?: number;
  now?: () => number;
}

export class CircuitBreaker {
  private readonly entries = new Map<string, Entry>();
  private readonly failureThreshold: number;
  private readonly openMs: number;
  private readonly now: () => number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.openMs = options.openMs ?? 60_000;
    this.now = options.now ?? (() => Date.now());
  }

  private entry(key: string): Entry {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { failures: 0, openUntil: 0, trialInFlight: false };
      this.entries.set(key, entry);
    }
    return entry;
  }

  state(key: string): CircuitState {
    const entry = this.entries.get(key);
    if (!entry || entry.openUntil === 0) return 'closed';
    return this.now() < entry.openUntil ? 'open' : 'half_open';
  }

  /** Whether a request may be sent now. In half-open state only one trial is allowed at a time. */
  canRequest(key: string): boolean {
    const state = this.state(key);
    if (state === 'closed') return true;
    if (state === 'open') return false;
    const entry = this.entry(key);
    if (entry.trialInFlight) return false;
    entry.trialInFlight = true;
    return true;
  }

  recordSuccess(key: string): void {
    this.entries.set(key, { failures: 0, openUntil: 0, trialInFlight: false });
  }

  recordFailure(key: string): void {
    const entry = this.entry(key);
    const wasHalfOpen = this.state(key) === 'half_open';
    entry.failures += 1;
    entry.trialInFlight = false;
    if (wasHalfOpen || entry.failures >= this.failureThreshold) {
      entry.openUntil = this.now() + this.openMs;
    }
  }

  /** Force-open (e.g. invalid API key) for a custom duration. */
  trip(key: string, ms: number = this.openMs): void {
    const entry = this.entry(key);
    entry.failures = Math.max(entry.failures, this.failureThreshold);
    entry.trialInFlight = false;
    entry.openUntil = this.now() + ms;
  }

  /** Releases a half-open trial slot without recording an outcome (caller-side errors). */
  release(key: string): void {
    const entry = this.entries.get(key);
    if (entry) entry.trialInFlight = false;
  }

  reset(): void {
    this.entries.clear();
  }
}
