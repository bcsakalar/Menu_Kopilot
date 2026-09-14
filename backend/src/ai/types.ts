import type { ZodType } from 'zod';
import type { ProviderName, RouteParams, TaskKey } from '../config/models.js';
import type { ProviderError } from './errors.js';
import type { RateLimitSnapshot } from './rate-limit.js';

export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'image/heif';

export interface ImageInput {
  data: Buffer;
  mimeType: ImageMimeType;
  sha256: string;
  width?: number;
  height?: number;
}

export interface GenerateStructuredOptions<T> {
  task: TaskKey;
  /** Schema the parsed output is validated against (may be lenient, e.g. `{ items: unknown[] }`). */
  schema: ZodType<T>;
  system: string;
  user: string;
  images?: readonly ImageInput[];
  maxTokens?: number;
  // --- optional extensions (the spec signature above stays intact for future adapters, e.g. Ollama) ---
  /** Schema advertised to the provider for constrained decoding; defaults to `schema`. */
  providerSchema?: ZodType;
  /** Name for providers that require one (Groq json_schema.name). */
  schemaName?: string;
  model?: string;
  params?: RouteParams;
  /** Pre-rendered "answer only with this JSON schema" text for JSON-mode-only models. */
  jsonInstructions?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface CallMeta {
  provider: ProviderName;
  model: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  rateLimit?: RateLimitSnapshot;
}

export type Result<T> =
  | { ok: true; value: T; raw: string; meta: CallMeta }
  | { ok: false; error: ProviderError; meta: CallMeta };

export interface ProviderCapabilities {
  vision: boolean;
  json: boolean;
  maxImages: number;
  maxImageBytes: number;
}

export interface EmbedOptions {
  dim?: number;
  model?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Provider-agnostic LLM interface (Gemini, Groq today; an Ollama adapter can implement the same). */
export interface LLMProvider {
  name: ProviderName;
  generateStructured<T>(opts: GenerateStructuredOptions<T>): Promise<Result<T>>;
  /** Throws ProviderError on failure. */
  embed(texts: string[], opts?: EmbedOptions): Promise<number[][]>;
  capabilities: ProviderCapabilities;
  /** False when the API key is missing — the router skips the provider. */
  isConfigured(): boolean;
}
