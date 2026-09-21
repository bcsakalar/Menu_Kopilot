import type { ProviderError } from '../ai/errors.js';
import type { PromptRepository } from '../ai/prompt-repository.js';
import type { AiRouter, AttemptRecord, CallContext } from '../ai/router.js';
import type { Cache } from '../cache/cache.js';
import type { Database } from '../db/client.js';
import type { CategoryIndex } from '../domain/category.js';
import type { RetrievalService } from '../modules/retrieval/retrieval.service.js';
import type { VisionExtractor } from '../modules/extraction/vision-extractor.js';
import type { AgentTracer } from './tracer.js';

/** The six pipeline steps, in order. Also the `agent_steps.agent` values and the debug screen's row labels. */
export const AGENT_NAMES = [
  'extractor',
  'classifier',
  'gap_analyst',
  'product_recommender',
  'option_modifier',
  'validator',
] as const;
export type AgentName = (typeof AGENT_NAMES)[number];

export const AGENT_LABELS: Readonly<Record<AgentName, string>> = {
  extractor: 'Menü okuma',
  classifier: 'Mutfak türü',
  gap_analyst: 'Eksik analizi',
  product_recommender: 'Yeni ürün önerisi',
  option_modifier: 'Opsiyon & malzeme',
  validator: 'Doğrulama',
};

/** Everything an agent may reach for. Agents never touch Fastify, SSE or the store directly. */
export interface AgentDeps {
  db: Database;
  router: AiRouter;
  prompts: PromptRepository;
  retrieval: RetrievalService;
  cache: Cache;
  cacheTtlSeconds: number;
  categories: CategoryIndex;
  extractor: VisionExtractor;
  tracer: AgentTracer;
}

export interface AgentRunContext {
  runId: string;
  userId: string;
  ctx: CallContext;
  signal: AbortSignal;
}

/**
 * Agents never throw for an expected failure: a partial pipeline must keep going. `ok:false` carries the reason
 * so the orchestrator can decide between "show what we have" and "tell the user AI is off".
 */
export type AgentOutcome<T> =
  | { ok: true; value: T; attempts: AttemptRecord[]; provider?: string; model?: string; llmCalls: number }
  | { ok: false; error: ProviderError; attempts: AttemptRecord[]; llmCalls: number };

/**
 * Attempts that actually reached a provider. A chain skipped for a missing key, an open circuit or a cooldown
 * is not a model call, and must not be billed to the user as one.
 */
export function countCalls(attempts: readonly AttemptRecord[]): number {
  return attempts.filter((a) => a.outcome !== 'skipped').length;
}

/** A product the restaurant already sells, after extraction/typing and template matching. */
export interface ExistingItem {
  rawName: string;
  normalized: string;
  /** Canonical name of the matched template, when one matched. */
  canonicalName: string | null;
  matchedTemplateId: string | null;
  categoryKey: string;
  sectionText: string | null;
  /** From a panel screenshot: does the product already have a description / options / removables? */
  hasDescription: 'present' | 'absent' | 'unknown';
  hasOptions: 'present' | 'absent' | 'unknown';
  hasRemovables: 'present' | 'absent' | 'unknown';
  /** Typed or dictated by the user rather than read from an image — its panel fields say nothing. */
  typed: boolean;
  /** How many of the supplied images showed it (overlapping scrolls count once). */
  seenIn: number;
  priceText: string | null;
  /** Option group names visible on the panel screenshot — context for the Option/Modifier agent. */
  optionNames: string[];
  /** Heading and name disagree on the category (see CategoryIndex.conflict) — a "yanlış kategori" question. */
  categoryConflict: { section: string; name: string } | null;
}
