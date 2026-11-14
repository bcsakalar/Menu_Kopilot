import type { AppConfig } from '../config/env.js';
import type { ProviderName } from '../config/models.js';
import type { Database } from '../db/client.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { PromptRepository } from './prompt-repository.js';
import { GeminiProvider } from './providers/gemini.provider.js';
import { GroqProvider } from './providers/groq.provider.js';
import { CallPacer, CooldownTracker } from './rate-limit.js';
import { RouteRepository } from './route-repository.js';
import { AiRouter } from './router.js';
import type { LLMProvider } from './types.js';
import { QuotaService, UsageLogger } from './usage.js';

export interface AiServices {
  router: AiRouter;
  prompts: PromptRepository;
  routes: RouteRepository;
  quota: QuotaService;
  usage: UsageLogger;
  providers: Partial<Record<ProviderName, LLMProvider>>;
  breaker: CircuitBreaker;
  cooldowns: CooldownTracker;
  pacer: CallPacer;
}

export interface AiOverrides {
  providers?: Partial<Record<ProviderName, LLMProvider>>;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
  now?: () => number;
  onUsageError?: (err: unknown) => void;
}

export function createAiServices(config: AppConfig, db: Database, overrides: AiOverrides = {}): AiServices {
  const now = overrides.now ?? (() => Date.now());
  const providers: Partial<Record<ProviderName, LLMProvider>> = overrides.providers ?? {
    gemini: new GeminiProvider({ apiKey: config.providers.geminiApiKey }),
    groq: new GroqProvider({ apiKey: config.providers.groqApiKey }),
  };
  const prompts = new PromptRepository(db);
  const routes = new RouteRepository(db);
  const usage = new UsageLogger(db, overrides.onUsageError);
  const quota = new QuotaService(db, config.quota, () => new Date(now()));
  const breaker = new CircuitBreaker({ now });
  const cooldowns = new CooldownTracker(now);
  const pacer = new CallPacer(now);
  const router = new AiRouter({
    providers,
    routes,
    breaker,
    cooldowns,
    pacer,
    usage,
    quota,
    prompts,
    localOnly: config.providers.localOnlyMode,
    ...(overrides.sleep ? { sleep: overrides.sleep } : {}),
    ...(overrides.random ? { random: overrides.random } : {}),
  });
  return { router, prompts, routes, quota, usage, providers, breaker, cooldowns, pacer };
}

export type { LLMProvider } from './types.js';
