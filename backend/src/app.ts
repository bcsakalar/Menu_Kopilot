import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fastifyJwt from '@fastify/jwt';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
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
import { RedisCache } from './cache/redis-cache.js';
import type { AppConfig } from './config/env.js';
import type { DbHandle } from './db/client.js';
import { EmbeddingService } from './jobs/embedding.service.js';
import { InlineJobQueue, type JobQueue } from './jobs/queue.js';
import { durationToSeconds } from './lib/duration.js';
import { AppError, type ErrorEnvelope } from './lib/errors.js';
import { loggerOptions } from './lib/logger.js';
import { RunRegistry } from './lib/run-registry.js';
import { Slots } from './lib/slots.js';
import { LoadMonitor } from './modules/admin/load.js';
import { adminRoutes } from './modules/admin/routes.js';
import { AdminService } from './modules/admin/service.js';
import { analyzeRoutes } from './modules/analyze/routes.js';
import type { AnalyzeEvent } from './modules/analyze/schemas.js';
import { AnalyzeService } from './modules/analyze/service.js';
import { AnalyzeStore } from './modules/analyze/store.js';
import { authRoutes } from './modules/auth/routes.js';
import { AuthService } from './modules/auth/service.js';
import { chatRoutes } from './modules/chat/routes.js';
import { feedbackAdminRoutes, feedbackRoutes } from './modules/feedback/routes.js';
import { FeedbackService } from './modules/feedback/service.js';
import { ChatService } from './modules/chat/service.js';
import { cuisineRoutes } from './modules/cuisines/routes.js';
import { CuisineService } from './modules/cuisines/service.js';
import { VisionExtractor } from './modules/extraction/vision-extractor.js';
import { healthRoutes } from './modules/health/routes.js';
import { learningRoutes } from './modules/learning/routes.js';
import { LearningService } from './modules/learning/service.js';
import { RetrievalService } from './modules/retrieval/retrieval.service.js';
import { settingsRoutes } from './modules/settings/routes.js';
import { SettingsService } from './modules/settings/service.js';
import { templateRoutes } from './modules/templates/routes.js';
import { TemplateService } from './modules/templates/service.js';
import { toolsRoutes } from './modules/tools/routes.js';
import { ToolsService } from './modules/tools/service.js';
import { usageRoutes } from './modules/usage/routes.js';
import { UsageService } from './modules/usage/service.js';
import { authPlugin } from './plugins/auth.js';

export const APP_VERSION = '0.2.0';
const JWT_ISSUER = 'menu-kopilot';
const JWT_AUDIENCE = 'menu-kopilot-web';
/** The built site (web/dist in the image). Absent in tests and backend-only development. */
const WEB_ROOT = fileURLToPath(new URL('../public', import.meta.url));

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
  /** The text tool's dictionary (D-218). */
  tools: ToolsService;
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

  const hasWeb = existsSync(WEB_ROOT);
  app.setNotFoundHandler((request, reply) => {
    // /admin and any deep link are the same page: the client decides what to show.
    if (hasWeb && request.method === 'GET' && !request.url.startsWith('/api/')) return reply.sendFile('index.html');
    return reply.code(404).send(envelope('NOT_FOUND', 'Kaynak bulunamadı', request.id));
  });

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

  // Counters in Redis when there is one, so every API process counts the same visitor once (D-214). A Redis hiccup
  // lets the request through: the daily quotas still hold, and a broken counter must not take the site down.
  await app.register(fastifyRateLimit, {
    global: false,
    skipOnError: true,
    ...(deps.cache instanceof RedisCache ? { redis: deps.cache.client, nameSpace: 'mk-rate-' } : {}),
  });
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
    accessTtlSeconds: durationToSeconds(config.auth.accessTtl),
    signAccessToken: (claims, expiresIn) => app.jwt.sign(claims, expiresIn === undefined ? {} : { expiresIn }),
  });
  const secureCookies = config.nodeEnv === 'production';
  await app.register(authPlugin, { service: authService, secureCookies });

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
  const slots = new Slots(config.analysis.concurrency, config.analysis.queueMax);
  const uploads = config.uploads;
  const analyzeService = new AnalyzeService({
    db,
    store: analyzeStore,
    registry: new RunRegistry<AnalyzeEvent>(),
    slots,
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
  const toolsService = new ToolsService(db);
  app.decorate('services', { ai, queue, embedding, analyze: analyzeService, tools: toolsService });
  const load = new LoadMonitor({ db, slots, pacer: ai.pacer, siteQuota: () => ai.quota.site(), ntfyUrl: config.alertNtfyUrl, log: app.log });
  load.start();
  app.addHook('onClose', async () => load.stop());

  const chatService = new ChatService({
    db,
    analyze: analyzeService,
    store: analyzeStore,
    router: ai.router,
    prompts: ai.prompts,
    onError: (err) => app.log.error({ err }, 'chat message failed'),
  });

  const feedbackService = new FeedbackService(db);
  await app.register(
    async (api) => {
      await api.register(authRoutes, { service: authService, secureCookies });
      // Open to anyone: a browser's cookie is all the identity there is (D-200).
      await api.register(chatRoutes, { service: chatService, uploads });
      await api.register(feedbackRoutes, { service: feedbackService });
      // Read-only and the same for everyone: the tools page needs no visitor (D-218).
      await api.register(toolsRoutes, { service: toolsService });
      await api.register(async (session) => {
        session.addHook('onRequest', session.authenticate);
        await session.register(analyzeRoutes, { service: analyzeService, uploads });
      });
      await api.register(async (admin) => {
        admin.addHook('onRequest', admin.authenticateAdmin);
        await admin.register(settingsRoutes, { service: settingsService });
        await admin.register(cuisineRoutes, { service: new CuisineService(db) });
        await admin.register(templateRoutes, { service: new TemplateService(db, queue) });
        await admin.register(learningRoutes, { service: new LearningService(db) });
        await admin.register(usageRoutes, {
          service: new UsageService(db, ai.quota, { timezone: config.quota.timezone }),
        });
        await admin.register(feedbackAdminRoutes, { service: feedbackService });
        await admin.register(adminRoutes, {
          service: new AdminService(db, chatService, ai.quota, { timezone: config.quota.timezone }),
          load,
        });
      });
    },
    { prefix: '/api/v1' },
  );

  if (hasWeb) {
    await app.register(fastifyStatic, {
      root: WEB_ROOT,
      wildcard: false,
      // Vite puts a content hash in every asset name; only index.html can change under the same name.
      setHeaders: (res, path) => {
        void res.header('cache-control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
  }

  return app;
}
