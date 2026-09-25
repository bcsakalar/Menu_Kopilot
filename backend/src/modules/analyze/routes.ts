import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { openSse } from '../../lib/sse.js';
import { readFieldsAndImages } from '../../lib/uploads.js';
import { getAuthUser } from '../../plugins/auth.js';
import {
  acceptBodySchema,
  analyzeFieldsSchema,
  analyzeResultSchema,
  cardDtoSchema,
  historyQuerySchema,
  historyResultSchema,
  traceResultSchema,
  type AnalyzeEvent,
} from './schemas.js';
import type { AnalyzeService, StartedRun } from './service.js';

const runIdParams = z.object({ runId: z.uuid() });
const itemIdParams = z.object({ id: z.uuid() });
const modeQuery = z.object({ async: z.enum(['1', 'true', '0', 'false']).optional() });

function wantsStream(request: FastifyRequest): boolean {
  return (request.headers.accept ?? '').includes('text/event-stream');
}

/** Streams a run's events as SSE until `done`/`error`. The run continues if the client disconnects. */
function streamRun(service: AnalyzeService, runId: string, reply: FastifyReply): void {
  reply.hijack();
  const subscription: { off?: (() => void) | undefined } = {};
  const channel = openSse(reply.raw, { onClose: () => subscription.off?.() });
  subscription.off = service.subscribe(runId, (event: AnalyzeEvent) => {
    channel.send(event.type, event);
    if (event.type === 'done' || event.type === 'error') channel.close();
  });
  if (!subscription.off) {
    channel.send('error', { type: 'error', code: 'NOT_FOUND', message: 'Çalışan analiz bulunamadı' });
    channel.close();
  }
}

export const analyzeRoutes: FastifyPluginAsyncZod<{
  service: AnalyzeService;
  uploads: { maxFiles: number; maxFileBytes: number };
}> = async (app, { service, uploads }) => {
  const security = [{ bearerAuth: [] }];

  const respond = async (request: FastifyRequest, reply: FastifyReply, started: StartedRun, asyncMode: boolean) => {
    if (wantsStream(request)) {
      streamRun(service, started.runId, reply);
      return reply;
    }
    if (asyncMode) return reply.code(202).send({ runId: started.runId });
    await started.done;
    return reply.send(await service.snapshot(getAuthUser(request).id, started.runId));
  };

  app.post(
    '/analyze',
    {
      schema: {
        tags: ['analyze'],
        summary: 'Analyse a menu (multipart: cuisineId?, menuText?, notes?, mode?, fromRunId?, debug?, images[] ≤5)',
        description:
          'Runs the six-agent pipeline and returns three sections of cards (new_product, option, fix). ' +
          'mode=quick → a few suggestions from different categories; mode=full (default) → recommend up to the ' +
          "cuisine's opening minimum and ask for options on every product whose options are unknown. "  +
          'Accept: text/event-stream → SSE (run, progress, classification, menu, counts, item, trace, warning, ' +
          'done, error). ?async=1 → 202 {runId}. Otherwise waits and returns the result.',
        security,
        consumes: ['multipart/form-data', 'application/json'],
        querystring: modeQuery,
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { fields, images } = await readFieldsAndImages(request, uploads);
      const parsed = analyzeFieldsSchema.safeParse(fields);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          'İstek doğrulanamadı',
          parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
        );
      }
      const started = await service.start(user.id, parsed.data, images);
      const asyncMode = request.query.async === '1' || request.query.async === 'true';
      return respond(request, reply, started, asyncMode);
    },
  );

  app.get(
    '/analyze/history',
    {
      schema: {
        tags: ['analyze'],
        summary: 'The user\'s analyses, newest first: date, time, cuisine, mode, card counts; filtered and paged',
        security,
        querystring: historyQuerySchema,
        response: { 200: historyResultSchema },
      },
    },
    async (request) => service.history(getAuthUser(request).id, request.query),
  );

  app.get(
    '/analyze/latest',
    {
      schema: {
        tags: ['analyze'],
        summary: 'Most recent analysis of the user (what the result screen restores on a cold open)',
        security,
        response: { 200: analyzeResultSchema.nullable() },
      },
    },
    async (request) => service.latest(getAuthUser(request).id),
  );

  app.get(
    '/analyze/:runId',
    {
      schema: {
        tags: ['analyze'],
        summary: 'Analysis result with all cards',
        security,
        params: runIdParams,
        response: { 200: analyzeResultSchema },
      },
    },
    async (request) => service.snapshot(getAuthUser(request).id, request.params.runId),
  );

  app.get(
    '/analyze/:runId/trace',
    {
      schema: {
        tags: ['analyze'],
        summary: 'Agent-by-agent trace of a run (hidden debug screen)',
        security,
        params: runIdParams,
        response: { 200: traceResultSchema },
      },
    },
    async (request) => service.trace(getAuthUser(request).id, request.params.runId),
  );

  app.get(
    '/analyze/:runId/events',
    {
      schema: { tags: ['analyze'], summary: 'Re-attach to a running analysis (SSE, replays past events)', security, params: runIdParams },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const snapshot = await service.snapshot(user.id, request.params.runId);
      if (service.hasLiveEvents(request.params.runId)) {
        streamRun(service, request.params.runId, reply);
        return reply;
      }
      // Run no longer in memory: replay what was stored.
      reply.hijack();
      const channel = openSse(reply.raw);
      if (snapshot.classification) channel.send('classification', { type: 'classification', classification: snapshot.classification });
      if (snapshot.menu.length > 0) channel.send('menu', { type: 'menu', items: snapshot.menu });
      if (snapshot.counts) channel.send('counts', { type: 'counts', counts: snapshot.counts });
      for (const card of snapshot.cards) channel.send('item', { type: 'item', card });
      channel.send('done', { type: 'done', status: snapshot.status, stats: snapshot.stats });
      channel.close();
      return reply;
    },
  );

  app.post(
    '/analyze/:runId/cancel',
    { schema: { tags: ['analyze'], security, params: runIdParams, response: { 200: z.object({ cancelled: z.boolean() }) } } },
    async (request) => service.cancel(getAuthUser(request).id, request.params.runId),
  );

  app.post(
    '/suggestion-items/:id/accept',
    {
      schema: {
        tags: ['analyze'],
        summary: 'Approve a card (optionally edited): new_product cards are saved as approved templates',
        security,
        params: itemIdParams,
        body: acceptBodySchema,
        response: { 200: cardDtoSchema },
      },
    },
    async (request) => service.accept(getAuthUser(request).id, request.params.id, request.body),
  );

  app.post(
    '/suggestion-items/:id/skip',
    { schema: { tags: ['analyze'], security, params: itemIdParams, response: { 200: cardDtoSchema } } },
    async (request) => service.skip(getAuthUser(request).id, request.params.id),
  );
};
