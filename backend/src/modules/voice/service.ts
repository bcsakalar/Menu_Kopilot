import { desc, eq, sql } from 'drizzle-orm';
import { providerFailure } from '../../ai/errors.js';
import type { PromptRepository } from '../../ai/prompt-repository.js';
import type { AiRouter } from '../../ai/router.js';
import type { AudioInput } from '../../ai/types.js';
import { type Cache, getJson, setJson } from '../../cache/cache.js';
import type { Database } from '../../db/client.js';
import { menuItems } from '../../db/schema/index.js';
import { sha256Hex } from '../../lib/images.js';
import { stripPriceAmounts } from '../../lib/price-guard.js';
import { parsePromptItems } from '../suggest/prompt-parse.js';
import { type StoredTranscription, type TranscriptionDto, storedTranscriptionSchema } from './schemas.js';

/** Whisper's prompt is limited to 224 tokens; ~600 characters of Turkish names stay well inside it. */
const VOCABULARY_CHARS = 600;
const VOCABULARY_NAMES = 40;

/**
 * Voice notes (Faz 7): a short recording → text (Groq Whisper) → product names, so the specialist can dictate
 * during a call instead of typing. The recording is never stored — only its hash, for the cache.
 */
export class VoiceService {
  constructor(
    private readonly deps: {
      db: Database;
      router: AiRouter;
      prompts: PromptRepository;
      cache: Cache;
      ttlSeconds: number;
    },
  ) {}

  /** Template names as recognition hints: the given cuisine first, then the most important templates overall. */
  private async vocabulary(cuisineId: string | undefined): Promise<string> {
    const rows = await this.deps.db
      .select({ name: menuItems.canonicalName })
      .from(menuItems)
      .where(eq(menuItems.approved, true))
      .orderBy(
        ...(cuisineId ? [desc(sql`${menuItems.cuisineId} = ${cuisineId}`)] : []),
        desc(menuItems.importance),
        desc(menuItems.usageCount),
      )
      .limit(VOCABULARY_NAMES);
    const names: string[] = [];
    let length = 0;
    for (const { name } of rows) {
      if (length + name.length + 2 > VOCABULARY_CHARS) break;
      names.push(name);
      length += name.length + 2;
    }
    return names.join(', ');
  }

  async transcribe(
    userId: string,
    audio: AudioInput,
    options: { language: string; cuisineId?: string | undefined },
  ): Promise<TranscriptionDto> {
    const prompt = (await this.deps.prompts.render('transcribe.vocabulary', { names: await this.vocabulary(options.cuisineId) })).text;
    const key = `mk:t:${audio.sha256}:${sha256Hex(`${options.language}|${prompt}`).slice(0, 16)}`;
    let stored = await getJson(this.deps.cache, key, storedTranscriptionSchema);
    const cached = stored !== undefined;
    if (!stored) {
      const result = await this.deps.router.transcribe(audio, { language: options.language, prompt }, { userId });
      if (!result.ok) throw providerFailure(result.error, 'Sesli not');
      const next: StoredTranscription = {
        // The specialist dictates products; amounts said aloud are never carried into cards.
        text: stripPriceAmounts(result.value.text).replace(/\s+/g, ' ').trim(),
        language: result.value.language ?? null,
        durationSec: result.value.durationSec ?? null,
        provider: result.provider,
        model: result.model,
      };
      await setJson(this.deps.cache, key, next, this.deps.ttlSeconds);
      stored = next;
    }
    return {
      ...stored,
      items: parsePromptItems(stored.text).map((item) => item.rawName),
      cached,
    };
  }
}
