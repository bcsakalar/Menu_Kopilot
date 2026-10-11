/**
 * Single source of truth for every provider model ID, its capabilities and the default task routing.
 * Nothing else in the codebase hard-codes a model ID. DEFAULT_ROUTES seed the `provider_configs`
 * table; at runtime routing is read from the DB so it can be changed from the app settings.
 * See docs/PROVIDER_NOTES.md for the sources of these numbers.
 */

export type ProviderName = 'gemini' | 'groq';

/**
 * Every task a model is called for. The six pipeline steps have one key each except the two deterministic ones
 * (Gap Analyst, and the Validator whose key only serves its single repair round). The pre-agent keys
 * (vision.*, text.*, deep.analyze, research.web) are retired; their old usage rows are still labelled through
 * LEGACY_TASK_LABELS.
 */
export const TASK_KEYS = [
  'agent.extract',
  'agent.classify',
  'agent.recommend',
  'agent.options',
  'agent.validate',
  'embed',
  'audio.transcribe',
] as const;
export type TaskKey = (typeof TASK_KEYS)[number];

export function isTaskKey(value: string): value is TaskKey {
  return (TASK_KEYS as readonly string[]).includes(value);
}

export const MODELS = {
  geminiFlash: 'gemini-3.8-flash',
  geminiFlashLite: 'gemini-3.5-flash-lite',
  geminiPro: 'gemini-3.1-pro-preview',
  geminiEmbedding: 'gemini-embedding-2',
  groqGptOss120b: 'openai/gpt-oss-120b',
  groqGptOss20b: 'openai/gpt-oss-20b',
  groqQwen38: 'qwen/qwen3.8-27b',
  groqWhisperTurbo: 'whisper-large-v3-turbo',
  groqWhisper: 'whisper-large-v3',
} as const;

/**
 * json_schema : provider enforces a (sanitized) JSON schema (Gemini response_format)
 * strict      : Groq json_schema with strict: true (constrained decoding)
 * json_object : JSON mode only; schema is described in the prompt and validated by Zod
 */
export type StructuredMode = 'json_schema' | 'strict' | 'json_object' | 'none';

export type ImageTokenRule =
  | { kind: 'tiles'; tileSize: number; tokensPerTile: number; smallMaxSide: number }
  | { kind: 'flat'; tokensPerImage: number };

export interface ModelSpec {
  id: string;
  provider: ProviderName;
  label: string;
  kind: 'chat' | 'embedding' | 'audio';
  vision: boolean;
  maxImages: number;
  /** Max total request size when images are inlined. */
  maxRequestBytes: number;
  imageTokens: ImageTokenRule | null;
  structured: StructuredMode;
  /** Preview models may disappear without notice → never the only entry of a chain. */
  preview: boolean;
  maxOutputTokens: number;
  /**
   * Groq only — how reasoning text is suppressed: gpt-oss models take `include_reasoning: false`,
   * other reasoning models take `reasoning_format: "hidden"`.
   */
  reasoningControl?: 'include_reasoning' | 'reasoning_format';
}

const MB = 1024 * 1024;
const GEMINI_IMAGE_TOKENS: ImageTokenRule = { kind: 'tiles', tileSize: 768, tokensPerTile: 258, smallMaxSide: 384 };
const GROQ_IMAGE_TOKENS: ImageTokenRule = { kind: 'flat', tokensPerImage: 2048 };

export const MODEL_CATALOG: Readonly<Record<string, ModelSpec>> = {
  [MODELS.geminiFlash]: {
    id: MODELS.geminiFlash,
    provider: 'gemini',
    label: 'Gemini 3.8 Flash',
    kind: 'chat',
    vision: true,
    maxImages: 3600,
    maxRequestBytes: 20 * MB,
    imageTokens: GEMINI_IMAGE_TOKENS,
    structured: 'json_schema',
    preview: false,
    maxOutputTokens: 65_536,
  },
  [MODELS.geminiFlashLite]: {
    id: MODELS.geminiFlashLite,
    provider: 'gemini',
    label: 'Gemini 3.5 Flash-Lite',
    kind: 'chat',
    vision: true,
    maxImages: 3600,
    maxRequestBytes: 20 * MB,
    imageTokens: GEMINI_IMAGE_TOKENS,
    structured: 'json_schema',
    preview: false,
    maxOutputTokens: 65_536,
  },
  [MODELS.geminiPro]: {
    id: MODELS.geminiPro,
    provider: 'gemini',
    label: 'Gemini 3.1 Pro (preview)',
    kind: 'chat',
    vision: true,
    maxImages: 3600,
    maxRequestBytes: 20 * MB,
    imageTokens: GEMINI_IMAGE_TOKENS,
    structured: 'json_schema',
    preview: true,
    maxOutputTokens: 65_536,
  },
  [MODELS.geminiEmbedding]: {
    id: MODELS.geminiEmbedding,
    provider: 'gemini',
    label: 'Gemini Embedding 2',
    kind: 'embedding',
    vision: false,
    maxImages: 0,
    maxRequestBytes: 20 * MB,
    imageTokens: null,
    structured: 'none',
    preview: false,
    maxOutputTokens: 0,
  },
  [MODELS.groqGptOss120b]: {
    id: MODELS.groqGptOss120b,
    provider: 'groq',
    label: 'GPT-OSS 120B (Groq)',
    kind: 'chat',
    vision: false,
    maxImages: 0,
    maxRequestBytes: 20 * MB,
    imageTokens: null,
    structured: 'strict',
    preview: false,
    maxOutputTokens: 65_536,
    reasoningControl: 'include_reasoning',
  },
  [MODELS.groqGptOss20b]: {
    id: MODELS.groqGptOss20b,
    provider: 'groq',
    label: 'GPT-OSS 20B (Groq)',
    kind: 'chat',
    vision: false,
    maxImages: 0,
    maxRequestBytes: 20 * MB,
    imageTokens: null,
    structured: 'strict',
    preview: false,
    maxOutputTokens: 65_536,
    reasoningControl: 'include_reasoning',
  },
  [MODELS.groqQwen38]: {
    id: MODELS.groqQwen38,
    provider: 'groq',
    label: 'Qwen 3.8 27B Vision (Groq, preview)',
    kind: 'chat',
    vision: true,
    maxImages: 3,
    maxRequestBytes: 20 * MB,
    imageTokens: GROQ_IMAGE_TOKENS,
    structured: 'strict',
    preview: true,
    maxOutputTokens: 16_384,
    reasoningControl: 'reasoning_format',
  },
  [MODELS.groqWhisperTurbo]: {
    id: MODELS.groqWhisperTurbo,
    provider: 'groq',
    label: 'Whisper Large v3 Turbo (Groq)',
    kind: 'audio',
    vision: false,
    maxImages: 0,
    // Free tier upload limit (dev tier: 100 MB).
    maxRequestBytes: 25 * MB,
    imageTokens: null,
    structured: 'none',
    preview: false,
    maxOutputTokens: 0,
  },
  [MODELS.groqWhisper]: {
    id: MODELS.groqWhisper,
    provider: 'groq',
    label: 'Whisper Large v3 (Groq)',
    kind: 'audio',
    vision: false,
    maxImages: 0,
    maxRequestBytes: 25 * MB,
    imageTokens: null,
    structured: 'none',
    preview: false,
    maxOutputTokens: 0,
  },
};

export function getModelSpec(modelId: string): ModelSpec | undefined {
  return MODEL_CATALOG[modelId];
}

/** Provider-neutral call parameters stored in provider_configs.params (adapters map what they support). */
export interface RouteParams {
  maxOutputTokens?: number;
  /** Gemini 3: minimal | low | medium | high */
  thinkingLevel?: string;
  /** Groq: gpt-oss low|medium|high; qwen3.8 none|default|low|medium|high */
  reasoningEffort?: string;
  temperature?: number;
  /** Embeddings only. */
  dim?: number;
}

export interface RouteEntry {
  provider: ProviderName;
  model: string;
  params: RouteParams;
}

// Measured with real keys (D-141): Flash-Lite reads a 15-item menu in ~3 s, 3.8 Flash needs 13-20 s and is often
// overloaded on the free tier, so it is the last resort. Groq's free tier allows qwen3.8 1000 output tokens per
// minute and rejects any request asking for more.
const visionChain: RouteEntry[] = [
  { provider: 'gemini', model: MODELS.geminiFlashLite, params: { thinkingLevel: 'low', maxOutputTokens: 4096 } },
  { provider: 'groq', model: MODELS.groqQwen38, params: { reasoningEffort: 'none', maxOutputTokens: 1000 } },
  { provider: 'gemini', model: MODELS.geminiFlash, params: { thinkingLevel: 'low', maxOutputTokens: 4096 } },
];

const cheapTextChain: RouteEntry[] = [
  { provider: 'gemini', model: MODELS.geminiFlashLite, params: { thinkingLevel: 'low', maxOutputTokens: 2048 } },
  { provider: 'groq', model: MODELS.groqGptOss20b, params: { reasoningEffort: 'low', maxOutputTokens: 2048 } },
];

export const DEFAULT_ROUTES: Readonly<Record<TaskKey, readonly RouteEntry[]>> = {
  // --- Agent pipeline (Faz 8) ----------------------------------------------------------------------------------
  // Model per agent: mechanical work on a small model, judgement on a strong one. The chains stay editable from
  // Ayarlar > Modeller, so the Gemini/Groq split remains the user's choice.
  'agent.extract': visionChain,
  'agent.classify': [
    { provider: 'gemini', model: MODELS.geminiFlashLite, params: { thinkingLevel: 'minimal', maxOutputTokens: 1024 } },
    { provider: 'groq', model: MODELS.groqGptOss20b, params: { reasoningEffort: 'low', maxOutputTokens: 1024 } },
  ],
  // Recommendation quality is the whole point of the redesign: strongest model first.
  'agent.recommend': [
    // D-198: low effort. With medium, six products with their options ran past the 8 s attempt on both providers
    // (the reasoning tokens also eat Groq's free 8 K tokens a minute); the kitchen brief does the thinking now.
    { provider: 'groq', model: MODELS.groqGptOss120b, params: { reasoningEffort: 'low', maxOutputTokens: 8000 } },
    // Flash-Lite before Flash: measured on production, Flash needed more than the 8 s attempt for six products with
    // their options even at low thinking, so a rate-limited Groq left the run to the pool; Flash-Lite answers in 2-4 s.
    { provider: 'gemini', model: MODELS.geminiFlashLite, params: { thinkingLevel: 'low', maxOutputTokens: 8000 } },
    { provider: 'gemini', model: MODELS.geminiFlash, params: { thinkingLevel: 'low', maxOutputTokens: 8000 } },
  ],
  // Option groups are long output but a well-understood shape: low reasoning, high token ceiling.
  'agent.options': [
    { provider: 'groq', model: MODELS.groqGptOss120b, params: { reasoningEffort: 'low', maxOutputTokens: 12_000 } },
    { provider: 'gemini', model: MODELS.geminiFlash, params: { thinkingLevel: 'low', maxOutputTokens: 12_000 } },
    { provider: 'gemini', model: MODELS.geminiFlashLite, params: { thinkingLevel: 'low', maxOutputTokens: 12_000 } },
  ],
  // Only ever used for the single repair round after invalid JSON.
  'agent.validate': cheapTextChain,
  embed: [{ provider: 'gemini', model: MODELS.geminiEmbedding, params: { dim: 768 } }],
  // Voice notes (Faz 7): turbo is faster and cheaper; v3 is the fallback.
  'audio.transcribe': [
    { provider: 'groq', model: MODELS.groqWhisperTurbo, params: {} },
    { provider: 'groq', model: MODELS.groqWhisper, params: {} },
  ],
};

export const EMBEDDING = { model: MODELS.geminiEmbedding, dim: 768 } as const;

/** Per-attempt timeouts. Slow attempts fall through to the next provider in the chain. */
export const TASK_TIMEOUT_MS: Readonly<Record<TaskKey, number>> = {
  // Under the 15 s end-to-end budget. Measured with real keys: a healthy recommend call answers in 2–3 s, so a 6 s
  // ceiling only cuts off a provider that is already failing and leaves the pipeline deadline (RECOMMEND_DEADLINE_MS,
  // 11 s over both recommendation agents) room for one fallback.
  'agent.extract': 18_000,
  // D-185. Measured on the eval matrix: the first (Gemini) attempt at classification timed out at 6 s in 49 of 91 runs and
  // the Groq fallback answered in ~0.5 s. A healthy Flash-Lite answers a classification well inside 3 s.
  'agent.classify': 3_000,
  'agent.recommend': 6_000,
  'agent.options': 6_000,
  'agent.validate': 8_000,
  embed: 15_000,
  'audio.transcribe': 30_000,
};

/** Models a user may pick per task in the settings screen (capability-filtered). */
export function eligibleModels(task: TaskKey): ModelSpec[] {
  const specs = Object.values(MODEL_CATALOG);
  if (task === 'embed') return specs.filter((s) => s.kind === 'embedding');
  if (task === 'audio.transcribe') return specs.filter((s) => s.kind === 'audio');
  if (task === 'agent.extract') return specs.filter((s) => s.kind === 'chat' && s.vision);
  return specs.filter((s) => s.kind === 'chat');
}
