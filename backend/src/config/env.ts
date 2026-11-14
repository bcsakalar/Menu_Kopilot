import { z } from 'zod';

/**
 * The only module allowed to read process.env. Everything else receives a typed AppConfig.
 */

export const DEV_JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me-0123456789';
export const DEV_ADMIN_PASSWORD = 'change-me-now';

const bool = z.stringbool({ truthy: ['true', '1', 'yes', 'on'], falsy: ['false', '0', 'no', 'off', ''] });

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    TRUST_PROXY: bool.default(true),
    ROLE: z.enum(['api', 'worker', 'all']).default('all'),

    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

    JWT_SECRET: z.string().min(32).default(DEV_JWT_SECRET),
    JWT_ACCESS_TTL: z.string().default('12h'),

    ADMIN_EMAIL: z.email().default('admin@menukopilot.local'),
    ADMIN_PASSWORD: z.string().min(8).default(DEV_ADMIN_PASSWORD),
    ADMIN_NAME: z.string().min(1).default('Admin'),
    SEED_ON_START: bool.default(false),

    GEMINI_API_KEY: z.string().optional(),
    GROQ_API_KEY: z.string().optional(),
    LOCAL_ONLY_MODE: bool.default(false),

    /**
     * Per rep and day (D-216). The busiest rep so far made 23 analyses and 72 calls in a day; an analysis takes about
     * 3.5 calls and 9 000 tokens. 1000 calls and 5 M tokens are a whole day of calls for anyone.
     */
    DAILY_LLM_CALL_QUOTA: z.coerce.number().int().min(0).default(1000),
    DAILY_TOKEN_QUOTA: z.coerce.number().int().min(0).default(5_000_000),
    /**
     * The whole site's ceiling: a cleared cookie gets a fresh per-visitor quota, this it cannot reset. It is shared by
     * every rep, so it sits above what the free tiers serve in a day: there it never binds before the providers do.
     * With billing on it is the spending ceiling (D-216).
     */
    GLOBAL_DAILY_LLM_CALL_QUOTA: z.coerce.number().int().min(0).default(10_000),
    QUOTA_TIMEZONE: z.string().default('Europe/Istanbul'),
    REQUEST_MAX_LLM_CALLS: z.coerce.number().int().min(1).default(6),
    REQUEST_MAX_INPUT_TOKENS: z.coerce.number().int().min(1000).default(25_000),

    RETRIEVAL_TRGM_THRESHOLD: z.coerce.number().min(0).max(1).default(0.72),
    RETRIEVAL_VECTOR_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),
    CACHE_TTL_DAYS: z.coerce.number().int().min(1).default(30),

    UPLOAD_MAX_FILES: z.coerce.number().int().min(1).max(10).default(5),
    UPLOAD_MAX_FILE_MB: z.coerce.number().min(0.5).max(20).default(8),

    /** Analyses that run at once in one API process; the rest wait their turn (D-214). */
    ANALYSIS_CONCURRENCY: z.coerce.number().int().min(1).max(200).default(10),
    /** Analyses that may wait for a slot; one more is told the site is busy. */
    ANALYSIS_QUEUE_MAX: z.coerce.number().int().min(0).max(1000).default(50),
    /** ntfy topic URL for load alerts (slow analyses, failing providers, a full queue). Empty: no alerts. */
    ALERT_NTFY_URL: z.url().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (env.JWT_SECRET === DEV_JWT_SECRET) {
      ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'Set a real JWT_SECRET in production' });
    }
    if (env.ADMIN_PASSWORD === DEV_ADMIN_PASSWORD) {
      ctx.addIssue({ code: 'custom', path: ['ADMIN_PASSWORD'], message: 'Set a real ADMIN_PASSWORD in production' });
    }
  });

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  nodeEnv: Env['NODE_ENV'];
  host: string;
  port: number;
  logLevel: Env['LOG_LEVEL'];
  trustProxy: boolean;
  role: Env['ROLE'];
  databaseUrl: string;
  redisUrl: string;
  auth: {
    jwtSecret: string;
    accessTtl: string;
  };
  admin: { email: string; password: string; name: string };
  seedOnStart: boolean;
  providers: {
    geminiApiKey: string | undefined;
    groqApiKey: string | undefined;
    localOnlyMode: boolean;
  };
  quota: {
    dailyCalls: number;
    dailyTokens: number;
    globalDailyCalls: number;
    timezone: string;
  };
  budget: {
    maxLlmCalls: number;
    maxInputTokens: number;
  };
  retrieval: {
    trigramThreshold: number;
    vectorThreshold: number;
  };
  cacheTtlSeconds: number;
  uploads: {
    maxFiles: number;
    maxFileBytes: number;
  };
  analysis: {
    concurrency: number;
    queueMax: number;
  };
  alertNtfyUrl: string | undefined;
}

const emptyToUndefined = (value: string | undefined): string | undefined =>
  value === undefined || value.trim() === '' ? undefined : value.trim();

export function parseEnv(source: Record<string, string | undefined>): AppConfig {
  // Empty values (e.g. `JWT_SECRET=` copied from .env.example) mean "not set" → defaults/validation apply.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1].trim() !== ''),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  const env = result.data;
  return {
    nodeEnv: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    trustProxy: env.TRUST_PROXY,
    role: env.ROLE,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    auth: {
      jwtSecret: env.JWT_SECRET,
      accessTtl: env.JWT_ACCESS_TTL,
    },
    admin: { email: env.ADMIN_EMAIL.toLowerCase(), password: env.ADMIN_PASSWORD, name: env.ADMIN_NAME },
    seedOnStart: env.SEED_ON_START,
    providers: {
      geminiApiKey: emptyToUndefined(env.GEMINI_API_KEY),
      groqApiKey: emptyToUndefined(env.GROQ_API_KEY),
      localOnlyMode: env.LOCAL_ONLY_MODE,
    },
    quota: {
      dailyCalls: env.DAILY_LLM_CALL_QUOTA,
      dailyTokens: env.DAILY_TOKEN_QUOTA,
      globalDailyCalls: env.GLOBAL_DAILY_LLM_CALL_QUOTA,
      timezone: env.QUOTA_TIMEZONE,
    },
    budget: {
      maxLlmCalls: env.REQUEST_MAX_LLM_CALLS,
      maxInputTokens: env.REQUEST_MAX_INPUT_TOKENS,
    },
    retrieval: {
      trigramThreshold: env.RETRIEVAL_TRGM_THRESHOLD,
      vectorThreshold: env.RETRIEVAL_VECTOR_THRESHOLD,
    },
    cacheTtlSeconds: env.CACHE_TTL_DAYS * 24 * 60 * 60,
    uploads: {
      maxFiles: env.UPLOAD_MAX_FILES,
      maxFileBytes: Math.round(env.UPLOAD_MAX_FILE_MB * 1024 * 1024),
    },
    analysis: {
      concurrency: env.ANALYSIS_CONCURRENCY,
      queueMax: env.ANALYSIS_QUEUE_MAX,
    },
    alertNtfyUrl: emptyToUndefined(env.ALERT_NTFY_URL),
  };
}

/** Names of all supported variables — kept in sync with .env.example by a test. */
export const ENV_KEYS = Object.keys(envSchema.shape) as ReadonlyArray<keyof Env>;

export function loadConfig(): AppConfig {
  return parseEnv(process.env);
}
