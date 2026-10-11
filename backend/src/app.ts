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
import { RunRegistry } from './lib/run-registry.js';
import { analyzeRoutes } from './modules/analyze/routes.js';
import type { AnalyzeEvent } from './modules/analyze/schemas.js';
import { AnalyzeService } from './modules/analyze/service.js';
import { AnalyzeStore } from './modules/analyze/store.js';
import { authRoutes } from './modules/auth/routes.js';
import { AuthService } from './modules/auth/service.js';
import { cuisineRoutes } from './modules/cuisines/routes.js';
import { CuisineService } from './modules/cuisines/service.js';
import { VisionExtractor } from './modules/extraction/vision-extractor.js';
import { healthRoutes } from './modules/health/routes.js';
import { learningRoutes } from './modules/learning/routes.js';
import { LearningService } from './modules/learning/service.js';
import { promptRoutes } from './modules/prompts/routes.js';
import { RetrievalService } from './modules/retrieval/retrieval.service.js';
import { settingsRoutes } from './modules/settings/routes.js';
import { SettingsService } from './modules/settings/service.js';
import { templateRoutes } from './modules/templates/routes.js';
import { TemplateService } from './modules/templates/service.js';
import { usageRoutes } from './modules/usage/routes.js';
import { UsageService } from './modules/usage/service.js';
import { voiceRoutes } from './modules/voice/routes.js';
import { VoiceService } from './modules/voice/service.js';
import { authPlugin } from './plugins/auth.js';

export const APP_VERSION = '0.2.0';
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
  analyze: AnalyzeService;
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
        description:
          'Menu analysis API for restaurant menus. One endpoint, six agents, three sections of cards. ' +
          'Streaming endpoints use SSE.',
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
    appAccessKey: config.auth.appAccessKey,
    deviceAccountEmail: config.admin.email,
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
  const retrieval = new RetrievalService(db, ai.router, ai.prompts, {
    trigramThreshold: config.retrieval.trigramThreshold,
    vectorThreshold: config.retrieval.vectorThreshold,
  });
  const extractor = new VisionExtractor(ai.router, ai.prompts, deps.cache, config.cacheTtlSeconds);
  const analyzeStore = new AnalyzeStore(db);
  const analyzeService = new AnalyzeService({
    db,
    store: analyzeStore,
    registry: new RunRegistry<AnalyzeEvent>(),
    queue,
    // `tracer`, `categories`, `productTypes` and `feedback` are per-run: the service loads them for each analysis.
    pipelineDeps: {
      db,
      router: ai.router,
      prompts: ai.prompts,
      retrieval,
      extractor,
      cache: deps.cache,
      cacheTtlSeconds: config.cacheTtlSeconds,
      budget: config.budget,
    },
    log: app.log,
  });
  app.decorate('services', { ai, queue, embedding, analyze: analyzeService });

  await app.register(
    async (api) => {
      await api.register(authRoutes, { service: authService });
      // Everything below requires a valid access token.
      await api.register(async (secured) => {
        secured.addHook('onRequest', secured.authenticate);
        await secured.register(settingsRoutes, { service: settingsService });
        await secured.register(promptRoutes, { prompts: ai.prompts });
        await secured.register(analyzeRoutes, { service: analyzeService, uploads: config.uploads });
        await secured.register(cuisineRoutes, { service: new CuisineService(db) });
        await secured.register(templateRoutes, { service: new TemplateService(db, queue) });
        await secured.register(learningRoutes, { service: new LearningService(db) });
        await secured.register(usageRoutes, {
          service: new UsageService(db, ai.quota, { timezone: config.quota.timezone }),
        });
        await secured.register(voiceRoutes, {
          service: new VoiceService({
            db,
            router: ai.router,
            prompts: ai.prompts,
            cache: deps.cache,
            ttlSeconds: config.cacheTtlSeconds,
          }),
          maxFileBytes: config.uploads.maxFileBytes,
        });
      });
    },
    { prefix: '/api/v1' },
  );

  return app;
}
