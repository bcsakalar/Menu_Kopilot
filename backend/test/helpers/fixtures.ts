import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { GenerateStructuredOptions, ImageInput } from '../../src/ai/types.js';
import { toImageInput } from '../../src/lib/images.js';
import { normalizeTr } from '../../src/lib/normalize-tr.js';
import { type FakeReply, type FakeResponder, okJson } from './fake-provider.js';

const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));

export interface Fixtures {
  images: Map<string, ImageInput>;
  /** Extractor answers, keyed by image sha256. */
  extractBySha: Map<string, unknown>;
  /** Product Recommender answers, keyed by normalized cuisine name. */
  recommendByCuisine: Map<string, unknown>;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

export function loadFixtures(): Fixtures {
  const images = new Map<string, ImageInput>();
  const extractBySha = new Map<string, unknown>();
  const imageDir = join(FIXTURES, 'images');
  for (const file of readdirSync(imageDir)) {
    if (!/\.(jpg|png)$/.test(file)) continue;
    const image = toImageInput(readFileSync(join(imageDir, file)));
    if (!image) throw new Error(`fixture ${file} is not an image`);
    images.set(file, image);
    try {
      extractBySha.set(image.sha256, readJson(join(FIXTURES, 'llm', 'extract', file.replace(/\.(jpg|png)$/, '.json'))));
    } catch {
      // no recorded extraction for this image
    }
  }
  const recommendByCuisine = new Map<string, unknown>();
  try {
    const recorded = readJson(join(FIXTURES, 'llm', 'recommend-items.json')) as Record<string, unknown>;
    for (const [cuisine, value] of Object.entries(recorded)) recommendByCuisine.set(normalizeTr(cuisine), value);
  } catch {
    // no recorded recommendations
  }
  return { images, extractBySha, recommendByCuisine };
}

export function fixtureImage(fx: Fixtures, file: string): ImageInput {
  const image = fx.images.get(file);
  if (!image) throw new Error(`missing fixture image ${file}`);
  return image;
}

/** Product names from the "- Name [tip: …] (…)" lines of the option-modifier prompt. */
export function requestedItemNames(user: string): string[] {
  const names: string[] = [];
  for (const match of user.matchAll(/^\s*-\s+(.+?)(?:\s+\[tip:[^\]]*\])?(?:\s+\(.*\))?\s*$/gmu)) {
    if (match[1]) names.push(match[1]);
  }
  return names;
}

export interface FixtureResponderOptions {
  /** Overrides a specific task; returning undefined falls through to the recorded fixture. */
  override?: (opts: GenerateStructuredOptions<unknown>, call: number) => FakeReply | undefined;
}

/** Answers like a provider would, from the recorded fixtures. Unknown tasks answer with an empty list. */
export function fixtureResponder(fx: Fixtures, options: FixtureResponderOptions = {}): FakeResponder {
  return (opts, call): FakeReply => {
    const overridden = options.override?.(opts, call);
    if (overridden) return overridden;
    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- only the agent tasks are recorded; everything else answers with an empty list
    switch (opts.task) {
      case 'agent.extract': {
        const sha = opts.images?.[0]?.sha256 ?? '';
        return okJson(fx.extractBySha.get(sha) ?? { items: [] });
      }
      case 'agent.classify': {
        const slug = /^([a-z0-9-]+) \|/mu.exec(opts.user.split('Seçebileceğin')[1] ?? '')?.[1] ?? 'kebap-izgara';
        return okJson({ cuisineSlug: slug, confidence: 0.9, priceSegment: 'orta', reason: 'fixture' });
      }
      case 'agent.recommend': {
        const cuisine = /^Mutfak türü: (.+)$/mu.exec(opts.user)?.[1] ?? '';
        return okJson(fx.recommendByCuisine.get(normalizeTr(cuisine)) ?? { items: [] });
      }
      case 'agent.options': {
        // Every requested product gets one plausible group, so the validator has something real to check.
        const items = requestedItemNames(opts.user.split('Aynı mutfaktan')[0] ?? opts.user).map((targetName) => ({
          targetName,
          optionGroups: [
            {
              name: 'Porsiyon',
              selectionType: 'single',
              isRequired: true,
              minSelect: 1,
              maxSelect: 1,
              options: [
                { name: 'Yarım', priceMode: 'sets_base' },
                { name: 'Tam', priceMode: 'sets_base' },
              ],
            },
          ],
          removableIngredients: ['Soğan'],
          extraIngredients: ['Ekstra Kaşar'],
          reason: 'fixture',
        }));
        return okJson({ items });
      }
      default:
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
