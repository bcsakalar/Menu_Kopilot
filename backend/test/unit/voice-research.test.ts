import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { GroqProvider } from '../../src/ai/providers/groq.provider.js';
import type { AudioInput } from '../../src/ai/types.js';
import { MODELS, eligibleModels } from '../../src/config/models.js';
import { sniffAudio, toAudioInput } from '../../src/lib/audio.js';
import { containsContactDetails, stripContactDetails } from '../../src/lib/contact-guard.js';
import { mergeSources } from '../../src/modules/research/service.js';
import { parsePromptItems } from '../../src/modules/suggest/prompt-parse.js';

const bytes = (...values: number[]) => Buffer.from([...values, ...new Array<number>(16).fill(0)]);
const withAscii = (text: string, offset = 0) => {
  const buf = Buffer.alloc(32);
  buf.write(text, offset, 'latin1');
  return buf;
};

describe('sniffAudio', () => {
  it('recognizes the containers Whisper accepts', () => {
    const m4a = Buffer.alloc(32);
    m4a.write('ftypM4A ', 4, 'latin1');
    expect(sniffAudio(m4a)).toEqual({ mimeType: 'audio/mp4', ext: 'm4a' });
    expect(sniffAudio(withAscii('OggS'))?.ext).toBe('ogg');
    const wav = withAscii('RIFF');
    wav.write('WAVE', 8, 'latin1');
    expect(sniffAudio(wav)?.ext).toBe('wav');
    expect(sniffAudio(withAscii('fLaC'))?.ext).toBe('flac');
    expect(sniffAudio(bytes(0x1a, 0x45, 0xdf, 0xa3))?.ext).toBe('webm');
    expect(sniffAudio(withAscii('ID3'))?.ext).toBe('mp3');
    expect(sniffAudio(bytes(0xff, 0xfb, 0x90))?.ext).toBe('mp3');
  });

  it('rejects photos in the same container family, AAC ADTS and junk', () => {
    const heic = Buffer.alloc(32);
    heic.write('ftypheic', 4, 'latin1');
    expect(sniffAudio(heic)).toBeUndefined();
    expect(sniffAudio(bytes(0xff, 0xf1, 0x50))).toBeUndefined();
    expect(sniffAudio(Buffer.from('hello world, not audio'))).toBeUndefined();
    expect(sniffAudio(Buffer.from('short'))).toBeUndefined();
  });

  it('builds an upload with a hash-based file name', () => {
    const ogg = withAscii('OggS');
    const audio = toAudioInput(ogg);
    expect(audio?.mimeType).toBe('audio/ogg');
    expect(audio?.fileName).toMatch(/^note-[0-9a-f]{12}\.ogg$/);
  });
});

describe('contact guard', () => {
  it('removes phone numbers and e-mail addresses', () => {
    const text = 'Sipariş: 0532 123 45 67 veya +90 (212) 555-12-34, 444 12 34; bilgi@ornek.com.tr adresine yaz.';
    expect(containsContactDetails(text)).toBe(true);
    const clean = stripContactDetails(text);
    expect(containsContactDetails(clean)).toBe(false);
    expect(clean).not.toMatch(/\d{3}/);
    expect(clean).toContain('adresine yaz');
    expect(stripContactDetails('Adana Kebap, 2 porsiyon')).toBe('Adana Kebap, 2 porsiyon');
  });
});

describe('research sources', () => {
  it('puts real search results first, drops non-http links and duplicates', () => {
    const merged = mergeSources(
      [{ title: 'Menü', url: 'https://a.example/menu' }],
      [
        { title: 'Aynı', url: 'https://a.example/menu' },
        { title: 'Kötü', url: 'javascript:alert(1)' },
        { title: null, url: 'https://b.example' },
        'garbage',
      ],
    );
    expect(merged).toEqual([
      { title: 'Menü', url: 'https://a.example/menu' },
      { title: 'https://b.example', url: 'https://b.example' },
    ]);
  });
});

describe('dictated prompts', () => {
  it('splits spoken sentences and drops fillers', () => {
    const names = parsePromptItems('Adana kebap var, lahmacun da yapıyorlar. Bir de künefe satıyorlar. 1. porsiyon ayran').map(
      (n) => n.rawName,
    );
    expect(names).toEqual(['Adana kebap', 'lahmacun', 'künefe', 'porsiyon ayran']);
  });
});

describe('Faz 7 model routing', () => {
  it('offers only audio models for voice notes and only compound systems for research', () => {
    expect(eligibleModels('audio.transcribe').map((m) => m.id)).toEqual([MODELS.groqWhisperTurbo, MODELS.groqWhisper]);
    expect(eligibleModels('research.web').map((m) => m.id)).toEqual([MODELS.groqCompound, MODELS.groqCompoundMini]);
    expect(eligibleModels('text.item_enrich').some((m) => m.kind === 'compound')).toBe(false);
  });
});

describe('GroqProvider — Whisper and compound', () => {
  const audio: AudioInput = { data: Buffer.from('OggS-fake-audio'), mimeType: 'audio/ogg', sha256: 'abc', fileName: 'note.ogg' };

  it('uploads the recording as multipart and reads verbose_json', async () => {
    const seen: { url: string; form: FormData | undefined }[] = [];
    const provider = new GroqProvider({
      apiKey: 'k',
      fetch: (async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        seen.push({ url, form: init?.body instanceof FormData ? init.body : undefined });
        return new Response(JSON.stringify({ text: ' Adana kebap, lahmacun ', language: 'turkish', duration: 4.2 }), { status: 200 });
      }),
    });
    const result = await provider.transcribe(audio, { model: MODELS.groqWhisperTurbo, language: 'tr', prompt: 'Adana Kebap, Lahmacun' });
    expect(result.ok && result.value).toEqual({ text: 'Adana kebap, lahmacun', language: 'turkish', durationSec: 4.2 });
    expect(seen[0]?.url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    const form = seen[0]?.form;
    expect(form?.get('model')).toBe(MODELS.groqWhisperTurbo);
    expect(form?.get('language')).toBe('tr');
    expect(form?.get('prompt')).toBe('Adana Kebap, Lahmacun');
    expect(form?.get('response_format')).toBe('verbose_json');
    const file = form?.get('file');
    expect(file instanceof Blob && file.type).toBe('audio/ogg');
  });

  it('maps HTTP errors and refuses non-audio models', async () => {
    const tooLarge = new GroqProvider({
      apiKey: 'k',
      fetch: (async () => new Response(JSON.stringify({ error: { message: 'file too large' } }), { status: 413 })),
    });
    const failed = await tooLarge.transcribe(audio, { model: MODELS.groqWhisperTurbo });
    expect(!failed.ok && failed.error.kind).toBe('bad_request');
    const wrongModel = await tooLarge.transcribe(audio, { model: MODELS.groqGptOss20b });
    expect(!wrongModel.ok && wrongModel.error.kind).toBe('unsupported');
  });

  it('limits compound to the allowed tools and returns the pages it searched', async () => {
    let body: Record<string, unknown> = {};
    const provider = new GroqProvider({
      apiKey: 'k',
      fetch: (async (_input: string | URL | Request, init?: RequestInit) => {
        body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '{"found":true}',
                  executed_tools: [
                    { type: 'search', search_results: { results: [{ title: 'Menü', url: 'https://a.example/menu', score: 0.9 }] } },
                    { type: 'visit', search_results: [{ title: null, url: 'https://b.example' }, { url: 'ftp://x' }] },
                  ],
                },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 9000, completion_tokens: 300 },
          }),
          { status: 200 },
        );
      }),
    });
    const result = await provider.generateStructured({
      task: 'research.web',
      schema: z.object({ found: z.boolean() }),
      system: 'sys',
      user: 'usr',
      model: MODELS.groqCompound,
      params: { enabledTools: ['web_search', 'visit_website'], maxOutputTokens: 4096 },
    });
    expect(result.ok).toBe(true);
    expect(result.meta.sources).toEqual([
      { title: 'Menü', url: 'https://a.example/menu' },
      { title: 'https://b.example', url: 'https://b.example' },
    ]);
    expect(body['compound_custom']).toEqual({ tools: { enabled_tools: ['web_search', 'visit_website'] } });
    expect(body['response_format']).toEqual({ type: 'json_object' });
    expect(body['temperature']).toBeUndefined();
    expect(body['include_reasoning']).toBeUndefined();
  });
});
