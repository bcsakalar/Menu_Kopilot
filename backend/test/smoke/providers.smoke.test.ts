import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ProviderError } from '../../src/ai/errors.js';
import { GeminiProvider } from '../../src/ai/providers/gemini.provider.js';
import { GroqProvider } from '../../src/ai/providers/groq.provider.js';
import type { AudioInput, ImageInput, Result } from '../../src/ai/types.js';
import { parseEnv } from '../../src/config/env.js';
import { MODELS } from '../../src/config/models.js';

/**
 * Hits the real APIs. Skipped automatically when the keys are missing.
 * Run: pnpm test:smoke   (reads ../.env)
 */
const config = parseEnv({ ...process.env, DATABASE_URL: process.env['DATABASE_URL'] ?? 'unused' });
const geminiKey = config.providers.geminiApiKey;
const groqKey = config.providers.groqApiKey;

const dishSchema = z.object({
  items: z.array(z.object({ name: z.string(), is_turkish: z.boolean(), confidence: z.number() })).min(1),
});
const system = 'Kısa ve doğru cevap ver. Yalnızca istenen JSON alanlarını doldur.';
const user = 'Şu ürünleri listele ve Türk mutfağına ait olup olmadığını işaretle: Adana Kebap, Margherita Pizza.';

const fixtureImage = fileURLToPath(new URL('../fixtures/images/menu-kebapci.jpg', import.meta.url));
function loadFixtureImage(): ImageInput | undefined {
  if (!existsSync(fixtureImage)) return undefined;
  const data = readFileSync(fixtureImage);
  return { data, mimeType: 'image/jpeg', sha256: createHash('sha256').update(data).digest('hex'), width: 1600, height: 1200 };
}
const extractSchema = z.object({ items: z.array(z.object({ rawName: z.string(), confidence: z.number() })) });

/**
 * Plan limits are not code failures: a free-tier quota (429) or Groq's per-minute token limit (413) skips the test
 * with the provider's reason instead of failing it (D-142).
 */
function valueOf<T>(result: Result<T>, skip: (note?: string) => never): T {
  if (result.ok) return result.value;
  const error: ProviderError = result.error;
  if (error.kind === 'rate_limited' || error.status === 413) skip(`plan limit: ${error.message.slice(0, 160)}`);
  throw error;
}

describe.skipIf(!geminiKey)('Gemini (live)', () => {
  const provider = new GeminiProvider({ apiKey: geminiKey });

  it.for([MODELS.geminiFlash, MODELS.geminiFlashLite])('%s returns schema-valid JSON via the Interactions API', async (model, { skip }) => {
    const result = await provider.generateStructured({
      task: 'agent.validate',
      schema: dishSchema,
      system,
      user,
      model,
      params: { thinkingLevel: 'low', maxOutputTokens: 1024 },
      timeoutMs: 60_000,
    });
    expect(valueOf(result, skip).items.length).toBeGreaterThanOrEqual(2);
    expect(result.meta.tokensIn).toBeGreaterThan(0);
  });

  it('embeds with gemini-embedding-2 at 768 dims (normalized)', async () => {
    const vectors = await provider.embed(['task: search result | query: adana dürüm', 'title: Adana Kebap | text: acılı kıyma'], {
      model: MODELS.geminiEmbedding,
      dim: 768,
    });
    expect(vectors).toHaveLength(2);
    for (const v of vectors) {
      expect(v).toHaveLength(768);
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      expect(norm).toBeGreaterThan(0.98);
      expect(norm).toBeLessThan(1.02);
    }
  });

  it.skipIf(!existsSync(fixtureImage)).for([MODELS.geminiFlashLite, MODELS.geminiFlash])('%s reads a menu photo', async (model, { skip }) => {
    const image = loadFixtureImage();
    if (!image) return;
    const result = await provider.generateStructured({
      task: 'agent.extract',
      schema: extractSchema,
      system: 'Menüdeki ürün adlarını çıkar.',
      user: 'Ürünleri listele.',
      images: [image],
      model,
      params: { thinkingLevel: 'low', maxOutputTokens: 4096 },
    });
    expect(valueOf(result, skip).items.length).toBeGreaterThan(5);
  });
});

describe.skipIf(!groqKey)('Groq (live)', () => {
  const provider = new GroqProvider({ apiKey: groqKey });

  it.for([MODELS.groqGptOss20b, MODELS.groqGptOss120b])('%s returns strict json_schema output', async (model, { skip }) => {
    const result = await provider.generateStructured({
      task: 'agent.recommend',
      schema: dishSchema,
      schemaName: 'dishes',
      system,
      user,
      model,
      params: { reasoningEffort: 'low', maxOutputTokens: 1024 },
      timeoutMs: 60_000,
    });
    expect(valueOf(result, skip).items.length).toBeGreaterThanOrEqual(2);
    expect(result.meta.rateLimit?.limitTokens).toBeGreaterThan(0);
  });

  it.skipIf(!existsSync(fixtureImage)).for([MODELS.groqQwen38])('%s reads a menu photo', async (model, { skip }) => {
    const image = loadFixtureImage();
    if (!image) return;
    const result = await provider.generateStructured({
      task: 'agent.extract',
      schema: extractSchema,
      schemaName: 'menu',
      system: 'Menüdeki ürün adlarını çıkar.',
      user: 'Ürünleri listele.',
      images: [image],
      model,
      // The free tier caps qwen3.8 at 1000 output tokens per minute (larger requests get a 413).
      params: { reasoningEffort: 'none', maxOutputTokens: 1000 },
    });
    expect(valueOf(result, skip).items.length).toBeGreaterThan(5);
  });

  it.for([MODELS.groqWhisperTurbo, MODELS.groqWhisper])('%s accepts a recording (model ID + multipart check)', async (model, { skip }) => {
    const result = await provider.transcribe(toneWav(), { model, language: 'tr', prompt: 'Adana Kebap, Lahmacun', timeoutMs: 60_000 });
    // A pure tone has no words: only the call itself is verified here.
    expect(typeof valueOf(result, skip).text).toBe('string');
  });
});

/** 1 s, 16 kHz mono PCM WAV with a 440 Hz tone (Whisper downsamples to 16 kHz mono anyway). */
function toneWav(): AudioInput {
  const rate = 16_000;
  const samples = rate;
  const data = Buffer.alloc(44 + samples * 2);
  data.write('RIFF', 0, 'latin1');
  data.writeUInt32LE(36 + samples * 2, 4);
  data.write('WAVE', 8, 'latin1');
  data.write('fmt ', 12, 'latin1');
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36, 'latin1');
  data.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i += 1) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), 44 + i * 2);
  }
  return { data, mimeType: 'audio/wav', sha256: createHash('sha256').update(data).digest('hex'), fileName: 'tone.wav' };
}
