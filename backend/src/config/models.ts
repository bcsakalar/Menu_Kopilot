/**
 * Single source of truth for every provider model ID, its capabilities and the default task routing.
 * Nothing else in the codebase hard-codes a model ID. DEFAULT_ROUTES seed the `provider_configs`
 * table; at runtime routing is read from the DB so it can be changed from the app settings.
 * See docs/PROVIDER_NOTES.md for the sources of these numbers.
 */

export type ProviderName = 'gemini' | 'groq';

export const TASK_KEYS = [
  'vision.menu_extract',
  'vision.panel_extract',
  'text.item_enrich',
  'text.normalize_classify',
  'text.gap_suggest',
  'deep.analyze',
  'embed',
  'audio.transcribe',
  'research.web',
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
  groqQwen36: 'qwen/qwen3.6-27b',
  groqWhisperTurbo: 'whisper-large-v3-turbo',
  groqWhisper: 'whisper-large-v3',
  groqCompound: 'groq/compound',
  groqCompoundMini: 'groq/compound-mini',
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
  /** compound = Groq agentic system with server-side web search (only for research). */
  kind: 'chat' | 'embedding' | 'audio' | 'compound';
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
  [MODELS.groqQwen36]: {
    id: MODELS.groqQwen36,
    provider: 'groq',
    label: 'Qwen 3.6 27B Vision (Groq, preview)',
    kind: 'chat',
    vision: true,
    maxImages: 5,
    maxRequestBytes: 20 * MB,
    imageTokens: GROQ_IMAGE_TOKENS,
    structured: 'json_object',
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
  [MODELS.groqCompound]: {
    id: MODELS.groqCompound,
    provider: 'groq',
    label: 'Compound (Groq, web araması)',
    kind: 'compound',
    vision: false,
    maxImages: 0,
    maxRequestBytes: 20 * MB,
    imageTokens: null,
    structured: 'json_object',
    preview: false,
    maxOutputTokens: 8192,
  },
  [MODELS.groqCompoundMini]: {
    id: MODELS.groqCompoundMini,
    provider: 'groq',
    label: 'Compound Mini (Groq, tek arama, hızlı)',
    kind: 'compound',
    vision: false,
    maxImages: 0,
    maxRequestBytes: 20 * MB,
    imageTokens: null,
    structured: 'json_object',
    preview: false,
    maxOutputTokens: 8192,
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
  /** Groq: gpt-oss low|medium|high; qwen3.6 none|default; qwen3.8 none|default|low|medium|high */
  reasoningEffort?: string;
  temperature?: number;
  /** Embeddings only. */
  dim?: number;
  /** Groq compound only: built-in tools the system may use (`compound_custom.tools.enabled_tools`). */
  enabledTools?: string[];
}

export interface RouteEntry {
  provider: ProviderName;
  model: string;
  params: RouteParams;
}

const visionChain: RouteEntry[] = [
  { provider: 'gemini', model: MODELS.geminiFlash, params: { thinkingLevel: 'low', maxOutputTokens: 4096 } },
  { provider: 'groq', model: MODELS.groqQwen38, params: { reasoningEffort: 'none', maxOutputTokens: 4096 } },
  { provider: 'groq', model: MODELS.groqQwen36, params: { reasoningEffort: 'none', maxOutputTokens: 4096 } },
];

const cheapTextChain: RouteEntry[] = [
  { provider: 'gemini', model: MODELS.geminiFlashLite, params: { thinkingLevel: 'low', maxOutputTokens: 2048 } },
  { provider: 'groq', model: MODELS.groqGptOss20b, params: { reasoningEffort: 'low', maxOutputTokens: 2048 } },
];

export const DEFAULT_ROUTES: Readonly<Record<TaskKey, readonly RouteEntry[]>> = {
  'vision.menu_extract': visionChain,
  'vision.panel_extract': visionChain,
  'text.item_enrich': [
    { provider: 'groq', model: MODELS.groqGptOss120b, params: { reasoningEffort: 'low', maxOutputTokens: 16_000 } },
    { provider: 'gemini', model: MODELS.geminiFlash, params: { thinkingLevel: 'low', maxOutputTokens: 16_000 } },
  ],
  'text.normalize_classify': cheapTextChain,
  'text.gap_suggest': cheapTextChain,
  'deep.analyze': [
    { provider: 'gemini', model: MODELS.geminiPro, params: { thinkingLevel: 'high', maxOutputTokens: 24_000 } },
    { provider: 'gemini', model: MODELS.geminiFlash, params: { thinkingLevel: 'medium', maxOutputTokens: 16_000 } },
  ],
  embed: [{ provider: 'gemini', model: MODELS.geminiEmbedding, params: { dim: 768 } }],
  // Voice notes (Faz 7): turbo is faster and cheaper; v3 is the fallback.
  'audio.transcribe': [
    { provider: 'groq', model: MODELS.groqWhisperTurbo, params: {} },
    { provider: 'groq', model: MODELS.groqWhisper, params: {} },
  ],
  // Restaurant research (Faz 7): web search + reading pages only (no code execution / Wolfram).
  'research.web': [
    { provider: 'groq', model: MODELS.groqCompound, params: { maxOutputTokens: 4096, enabledTools: ['web_search', 'visit_website'] } },
    { provider: 'groq', model: MODELS.groqCompoundMini, params: { maxOutputTokens: 4096, enabledTools: ['web_search'] } },
  ],
};

export const EMBEDDING = { model: MODELS.geminiEmbedding, dim: 768 } as const;

/** Per-attempt timeouts. Slow attempts fall through to the next provider in the chain. */
export const TASK_TIMEOUT_MS: Readonly<Record<TaskKey, number>> = {
  'vision.menu_extract': 30_000,
  'vision.panel_extract': 20_000,
  'text.item_enrich': 60_000,
  'text.normalize_classify': 15_000,
  'text.gap_suggest': 20_000,
  'deep.analyze': 120_000,
  embed: 15_000,
  'audio.transcribe': 30_000,
  // Web search + reading pages takes a while; the phone shows a progress state.
  'research.web': 90_000,
};

/** Models a user may pick per task in the settings screen (capability-filtered). */
export function eligibleModels(task: TaskKey): ModelSpec[] {
  const specs = Object.values(MODEL_CATALOG);
  if (task === 'embed') return specs.filter((s) => s.kind === 'embedding');
  if (task === 'audio.transcribe') return specs.filter((s) => s.kind === 'audio');
  if (task === 'research.web') return specs.filter((s) => s.kind === 'compound');
  if (task.startsWith('vision.')) return specs.filter((s) => s.kind === 'chat' && s.vision);
  return specs.filter((s) => s.kind === 'chat');
}
