import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { GenerateStructuredOptions, ImageInput } from '../../src/ai/types.js';
import { toImageInput } from '../../src/lib/images.js';
import { normalizeTr } from '../../src/lib/normalize-tr.js';
import { type FakeReply, type FakeResponder, okJson } from './fake-provider.js';

const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));

export interface ResearchFixture {
  restaurant: string;
  sources: { title: string; url: string }[];
  response: unknown;
}

export interface Fixtures {
  images: Map<string, ImageInput>;
  extractBySha: Map<string, unknown>;
  panelBySha: Map<string, unknown>;
  enrichItems: Record<string, unknown>;
  /** Keyed by normalizeTr(restaurant name). */
  research: Map<string, ResearchFixture>;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

export function loadFixtures(): Fixtures {
  const images = new Map<string, ImageInput>();
  const extractBySha = new Map<string, unknown>();
  const panelBySha = new Map<string, unknown>();
  const imageDir = join(FIXTURES, 'images');
  for (const file of readdirSync(imageDir)) {
    if (!/\.(jpg|png)$/.test(file)) continue;
    const image = toImageInput(readFileSync(join(imageDir, file)));
    if (!image) throw new Error(`fixture ${file} is not an image`);
    images.set(file, image);
    const base = file.replace(/\.(jpg|png)$/, '.json');
    try {
      extractBySha.set(image.sha256, readJson(join(FIXTURES, 'llm', 'extract', base)));
    } catch {
      // not a menu photo
    }
    try {
      panelBySha.set(image.sha256, readJson(join(FIXTURES, 'llm', 'panel', base)));
    } catch {
      // not a panel screenshot
    }
  }
  const enrichItems = readJson(join(FIXTURES, 'llm', 'enrich-items.json')) as Record<string, unknown>;
  const research = new Map<string, ResearchFixture>();
  const researchDir = join(FIXTURES, 'llm', 'research');
  for (const file of readdirSync(researchDir)) {
    if (!file.endsWith('.json')) continue;
    const fixture = readJson(join(researchDir, file)) as ResearchFixture;
    research.set(normalizeTr(fixture.restaurant), fixture);
  }
  return { images, extractBySha, panelBySha, enrichItems, research };
}

export function fixtureImage(fx: Fixtures, file: string): ImageInput {
  const image = fx.images.get(file);
  if (!image) throw new Error(`missing fixture image ${file}`);
  return image;
}

/** Lines "1. Name (bölüm: X)" from the enrich.user items block. */
export function requestedItemNames(user: string): string[] {
  const names: string[] = [];
  for (const match of user.matchAll(/^\s*\d+\.\s+(.+?)(?:\s+\(bölüm: .*\))?\s*$/gmu)) {
    if (match[1]) names.push(match[1]);
  }
  return names;
}

export function unknownItem(name: string) {
  return {
    name,
    description: '',
    serving_note: '',
    portion_info: '',
    option_groups: [],
    removable_ingredients: [],
    extra_ingredients: [],
    tags: [],
    allergen_notes: [],
    upsell_suggestion: '',
    confidence: 0.2,
  };
}

export interface FixtureResponderOptions {
  /** Map of normalized raw name → candidate canonical name for the canonicalize task. */
  canonical?: Record<string, string>;
  /** Override for specific tasks. */
  override?: (opts: GenerateStructuredOptions<unknown>, call: number) => FakeReply | undefined;
}

/** Responds like a provider would, based on the recorded fixtures. */
export function fixtureResponder(fx: Fixtures, options: FixtureResponderOptions = {}): FakeResponder {
  return (opts, call) => {
    const overridden = options.override?.(opts, call);
    if (overridden) return overridden;
    switch (opts.task) {
      case 'vision.menu_extract': {
        const sha = opts.images?.[0]?.sha256 ?? '';
        const recorded = fx.extractBySha.get(sha);
        return recorded ? okJson(recorded) : okJson({ items: [] });
      }
      case 'vision.panel_extract': {
        const sha = opts.images?.[0]?.sha256 ?? '';
        const recorded = fx.panelBySha.get(sha);
        return recorded ? okJson(recorded) : okJson({ items: [] });
      }
      case 'text.item_enrich':
      case 'deep.analyze': {
        const section = opts.user.split('sırayla bir kayıt döndür:')[1] ?? opts.user;
        const names = requestedItemNames(section);
        return okJson({
          items: names.map((name) => fx.enrichItems[normalizeTr(name)] ?? unknownItem(name)),
        });
      }
      case 'text.normalize_classify': {
        const candidates = new Map<string, string>();
        for (const m of opts.user.matchAll(/^(c\d+) \| (.+)$/gmu)) {
          if (m[1] && m[2]) candidates.set(normalizeTr(m[2]), m[1]);
        }
        const items: unknown[] = [];
        for (const m of opts.user.matchAll(/^(\d+) \| (.+)$/gmu)) {
          const index = Number(m[1]);
          const target = options.canonical?.[normalizeTr(m[2] ?? '')];
          const key = target ? candidates.get(normalizeTr(target)) : undefined;
          items.push({ index, candidate_id: key ?? null, is_product: true, confidence: key ? 0.93 : 0.4 });
        }
        return okJson({ items });
      }
      case 'research.web': {
        const name = /^Restoran: (.+)$/mu.exec(opts.user)?.[1] ?? '';
        const recorded = fx.research.get(normalizeTr(name));
        if (!recorded) {
          return okJson({ found: false, summary: '', cuisine: null, items: [], sources: [], confidence: 0.1 });
        }
        return { ...okJson(recorded.response), sources: recorded.sources };
      }
      case 'text.gap_suggest':
      case 'embed':
      case 'audio.transcribe':
        return okJson({ items: [] });
    }
  };
}

// ---- HTTP helpers ----------------------------------------------------------------------------------------------

export function multipartBody(
  fields: Record<string, string>,
  files: { name: string; filename: string; contentType: string; data: Buffer }[],
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = `----vitest${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  for (const file of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      ),
    );
    chunks.push(file.data);
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

export interface SseMessage {
  event: string;
  data: unknown;
}

export function parseSse(text: string): SseMessage[] {
  const messages: SseMessage[] = [];
  for (const block of text.split('\n\n')) {
    const lines = block.split('\n');
    const event = lines.find((l) => l.startsWith('event: '))?.slice(7);
    const data = lines
      .filter((l) => l.startsWith('data: '))
      .map((l) => l.slice(6))
      .join('\n');
    if (event && data) messages.push({ event, data: JSON.parse(data) as unknown });
  }
  return messages;
}
