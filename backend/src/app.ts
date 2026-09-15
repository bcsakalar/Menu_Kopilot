import { randomUUID } from 'node:crypto';
import fastifyJwt from '@fastify/jwt';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { type AiServices, createAiServices } from './ai/index.js';
import type { Cache } from './cache/cache.js';
import type { AppConfig } from './config/env.js';
import type { DbHandle } from './db/client.js';
import { EmbeddingService } from './jobs/embedding.service.js';
import { InlineJobQueue, type JobQueue } from './jobs/queue.js';
import { durationToSeconds } from './lib/duration.js';
import { AppError, type ErrorEnvelope } from './lib/errors.js';
import { loggerOptions } from './lib/logger.js';
import { authRoutes } from './modules/auth/routes.js';
import { AuthService } from './modules/auth/service.js';
import { branchRoutes } from './modules/branches/routes.js';
import { BranchService } from './modules/branches/service.js';
import { cuisineRoutes } from './modules/cuisines/routes.js';
import { CuisineService } from './modules/cuisines/service.js';
import { VisionExtractor } from './modules/extraction/vision-extractor.js';
import { GapPipeline } from './modules/gap/pipeline.js';
import { gapRoutes } from './modules/gap/routes.js';
import type { GapEvent } from './modules/gap/schemas.js';
import { GapService } from './modules/gap/service.js';
import { GapStore } from './modules/gap/store.js';
import { healthRoutes } from './modules/health/routes.js';
import { promptRoutes } from './modules/prompts/routes.js';
import { RetrievalService } from './modules/retrieval/retrieval.service.js';
import { settingsRoutes } from './modules/settings/routes.js';
import { SettingsService } from './modules/settings/service.js';
import { EnrichmentService } from './modules/suggest/enrichment.js';
import { SuggestPipeline } from './modules/suggest/pipeline.js';
import { suggestRoutes } from './modules/suggest/routes.js';
import { RunRegistry } from './modules/suggest/run-registry.js';
import type { SuggestEvent } from './modules/suggest/schemas.js';
import { SuggestService } from './modules/suggest/service.js';
import { SuggestionStore } from './modules/suggest/store.js';
import { authPlugin } from './plugins/auth.js';

export const APP_VERSION = '0.1.0';
const JWT_ISSUER = 'menu-kopilot';
const JWT_AUDIENCE = 'menu-kopilot-mobile';

export interface AppDeps {
  config: AppConfig;
  db: DbHandle;
  cache: Cache;
  /** AI services (router, prompts, routes, quota). Built from config when omitted. */
  ai?: AiServices;
  /** Background jobs (BullMQ in runtime). Defaults to running embedding jobs inline. */
  queue?: JobQueue;
  /** Overrides pino options (tests pass `false`). */
  logger?: boolean;
}

export interface AppServices {
  ai: AiServices;
  queue: JobQueue;
  embedding: EmbeddingService;
  suggest: SuggestService;
  gap: GapService;
}

declare module 'fastify' {
  interface FastifyInstance {
    services: AppServices;
  }
}

export type App = FastifyInstance;

function envelope(code: ErrorEnvelope['error']['code'], message: string, requestId: string, details?: unknown): ErrorEnvelope {
  return { error: { code, message, requestId, ...(details === undefined ? {} : { details }) } };
}

export async function buildApp(deps: AppDeps): Promise<App> {
  const { config } = deps;
  const app = Fastify({
    logger: deps.logger === false ? false : loggerOptions(config),
    trustProxy: config.trustProxy,
    bodyLimit: 2 * 1024 * 1024,
    genReqId: () => randomUUID(),
    requestIdHeader: 'x-request-id',
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      if (error.statusCode >= 500) request.log.error({ err: error }, error.message);
      return reply.code(error.statusCode).send(envelope(error.code, error.message, request.id, error.details));
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply
        .code(400)
        .send(envelope('VALIDATION_ERROR', 'İstek doğrulanamadı', request.id, error.validation.map((v) => v.params)));
    }
    if (error.statusCode === 429) {
      return reply.code(429).send(envelope('RATE_LIMITED', 'Çok fazla istek; biraz sonra tekrar dene', request.id));
    }
    if (error.statusCode === 413 || error.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.code(413).send(envelope('PAYLOAD_TOO_LARGE', 'Dosya veya istek çok büyük', request.id));
    }
    if (error.statusCode === 415) {
      return reply.code(415).send(envelope('UNSUPPORTED_MEDIA_TYPE', 'Desteklenmeyen içerik türü', request.id));
    }
    if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send(envelope('BAD_REQUEST', 'Geçersiz istek', request.id));
    }
    request.log.error({ err: error }, 'unhandled error');
    return reply.code(500).send(envelope('INTERNAL_ERROR', 'Beklenmeyen bir hata oluştu', request.id));
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send(envelope('NOT_FOUND', 'Kaynak bulunamadı', request.id)),
  );

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Menü Kopilot API',
        description: 'Suggestion and gap-analysis API for platform branch openings. Streaming endpoints use SSE.',
        version: APP_VERSION,
      },
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(fastifySwaggerUi, { routePrefix: '/docs' });
  app.get('/openapi.json', { schema: { hide: true } }, () => app.swagger());

  await app.register(fastifyRateLimit, { global: false });
  await app.register(fastifyMultipart, {
    limits: {
      files: config.uploads.maxFiles,
      fileSize: config.uploads.maxFileBytes,
      fields: 20,
      fieldSize: 64 * 1024,
    },
  });
  await app.register(fastifyJwt, {
    secret: config.auth.jwtSecret,
    sign: { algorithm: 'HS256', expiresIn: config.auth.accessTtl, iss: JWT_ISSUER, aud: JWT_AUDIENCE },
    verify: { algorithms: ['HS256'], allowedIss: JWT_ISSUER, allowedAud: JWT_AUDIENCE },
  });

  const authService = new AuthService(deps.db.db, {
    refreshTtlDays: config.auth.refreshTtlDays,
    accessTtlSeconds: durationToSeconds(config.auth.accessTtl),
    signAccessToken: (claims) => app.jwt.sign(claims),
  });
  await app.register(authPlugin, { service: authService });

  await app.register(healthRoutes, {
    version: APP_VERSION,
    probes: [
      { name: 'database', check: () => deps.db.ping() },
      { name: 'redis', check: () => deps.cache.ping() },
    ],
  });

  const ai =
    deps.ai ??
    createAiServices(config, deps.db.db, {
      onUsageError: (err) => app.log.error({ err }, 'usage_log write failed'),
    });
  const settingsService = new SettingsService(ai, {
    localOnlyMode: config.providers.localOnlyMode,
    timezone: config.quota.timezone,
  });

  const db = deps.db.db;
  const embedding = new EmbeddingService(db, ai.router, ai.prompts);
  const queue = deps.queue ?? new InlineJobQueue(embedding);
  const store = new SuggestionStore(db);
  const retrieval = new RetrievalService(db, ai.router, ai.prompts, {
    trigramThreshold: config.retrieval.trigramThreshold,
    vectorThreshold: config.retrieval.vectorThreshold,
  });
  const extractor = new VisionExtractor(ai.router, ai.prompts, deps.cache, config.cacheTtlSeconds);
  const enrichment = new EnrichmentService(db, ai.router, ai.prompts, deps.cache, config.cacheTtlSeconds);
  const pipeline = new SuggestPipeline({
    db,
    router: ai.router,
    prompts: ai.prompts,
    retrieval,
    extractor,
    enrichment,
    store,
    cache: deps.cache,
    cacheTtlSeconds: config.cacheTtlSeconds,
    budget: config.budget,
  });
  const suggestService = new SuggestService({
    db,
    store,
    pipeline,
    registry: new RunRegistry<SuggestEvent>(),
    queue,
    budget: config.budget,
    log: app.log,
  });
  const gapStore = new GapStore(db);
  const gapService = new GapService({
    db,
    store: gapStore,
    pipeline: new GapPipeline({
      db,
      router: ai.router,
      prompts: ai.prompts,
      retrieval,
      extractor,
      store: gapStore,
      cache: deps.cache,
      cacheTtlSeconds: config.cacheTtlSeconds,
      budget: config.budget,
    }),
    registry: new RunRegistry<GapEvent>(),
    log: app.log,
  });
  app.decorate('services', { ai, queue, embedding, suggest: suggestService, gap: gapService });

  await app.register(
    async (api) => {
      await api.register(authRoutes, { service: authService });
      // Everything below requires a valid access token.
      await api.register(async (secured) => {
        secured.addHook('onRequest', secured.authenticate);
        await secured.register(settingsRoutes, { service: settingsService });
        await secured.register(promptRoutes, { prompts: ai.prompts });
        await secured.register(suggestRoutes, { service: suggestService, uploads: config.uploads });
        await secured.register(cuisineRoutes, { service: new CuisineService(db) });
        await secured.register(branchRoutes, { service: new BranchService(db) });
        await secured.register(gapRoutes, { service: gapService, uploads: config.uploads });
      });
    },
    { prefix: '/api/v1' },
  );

  return app;
}
