import { describe, expect, it } from 'vitest';
import { GroqProvider } from '../../src/ai/providers/groq.provider.js';
import type { AudioInput } from '../../src/ai/types.js';
import { MODELS, eligibleModels } from '../../src/config/models.js';
import { parseMenuText } from '../../src/modules/analyze/service.js';

describe('dictated and typed product lists', () => {
  it('splits on commas, newlines and semicolons and drops one-character noise', () => {
    expect(parseMenuText('Adana Kebap, Urfa Kebap\nAyran; x, Künefe')).toEqual([
      'Adana Kebap',
      'Urfa Kebap',
      'Ayran',
      'Künefe',
    ]);
  });

  it('answers an empty list for empty input', () => {
    expect(parseMenuText(undefined)).toEqual([]);
    expect(parseMenuText('  ')).toEqual([]);
  });
});

describe('model routing per task', () => {
  it('offers only audio models for voice notes and only vision models to the extractor', () => {
    expect(eligibleModels('audio.transcribe').map((m) => m.id)).toEqual([MODELS.groqWhisperTurbo, MODELS.groqWhisper]);
    expect(eligibleModels('agent.extract').every((m) => m.vision)).toBe(true);
    // The recommendation agents may use any chat model, the vision-capable ones included.
    expect(eligibleModels('agent.recommend').every((m) => m.kind === 'chat')).toBe(true);
    expect(eligibleModels('agent.recommend').map((m) => m.id)).toContain(MODELS.groqGptOss120b);
  });
});

describe('GroqProvider — Whisper', () => {
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
});
