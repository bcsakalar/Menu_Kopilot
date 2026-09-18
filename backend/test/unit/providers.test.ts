import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { providerFailure } from '../../src/ai/errors.js';
import { GeminiProvider, type GeminiTransport, type InteractionResponse } from '../../src/ai/providers/gemini.provider.js';
import { GroqProvider } from '../../src/ai/providers/groq.provider.js';
import type { ImageInput } from '../../src/ai/types.js';
import { MODELS } from '../../src/config/models.js';

const schema = z.object({ items: z.array(z.object({ rawName: z.string(), confidence: z.number() })) });
const image: ImageInput = { data: Buffer.from('fake-jpeg'), mimeType: 'image/jpeg', sha256: 'abc', width: 1600, height: 1200 };

interface Captured {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

function mockFetch(reply: (captured: Captured) => Response | Promise<Response>, captured: Captured[] = []): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const entry: Captured = {
      url: input instanceof Request ? input.url : input.toString(),
      body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<string, unknown>,
      headers: init?.headers as Record<string, string>,
    };
    captured.push(entry);
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    return reply(entry);
  });
}

const completion = (content: string, finish = 'stop') =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content }, finish_reason: finish }],
      usage: { prompt_tokens: 321, completion_tokens: 45 },
    }),
    { status: 200, headers: { 'x-ratelimit-remaining-tokens': '5000', 'x-ratelimit-reset-tokens': '6s' } },
  );

describe('GroqProvider', () => {
  const ok = JSON.stringify({ items: [{ rawName: 'Adana', confidence: 0.9 }] });

  it('sends strict json_schema for gpt-oss and hides reasoning', async () => {
    const captured: Captured[] = [];
    const provider = new GroqProvider({ apiKey: 'gsk_test', fetch: mockFetch(() => completion(ok), captured) });
    const result = await provider.generateStructured({
      task: 'text.item_enrich',
      schema,
      system: 'sys',
      user: 'usr',
      model: MODELS.groqGptOss120b,
      params: { reasoningEffort: 'low', maxOutputTokens: 1000 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items[0]?.rawName).toBe('Adana');
      expect(result.meta.tokensIn).toBe(321);
      expect(result.meta.rateLimit?.remainingTokens).toBe(5000);
    }
    const body = captured[0]?.body ?? {};
    expect(captured[0]?.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(captured[0]?.headers['authorization']).toBe('Bearer gsk_test');
    expect(body['response_format']).toMatchObject({ type: 'json_schema', json_schema: { strict: true } });
    expect(body['include_reasoning']).toBe(false);
    expect(body['reasoning_effort']).toBe('low');
    expect(body['max_completion_tokens']).toBe(1000);
  });

  it('uses JSON mode + prompt schema for the compound systems', async () => {
    const captured: Captured[] = [];
    const provider = new GroqProvider({ apiKey: 'k', fetch: mockFetch(() => completion(ok), captured) });
    await provider.generateStructured({
      task: 'research.web',
      schema,
      system: 'sys',
      user: 'find',
      model: MODELS.groqCompound,
      params: { maxOutputTokens: 4096, enabledTools: ['web_search'] },
      jsonInstructions: 'ONLY JSON: {schema}',
    });
    const body = captured[0]?.body ?? {};
    expect(body['response_format']).toEqual({ type: 'json_object' });
    expect(body['compound_custom']).toEqual({ tools: { enabled_tools: ['web_search'] } });
    expect(body['reasoning_format']).toBeUndefined();
    const messages = body['messages'] as { role: string; content: unknown }[];
    expect(String(messages[0]?.content)).toContain('ONLY JSON');
  });

  it('sends images as data URLs and keeps the route token cap below the requested size', async () => {
    const captured: Captured[] = [];
    const provider = new GroqProvider({ apiKey: 'k', fetch: mockFetch(() => completion(ok), captured) });
    await provider.generateStructured({
      task: 'vision.menu_extract',
      schema,
      system: 'sys',
      user: 'read',
      images: [image],
      model: MODELS.groqQwen38,
      maxTokens: 4096,
      params: { reasoningEffort: 'none', maxOutputTokens: 1000 },
    });
    const body = captured[0]?.body ?? {};
    expect(body['response_format']).toMatchObject({ type: 'json_schema', json_schema: { strict: true } });
    expect(body['reasoning_format']).toBe('hidden');
    expect(body['max_completion_tokens']).toBe(1000);
    const messages = body['messages'] as { role: string; content: unknown }[];
    const parts = messages[1]?.content as { type: string; image_url?: { url: string } }[];
    expect(parts[0]).toEqual({ type: 'text', text: 'read' });
    expect(parts[1]?.image_url?.url.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('maps 429 with retry-after to rate_limited', async () => {
    const provider = new GroqProvider({
      apiKey: 'k',
      fetch: mockFetch(
        () =>
          new Response(JSON.stringify({ error: { message: 'Rate limit reached', type: 'tokens' } }), {
            status: 429,
            headers: { 'retry-after': '7' },
          }),
      ),
    });
    const result = await provider.generateStructured({ task: 'text.item_enrich', schema, system: 's', user: 'u', model: MODELS.groqGptOss20b });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('rate_limited');
      expect(result.error.retryAfterMs).toBe(7000);
    }
  });

  it('maps a free-tier 413 to a bad request that says which limit it hit', async () => {
    const provider = new GroqProvider({
      apiKey: 'k',
      fetch: mockFetch(() => new Response('Request Entity Too Large', { status: 413 })),
    });
    const result = await provider.generateStructured({ task: 'research.web', schema, system: 's', user: 'u', model: MODELS.groqCompound });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('bad_request');
      expect(result.error.status).toBe(413);
      expect(result.error.message).toContain('dakikalık token');
      const app = providerFailure(result.error, 'İnternet araştırması');
      expect(app.code).toBe('PROVIDER_UNAVAILABLE');
      expect(app.message).toContain('bu AI planında yapılamıyor');
    }
  });

  it('maps json_validate_failed to invalid_output with the failed generation', async () => {
    const provider = new GroqProvider({
      apiKey: 'k',
      fetch: mockFetch(
        () =>
          new Response(
            JSON.stringify({ error: { message: 'Failed to generate JSON', code: 'json_validate_failed', failed_generation: '{"items": [' } }),
            { status: 400 },
          ),
      ),
    });
    const result = await provider.generateStructured({ task: 'text.item_enrich', schema, system: 's', user: 'u', model: MODELS.groqGptOss20b });
    expect(result.ok || result.error.kind).toBe('invalid_output');
    if (!result.ok) expect(result.error.raw).toBe('{"items": [');
  });

  it('maps 5xx, truncation, schema mismatch and a missing key', async () => {
    const e500 = new GroqProvider({ apiKey: 'k', fetch: mockFetch(() => new Response('oops', { status: 503 })) });
    const r500 = await e500.generateStructured({ task: 'text.item_enrich', schema, system: 's', user: 'u', model: MODELS.groqGptOss20b });
    expect(!r500.ok && r500.error.kind).toBe('unavailable');

    const cut = new GroqProvider({ apiKey: 'k', fetch: mockFetch(() => completion('{"items":[', 'length')) });
    const rCut = await cut.generateStructured({ task: 'text.item_enrich', schema, system: 's', user: 'u', model: MODELS.groqGptOss20b });
    expect(!rCut.ok && rCut.error.kind).toBe('invalid_output');

    const wrong = new GroqProvider({ apiKey: 'k', fetch: mockFetch(() => completion('{"items":[{"rawName":1}]}')) });
    const rWrong = await wrong.generateStructured({ task: 'text.item_enrich', schema, system: 's', user: 'u', model: MODELS.groqGptOss20b });
    expect(!rWrong.ok && rWrong.error.kind).toBe('invalid_output');
    if (!rWrong.ok) expect(rWrong.error.issues?.length).toBeGreaterThan(0);

    const noKey = new GroqProvider({ apiKey: undefined });
    expect(noKey.isConfigured()).toBe(false);
    const rNoKey = await noKey.generateStructured({ task: 'text.item_enrich', schema, system: 's', user: 'u', model: MODELS.groqGptOss20b });
    expect(!rNoKey.ok && rNoKey.error.kind).toBe('not_configured');
  });

  it('refuses images on text-only models and rejects embeddings', async () => {
    const provider = new GroqProvider({ apiKey: 'k', fetch: mockFetch(() => completion('{}')) });
    const result = await provider.generateStructured({
      task: 'vision.menu_extract',
      schema,
      system: 's',
      user: 'u',
      images: [image],
      model: MODELS.groqGptOss120b,
    });
    expect(!result.ok && result.error.kind).toBe('unsupported');
    await expect(provider.embed(['x'])).rejects.toMatchObject({ kind: 'unsupported' });
  });
});

class FakeTransport implements GeminiTransport {
  requests: unknown[] = [];
  constructor(
    private readonly reply: () => InteractionResponse | Promise<InteractionResponse>,
    private readonly embedReply: (texts: string[], dim: number) => number[][] = (texts, dim) =>
      texts.map(() => new Array<number>(dim).fill(0.01)),
  ) {}

  async createInteraction(request: unknown): Promise<InteractionResponse> {
    this.requests.push(request);
    return this.reply();
  }

  async embed(request: { texts: string[]; dim: number }): Promise<number[][]> {
    return this.embedReply(request.texts, request.dim);
  }
}

describe('GeminiProvider', () => {
  const okResponse: InteractionResponse = {
    outputText: JSON.stringify({ items: [{ rawName: 'Lahmacun', confidence: 0.8 }] }),
    status: 'completed',
    tokensIn: 1600,
    tokensOut: 40,
    headers: undefined,
  };

  it('builds a stateless structured interaction with text before the image', async () => {
    const transport = new FakeTransport(() => okResponse);
    const provider = new GeminiProvider({ transport });
    const result = await provider.generateStructured({
      task: 'vision.menu_extract',
      schema,
      system: 'sys',
      user: 'read this',
      images: [image],
      model: MODELS.geminiFlash,
      params: { thinkingLevel: 'low', maxOutputTokens: 2048 },
    });
    expect(result.ok).toBe(true);
    const request = transport.requests[0] as {
      input: { type: string }[];
      schema: Record<string, unknown>;
      thinkingLevel: string;
      maxOutputTokens: number;
    };
    expect(request.input.map((p) => p.type)).toEqual(['text', 'image']);
    expect(request.thinkingLevel).toBe('low');
    expect(request.maxOutputTokens).toBe(2048);
    expect(JSON.stringify(request.schema)).not.toContain('$schema');
  });

  it('maps RESOURCE_EXHAUSTED with RetryInfo to rate_limited', async () => {
    const transport = new FakeTransport(() => {
      throw Object.assign(new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"retryDelay":"12s"}]}}'), {
        status: 429,
      });
    });
    const provider = new GeminiProvider({ transport });
    const result = await provider.generateStructured({ task: 'text.item_enrich', schema, system: 's', user: 'u', model: MODELS.geminiFlash });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('rate_limited');
      expect(result.error.retryAfterMs).toBe(12_000);
    }
  });

  it('maps 5xx, invalid keys and truncated interactions', async () => {
    const down = new GeminiProvider({ transport: new FakeTransport(() => Promise.reject(Object.assign(new Error('boom'), { status: 503 }))) });
    const rDown = await down.generateStructured({ task: 'text.item_enrich', schema, system: 's', user: 'u', model: MODELS.geminiFlash });
    expect(!rDown.ok && rDown.error.kind).toBe('unavailable');

    const badKey = new GeminiProvider({
      transport: new FakeTransport(() => Promise.reject(new Error('API key not valid. Please pass a valid API key.'))),
    });
    const rKey = await badKey.generateStructured({ task: 'text.item_enrich', schema, system: 's', user: 'u', model: MODELS.geminiFlash });
    expect(!rKey.ok && rKey.error.kind).toBe('auth');

    const cut = new GeminiProvider({ transport: new FakeTransport(() => ({ ...okResponse, status: 'incomplete', outputText: '{"items":[' })) });
    const rCut = await cut.generateStructured({ task: 'text.item_enrich', schema, system: 's', user: 'u', model: MODELS.geminiFlash });
    expect(!rCut.ok && rCut.error.kind).toBe('invalid_output');
  });

  it('embeds one vector per text and validates dimensions', async () => {
    const provider = new GeminiProvider({ transport: new FakeTransport(() => okResponse) });
    const vectors = await provider.embed(['a', 'b', 'c'], { model: MODELS.geminiEmbedding, dim: 768 });
    expect(vectors).toHaveLength(3);
    expect(vectors[0]).toHaveLength(768);

    const broken = new GeminiProvider({ transport: new FakeTransport(() => okResponse, (texts) => texts.map(() => [0.1, 0.2])) });
    await expect(broken.embed(['a'], { model: MODELS.geminiEmbedding, dim: 768 })).rejects.toMatchObject({ kind: 'invalid_output' });
  });

  it('is not configured without a key', async () => {
    const provider = new GeminiProvider({ apiKey: undefined });
    expect(provider.isConfigured()).toBe(false);
    const result = await provider.generateStructured({ task: 'text.item_enrich', schema, system: 's', user: 'u', model: MODELS.geminiFlash });
    expect(!result.ok && result.error.kind).toBe('not_configured');
  });
});
