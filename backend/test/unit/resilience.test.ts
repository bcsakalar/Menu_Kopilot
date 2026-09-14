import { describe, expect, it } from 'vitest';
import { RequestBudget, estimateImageTokens } from '../../src/ai/budget.js';
import { CircuitBreaker } from '../../src/ai/circuit-breaker.js';
import {
  CooldownTracker,
  backoffDelayMs,
  parseGoogleRetryDelayMs,
  parseRateLimitHeaders,
} from '../../src/ai/rate-limit.js';
import { MODEL_CATALOG, MODELS } from '../../src/config/models.js';

describe('parseRateLimitHeaders', () => {
  it('reads Groq headers including Go-style durations', () => {
    const headers = new Headers({
      'retry-after': '2',
      'x-ratelimit-limit-requests': '14400',
      'x-ratelimit-remaining-requests': '14370',
      'x-ratelimit-reset-requests': '2m59.56s',
      'x-ratelimit-limit-tokens': '18000',
      'x-ratelimit-remaining-tokens': '17997',
      'x-ratelimit-reset-tokens': '7.66s',
    });
    expect(parseRateLimitHeaders((n) => headers.get(n))).toEqual({
      retryAfterMs: 2000,
      limitRequests: 14400,
      remainingRequests: 14370,
      resetRequestsMs: 179_560,
      limitTokens: 18000,
      remainingTokens: 17997,
      resetTokensMs: 7660,
    });
  });

  it('finds Gemini RetryInfo delays in error text', () => {
    const message = '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"34s"}]}}';
    expect(parseGoogleRetryDelayMs(message)).toBe(34_000);
    expect(parseGoogleRetryDelayMs('no hint')).toBeUndefined();
  });
});

describe('CooldownTracker', () => {
  it('cools down and expires with the clock, and throttles on exhausted token budgets', () => {
    let now = 1_000;
    const tracker = new CooldownTracker(() => now);
    tracker.cooldown('groq:m', 5_000);
    expect(tracker.isCooling('groq:m')).toBe(true);
    now += 5_001;
    expect(tracker.isCooling('groq:m')).toBe(false);

    tracker.observe('groq:m', { remainingTokens: 100, resetTokensMs: 3_000 }, 2_000);
    expect(tracker.remainingMs('groq:m')).toBe(3_000);
  });
});

describe('backoffDelayMs', () => {
  it('uses full jitter bounded by the exponential cap', () => {
    expect(backoffDelayMs(0, { random: () => 1 })).toBe(500);
    expect(backoffDelayMs(3, { random: () => 1 })).toBe(4000);
    expect(backoffDelayMs(10, { random: () => 1 })).toBe(8000);
    expect(backoffDelayMs(2, { random: () => 0 })).toBe(0);
  });
});

describe('CircuitBreaker', () => {
  it('opens after 3 consecutive failures for 60 s, then allows a single half-open trial', () => {
    let now = 0;
    const breaker = new CircuitBreaker({ now: () => now });
    breaker.recordFailure('gemini');
    breaker.recordFailure('gemini');
    expect(breaker.state('gemini')).toBe('closed');
    breaker.recordFailure('gemini');
    expect(breaker.state('gemini')).toBe('open');
    expect(breaker.canRequest('gemini')).toBe(false);

    now = 60_001;
    expect(breaker.state('gemini')).toBe('half_open');
    expect(breaker.canRequest('gemini')).toBe(true);
    expect(breaker.canRequest('gemini')).toBe(false); // only one trial in flight

    breaker.recordFailure('gemini');
    expect(breaker.state('gemini')).toBe('open');

    now = 125_000;
    expect(breaker.canRequest('gemini')).toBe(true);
    breaker.recordSuccess('gemini');
    expect(breaker.state('gemini')).toBe('closed');
  });

  it('a success resets the consecutive failure count', () => {
    const breaker = new CircuitBreaker();
    breaker.recordFailure('groq');
    breaker.recordFailure('groq');
    breaker.recordSuccess('groq');
    breaker.recordFailure('groq');
    expect(breaker.state('groq')).toBe('closed');
  });
});

describe('RequestBudget & token estimates', () => {
  it('stops at the call or token limit', () => {
    const budget = new RequestBudget(2, 1000);
    expect(budget.canAfford(400)).toBe(true);
    budget.charge(400, 10);
    expect(budget.canAfford(700)).toBe(false);
    budget.charge(100, 10);
    expect(budget.canAfford(1)).toBe(false);
  });

  it('estimates image tokens per provider rule', () => {
    const gemini = MODEL_CATALOG[MODELS.geminiFlash];
    const qwen = MODEL_CATALOG[MODELS.groqQwen38];
    expect(estimateImageTokens(gemini, { width: 1600, height: 1200 })).toBe(6 * 258);
    expect(estimateImageTokens(gemini, { width: 300, height: 200 })).toBe(258);
    expect(estimateImageTokens(qwen, { width: 1600, height: 1200 })).toBe(2048);
  });
});
