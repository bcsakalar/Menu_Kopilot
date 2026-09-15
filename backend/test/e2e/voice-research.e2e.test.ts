import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cuisines } from '../../src/db/schema/index.js';
import { containsContactDetails } from '../../src/lib/contact-guard.js';
import { containsPriceAmount } from '../../src/lib/price-guard.js';
import type { BranchDto } from '../../src/modules/branches/schemas.js';
import type { ResearchResultDto } from '../../src/modules/research/schemas.js';
import type { RunDto } from '../../src/modules/suggest/schemas.js';
import type { TranscriptionDto } from '../../src/modules/voice/schemas.js';
import { FakeProvider, hashEmbedding } from '../helpers/fake-provider.js';
import { type Fixtures, fixtureResponder, loadFixtures, multipartBody } from '../helpers/fixtures.js';
import { type TestContext, bearer, createTestApp, loginAs } from '../helpers/test-app.js';

/** Minimal Ogg page header: enough for the magic-byte check (the fake provider never decodes audio). */
function oggRecording(seed: string): Buffer {
  return Buffer.concat([Buffer.from('OggS', 'latin1'), Buffer.alloc(24), Buffer.from(seed)]);
}

describe('voice notes and restaurant research (Faz 7)', () => {
  let fx: Fixtures;
  let ctx: TestContext;
  let gemini: FakeProvider;
  let groq: FakeProvider;
  let token: string;
  let kebapId: string;

  const transcribe = (audio: Buffer, fields: Record<string, string> = {}, contentType = 'audio/ogg') => {
    const body = multipartBody(fields, [{ name: 'audio', filename: 'note.ogg', contentType, data: audio }]);
    return ctx.app.inject({
      method: 'POST',
      url: '/api/v1/transcribe',
      headers: { ...bearer(token), ...body.headers },
      payload: body.payload,
    });
  };

  const research = (payload: Record<string, unknown>) =>
    ctx.app.inject({ method: 'POST', url: '/api/v1/research', headers: bearer(token), payload });

  beforeAll(async () => {
    fx = loadFixtures();
    gemini = new FakeProvider('gemini', fixtureResponder(fx), (texts, opts) => texts.map((t) => hashEmbedding(t, opts.dim)));
    groq = new FakeProvider('groq', fixtureResponder(fx));
    ctx = await createTestApp({ providers: { gemini, groq } });
    token = (await loginAs(ctx)).accessToken;
    const [row] = await ctx.db.db.select({ id: cuisines.id }).from(cuisines).where(eq(cuisines.slug, 'kebap-izgara'));
    kebapId = row?.id ?? '';
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(() => {
    ctx.cache.clear();
    groq.transcriber = () => ({
      ok: true,
      value: { text: 'Adana kebap var, lahmacun da yapıyorlar. Bir de künefe, 150 lira.', language: 'turkish', durationSec: 6.5 },
    });
  });

  describe('POST /transcribe', () => {
    it('turns a recording into text and product names, with cuisine vocabulary as the Whisper prompt', async () => {
      const res = await transcribe(oggRecording('note-1'), { cuisineId: kebapId });
      expect(res.statusCode).toBe(200);
      const body = res.json<TranscriptionDto>();
      expect(body).toMatchObject({ language: 'turkish', durationSec: 6.5, cached: false, provider: 'groq', model: 'whisper-large-v3-turbo' });
      expect(body.items).toEqual(['Adana kebap', 'lahmacun', 'künefe']);
      expect(containsPriceAmount(body.text)).toBe(false);
      const call = groq.transcribeCalls.at(-1);
      expect(call?.opts).toMatchObject({ model: 'whisper-large-v3-turbo', language: 'tr' });
      expect(call?.opts.prompt).toMatch(/^Restoran menüsü ürünleri, virgülle ayrılmış: .*Adana Kebap/u);
      expect(call?.audio.mimeType).toBe('audio/ogg');
    });

    it('serves the same recording from the cache', async () => {
      await transcribe(oggRecording('note-2'));
      const before = groq.transcribeCalls.length;
      const again = await transcribe(oggRecording('note-2'));
      expect(again.json<TranscriptionDto>().cached).toBe(true);
      expect(groq.transcribeCalls.length).toBe(before);
    });

    it('falls back to Whisper v3 when turbo is down', async () => {
      groq.transcriber = (_audio, opts) =>
        opts.model === 'whisper-large-v3-turbo'
          ? { ok: false, kind: 'unavailable' }
          : { ok: true, value: { text: 'İskender', language: 'turkish', durationSec: 1 } };
      const res = await transcribe(oggRecording('note-3'));
      expect(res.json<TranscriptionDto>()).toMatchObject({ model: 'whisper-large-v3', items: ['İskender'] });
      ctx.ai.breaker.reset();
    });

    it('rejects files that are not audio, and a missing file', async () => {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0, 0, 0, 0]);
      const wrong = await transcribe(png, {}, 'image/png');
      expect(wrong.statusCode).toBe(415);
      const empty = multipartBody({ language: 'tr' }, []);
      const missing = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/transcribe',
        headers: { ...bearer(token), ...empty.headers },
        payload: empty.payload,
      });
      expect(missing.statusCode).toBe(400);
    });
  });

  describe('POST /research', () => {
    let branch: BranchDto;

    beforeAll(async () => {
      const created = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/branches',
        headers: bearer(token),
        payload: { name: 'Karşıyaka Kebapçısı', city: 'İzmir', cuisineId: kebapId },
      });
      branch = created.json<BranchDto>();
      // Adana Kebap is already on the branch menu (card accepted in Mod 1).
      const run = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/suggest',
        headers: bearer(token),
        payload: { cuisineId: kebapId, promptText: 'Adana Kebap', branchId: branch.id },
      });
      const card = run.json<RunDto>().cards[0];
      await ctx.app.inject({ method: 'POST', url: `/api/v1/suggestion-items/${card?.id ?? ''}/accept`, headers: bearer(token), payload: {} });
    });

    it('researches the branch restaurant: cleaned items matched to templates, menu marked, real sources', async () => {
      const res = await research({ branchId: branch.id });
      expect(res.statusCode).toBe(200);
      const result = res.json<ResearchResultDto>();
      expect(result).toMatchObject({ restaurantName: 'Karşıyaka Kebapçısı', city: 'İzmir', found: true, cuisine: 'Kebap & Izgara', cached: false });
      expect(result.items.map((i) => i.name)).toEqual(['Adana Kebap', 'Urfa Kebap', 'Beyti Sarma', 'Lahmacun', 'Künefe', 'Ayran', 'Kuzu Tandır']);
      const byName = new Map(result.items.map((i) => [i.name, i]));
      expect(byName.get('Adana Kebap')).toMatchObject({ onMenu: true, templateName: 'Adana Kebap' });
      expect(byName.get('Beyti Sarma')).toMatchObject({ onMenu: false, templateName: 'Beyti Sarma' });
      expect(byName.get('Kuzu Tandır')).toMatchObject({ onMenu: false, matchedTemplateId: null });
      expect(result.sources.map((s) => s.url)).toEqual(['https://ornek-kebapci.example/menu', 'https://maps.example/karsiyaka-kebapcisi']);
      expect(containsPriceAmount(res.body)).toBe(false);
      expect(containsContactDetails(result.summary)).toBe(false);
      expect(result.summary).toContain('ocakbaşı kebapçı');

      const call = groq.calls.at(-1);
      expect(call?.task).toBe('research.web');
      expect(call?.user).toContain('Restoran: Karşıyaka Kebapçısı');
      expect(call?.user).toContain('Şehir: İzmir');
    });

    it('caches for 7 days; refresh searches again', async () => {
      await research({ branchId: branch.id });
      const before = groq.calls.length;
      const cached = await research({ branchId: branch.id });
      expect(cached.json<ResearchResultDto>().cached).toBe(true);
      expect(groq.calls.length).toBe(before);
      const fresh = await research({ branchId: branch.id, refresh: true });
      expect(fresh.json<ResearchResultDto>().cached).toBe(false);
      expect(groq.calls.length).toBe(before + 1);
    });

    it('reports an unknown restaurant as not found, without menu marks when no branch is given', async () => {
      const res = await research({ restaurantName: 'Hiç Olmayan Lokanta', city: 'Kars' });
      expect(res.json<ResearchResultDto>()).toMatchObject({ found: false, items: [], city: 'Kars' });
      const invalid = await research({ city: 'Kars' });
      expect(invalid.statusCode).toBe(400);
    });
  });

  it('LOCAL_ONLY_MODE: voice notes and research are refused without calling a provider', async () => {
    const localGroq = new FakeProvider('groq', fixtureResponder(fx));
    localGroq.transcriber = () => ({ ok: true, value: { text: 'x' } });
    const local = await createTestApp({ providers: { groq: localGroq }, env: { LOCAL_ONLY_MODE: 'true' } });
    try {
      const localToken = (await loginAs(local)).accessToken;
      const body = multipartBody({}, [{ name: 'audio', filename: 'n.ogg', contentType: 'audio/ogg', data: oggRecording('local') }]);
      const voice = await local.app.inject({
        method: 'POST',
        url: '/api/v1/transcribe',
        headers: { ...bearer(localToken), ...body.headers },
        payload: body.payload,
      });
      expect(voice.statusCode).toBe(409);
      expect(voice.json<{ error: { code: string } }>().error.code).toBe('LOCAL_ONLY_MODE');
      const web = await local.app.inject({
        method: 'POST',
        url: '/api/v1/research',
        headers: bearer(localToken),
        payload: { restaurantName: 'Karşıyaka Kebapçısı' },
      });
      expect(web.statusCode).toBe(409);
      expect(localGroq.calls.length + localGroq.transcribeCalls.length).toBe(0);
    } finally {
      await local.close();
    }
  });
});
