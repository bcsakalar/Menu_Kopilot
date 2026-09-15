import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { GeminiProvider } from '../../src/ai/providers/gemini.provider.js';
import { GroqProvider } from '../../src/ai/providers/groq.provider.js';
import type { AudioInput, ImageInput } from '../../src/ai/types.js';
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

describe.skipIf(!geminiKey)('Gemini (live)', () => {
  const provider = new GeminiProvider({ apiKey: geminiKey });

  it.each([MODELS.geminiFlash, MODELS.geminiFlashLite])('%s returns schema-valid JSON via the Interactions API', async (model) => {
    const result = await provider.generateStructured({
      task: 'text.normalize_classify',
      schema: dishSchema,
      system,
      user,
      model,
      params: { thinkingLevel: 'low', maxOutputTokens: 1024 },
      timeoutMs: 60_000,
    });
    if (!result.ok) throw result.error;
    expect(result.value.items.length).toBeGreaterThanOrEqual(2);
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

  it.skipIf(!existsSync(fixtureImage))('reads a menu photo', async () => {
    const image = loadFixtureImage();
    if (!image) return;
    const result = await provider.generateStructured({
      task: 'vision.menu_extract',
      schema: extractSchema,
      system: 'Menüdeki ürün adlarını çıkar.',
      user: 'Ürünleri listele.',
      images: [image],
      model: MODELS.geminiFlash,
      params: { thinkingLevel: 'low', maxOutputTokens: 4096 },
    });
    if (!result.ok) throw result.error;
    expect(result.value.items.length).toBeGreaterThan(5);
  });
});

describe.skipIf(!groqKey)('Groq (live)', () => {
  const provider = new GroqProvider({ apiKey: groqKey });

  it.each([MODELS.groqGptOss20b, MODELS.groqGptOss120b])('%s returns strict json_schema output', async (model) => {
    const result = await provider.generateStructured({
      task: 'text.item_enrich',
      schema: dishSchema,
      schemaName: 'dishes',
      system,
      user,
      model,
      params: { reasoningEffort: 'low', maxOutputTokens: 1024 },
      timeoutMs: 60_000,
    });
    if (!result.ok) throw result.error;
    expect(result.value.items.length).toBeGreaterThanOrEqual(2);
    expect(result.meta.rateLimit?.limitTokens).toBeGreaterThan(0);
  });

  it.skipIf(!existsSync(fixtureImage)).each([MODELS.groqQwen38, MODELS.groqQwen36])('%s reads a menu photo', async (model) => {
    const image = loadFixtureImage();
    if (!image) return;
    const result = await provider.generateStructured({
      task: 'vision.menu_extract',
      schema: extractSchema,
      schemaName: 'menu',
      system: 'Menüdeki ürün adlarını çıkar.',
      user: 'Ürünleri listele.',
      images: [image],
      model,
      params: { reasoningEffort: 'none', maxOutputTokens: 4096 },
      jsonInstructions: `Yanıtı yalnızca bu JSON şemasına uyan tek bir JSON nesnesi olarak ver: {"items":[{"rawName":"string","confidence":0.9}]}`,
    });
    if (!result.ok) throw result.error;
    expect(result.value.items.length).toBeGreaterThan(5);
  });

  it.each([MODELS.groqWhisperTurbo, MODELS.groqWhisper])('%s accepts a recording (model ID + multipart check)', async (model) => {
    const result = await provider.transcribe(toneWav(), { model, language: 'tr', prompt: 'Adana Kebap, Lahmacun', timeoutMs: 60_000 });
    if (!result.ok) throw result.error;
    // A pure tone has no words: only the call itself is verified here.
    expect(typeof result.value.text).toBe('string');
  });

  it.each([MODELS.groqCompound, MODELS.groqCompoundMini])('%s searches the web and answers in JSON mode', async (model) => {
    const result = await provider.generateStructured({
      task: 'research.web',
      schema: z.object({ found: z.boolean(), items: z.array(z.object({ name: z.string() })) }),
      system: 'Restoranın menüsünü internette ara. Yalnızca {"found": boolean, "items": [{"name": string}]} biçiminde JSON döndür.',
      user: 'Restoran: Hacı Abdullah Lokantası\nŞehir: İstanbul',
      model,
      params: { enabledTools: ['web_search'], maxOutputTokens: 2048 },
      timeoutMs: 90_000,
    });
    if (!result.ok) throw result.error;
    expect(result.meta.sources?.length ?? 0).toBeGreaterThan(0);
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
