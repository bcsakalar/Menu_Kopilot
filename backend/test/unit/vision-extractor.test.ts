import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { PromptRepository } from '../../src/ai/prompt-repository.js';
import type { AiRouter, CallContext, RoutedResult, RouterRequest } from '../../src/ai/router.js';
import { MemoryCache } from '../../src/cache/cache.js';
import { VisionExtractor } from '../../src/modules/extraction/vision-extractor.js';

/**
 * The hedged photo read (D-195): a first provider that has not answered after the hedge delay gets company on the
 * next provider; the first good answer wins.
 */

type Items = { items: unknown[] };
type Call = { offset: number; signal: AbortSignal | undefined };

const itemSchema = z.object({ name: z.string() });
const spec = {
  task: 'agent.extract' as const,
  systemKey: 'agent.extract.system' as const,
  userKey: 'agent.extract.user' as const,
  schema: z.object({ items: z.array(itemSchema) }),
  itemSchema,
  schemaName: 'menu',
  cacheNamespace: 'test',
  vars: {},
};

const prompts = {
  versionTag: async () => 'v1',
  render: async () => ({ text: 'prompt' }),
} as unknown as PromptRepository;

const ok = (provider: 'gemini' | 'groq', names: string[]): RoutedResult<Items> => ({
  ok: true,
  value: { items: names.map((name) => ({ name })) },
  raw: '',
  meta: { provider, model: `${provider}-model`, latencyMs: 1, tokensIn: 1, tokensOut: 1 },
  route: { id: undefined, provider, model: `${provider}-model`, params: {}, priority: 0, enabled: true },
  attempts: [{ provider, model: `${provider}-model`, outcome: 'ok' }],
});
const failed = (kind: 'invalid_output' | 'aborted'): RoutedResult<Items> => ({
  ok: false,
  error: { kind, message: kind, retryable: false } as never,
  attempts: [{ provider: 'groq', model: 'groq-model', outcome: kind }],
});

/** A result that arrives after `ms`, or as "aborted" as soon as the call is cancelled. */
function later(ms: number, result: RoutedResult<Items>, signal: AbortSignal | undefined): Promise<RoutedResult<Items>> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(result), ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve(failed('aborted'));
    });
  });
}

function extractorWith(answer: (call: Call) => Promise<RoutedResult<Items>>) {
  const calls: Call[] = [];
  const router = {
    generate: (request: RouterRequest<Items>, ctx: CallContext) => {
      const call = { offset: request.routeOffset ?? 0, signal: ctx.signal };
      calls.push(call);
      return answer(call);
    },
  } as unknown as AiRouter;
  const extractor = new VisionExtractor(router, prompts, new MemoryCache(), 60, 30);
  const image = { mimeType: 'image/jpeg', data: new Uint8Array([1]), sha256: `img-${Math.random()}` };
  return { calls, read: () => extractor.extract(image as never, spec, {}) };
}

describe('hedged photo read (D-195)', () => {
  it('a first provider that answers in time is the only call', async () => {
    const { calls, read } = extractorWith((call) => later(5, ok('gemini', ['Adana Kebap']), call.signal));
    const result = await read();
    expect(result.ok && result.items).toEqual([{ name: 'Adana Kebap' }]);
    expect(calls.map((c) => c.offset)).toEqual([0]);
  });

  it('a hung first provider is raced by the next one, which wins, and the first call is cancelled', async () => {
    const { calls, read } = extractorWith((call) =>
      call.offset === 0 ? later(10_000, ok('gemini', ['late']), call.signal) : later(5, ok('groq', ['Adana Kebap', 'Ayran']), call.signal),
    );
    const started = Date.now();
    const result = await read();
    expect(result.ok && result.items).toEqual([{ name: 'Adana Kebap' }, { name: 'Ayran' }]);
    expect(result.ok && result.provider).toBe('groq');
    expect(calls.map((c) => c.offset)).toEqual([0, 1]);
    expect(calls[0]?.signal?.aborted).toBe(true);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('a hedge cut short (invalid output) does not end the read: the first provider still answers', async () => {
    const { calls, read } = extractorWith((call) =>
      call.offset === 0 ? later(80, ok('gemini', ['Uzun Menü']), call.signal) : later(5, failed('invalid_output'), call.signal),
    );
    const result = await read();
    expect(result.ok && result.items).toEqual([{ name: 'Uzun Menü' }]);
    expect(result.ok && result.provider).toBe('gemini');
    expect(calls).toHaveLength(2);
  });
});
