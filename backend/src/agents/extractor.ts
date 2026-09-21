import type { ProviderError } from '../ai/errors.js';
import type { AttemptRecord } from '../ai/router.js';
import type { ImageInput } from '../ai/types.js';
import { mapWithConcurrency } from '../lib/concurrency.js';
import { addTypedItems, dedupeExtracted, type MergedItem } from './dedupe.js';
import { EXTRACTOR_SCHEMA_NAME, extractedItemSchema, extractorSchema, type ExtractedItem } from './schemas/extractor.js';
import { countCalls, type AgentDeps, type AgentRunContext } from './types.js';

/**
 * Agent 1 — Extractor. Menu photo / panel screenshot → structured product list. Reading only, no recommendations.
 *
 * One image per call (long menus break JSON most often when several are inlined), three calls in flight, each
 * cached by image hash + prompt version. A failed image never fails the run: the others still land, and the
 * caller reports how many could not be read.
 */

export const EXTRACT_CONCURRENCY = 3;

export interface ExtractorInput {
  images: readonly ImageInput[];
  /** Product names the user typed or dictated ("adana, urfa, ayran"). No model call needed for these. */
  typedNames: readonly string[];
  cuisineName: string;
}

export interface ExtractorResult {
  items: MergedItem[];
  imagesRead: number;
  imagesFailed: number;
  extractedRaw: number;
  attempts: AttemptRecord[];
  provider?: string;
  model?: string;
  llmCalls: number;
  /** Set when at least one image failed; the pipeline decides whether it is fatal. */
  lastError?: ProviderError;
}

export async function runExtractor(
  deps: Pick<AgentDeps, 'extractor' | 'tracer'>,
  input: ExtractorInput,
  run: AgentRunContext,
  onProgress?: (done: number, total: number) => void,
): Promise<ExtractorResult> {
  return deps.tracer.step(
    'extractor',
    'Menü okuma',
    { images: input.images.length, typed: input.typedNames.length, cuisine: input.cuisineName },
    async () => {
      const perImage: ExtractedItem[][] = input.images.map(() => []);
      const attempts: AttemptRecord[] = [];
      let imagesFailed = 0;
      let done = 0;
      let provider: string | undefined;
      let model: string | undefined;
      let lastError: ProviderError | undefined;

      await mapWithConcurrency(input.images, EXTRACT_CONCURRENCY, async (image, index) => {
        if (run.signal.aborted) return;
        const result = await deps.extractor.extract(
          image,
          {
            task: 'agent.extract',
            systemKey: 'agent.extract.system',
            userKey: 'agent.extract.user',
            schema: extractorSchema,
            itemSchema: extractedItemSchema,
            schemaName: EXTRACTOR_SCHEMA_NAME,
            cacheNamespace: 'ax',
            vars: { cuisine: input.cuisineName || 'bilinmiyor' },
          },
          run.ctx,
        );
        attempts.push(...result.attempts);
        done += 1;
        onProgress?.(done, input.images.length);
        if (!result.ok) {
          imagesFailed += 1;
          lastError = result.error;
          return;
        }
        perImage[index] = result.items;
        if (result.provider) provider = result.provider;
        if (result.model) model = result.model;
      });

      const extractedRaw = perImage.reduce((sum, items) => sum + items.length, 0);
      const items = addTypedItems(dedupeExtracted(perImage), input.typedNames);

      return {
        value: {
          items,
          imagesRead: input.images.length - imagesFailed,
          imagesFailed,
          extractedRaw,
          attempts,
          llmCalls: countCalls(attempts),
          ...(provider ? { provider } : {}),
          ...(model ? { model } : {}),
          ...(lastError ? { lastError } : {}),
        },
        status: imagesFailed > 0 && imagesFailed === input.images.length && input.typedNames.length === 0 ? ('failed' as const) : ('ok' as const),
        // Cached images made no call, so they add nothing here; tokens come from the attempts themselves.
        attempts,
        output: { unique: items.length, extractedRaw, imagesFailed, names: items.slice(0, 40).map((i) => i.name) },
        ...(lastError ? { error: `${lastError.kind}: ${lastError.message}` } : {}),
      };
    },
  );
}
