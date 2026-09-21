import { describe, expect, it } from 'vitest';
import { GroqProvider } from '../../src/ai/providers/groq.provider.js';
import type { AudioInput } from '../../src/ai/types.js';
import { MODELS, eligibleModels } from '../../src/config/models.js';
import { sniffAudio, toAudioInput } from '../../src/lib/audio.js';
import { parseMenuText } from '../../src/modules/analyze/service.js';

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
