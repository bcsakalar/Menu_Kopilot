import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { openSse } from '../../lib/sse.js';
import { readFieldsAndImages } from '../../lib/uploads.js';
import { getAuthUser } from '../../plugins/auth.js';
import { acceptBodySchema, cardDtoSchema, runDtoSchema, suggestFieldsSchema, type SuggestEvent } from './schemas.js';
import type { StartedRun, SuggestService } from './service.js';

const runIdParams = z.object({ runId: z.uuid() });
const itemIdParams = z.object({ id: z.uuid() });
const modeQuery = z.object({ async: z.enum(['1', 'true', '0', 'false']).optional() });

function wantsStream(request: FastifyRequest): boolean {
  return (request.headers.accept ?? '').includes('text/event-stream');
}

/** Streams a run's events as SSE until `done`/`error`. The run itself continues if the client disconnects. */
function streamRun(service: SuggestService, runId: string, reply: FastifyReply): void {
  reply.hijack();
  const subscription: { off?: (() => void) | undefined } = {};
  const channel = openSse(reply.raw, { onClose: () => subscription.off?.() });
  subscription.off = service.subscribe(runId, (event: SuggestEvent) => {
    channel.send(event.type, event);
    if (event.type === 'done' || event.type === 'error') channel.close();
  });
  if (!subscription.off) {
    channel.send('error', { type: 'error', code: 'NOT_FOUND', message: 'Çalışan öneri bulunamadı' });
    channel.close();
  }
}

export const suggestRoutes: FastifyPluginAsyncZod<{
  service: SuggestService;
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
    '/suggest',
    {
      schema: {
        tags: ['suggest'],
        summary: 'Start a suggestion run (multipart: cuisineId, promptText?, branchId?, deepMode?, images[] ≤5)',
        description:
          'Accept: text/event-stream → SSE (run, progress, extracted, item, warning, budget_exhausted, done, error). ' +
          '?async=1 → 202 {runId}. Otherwise waits and returns the run snapshot.',
        security,
        consumes: ['multipart/form-data', 'application/json'],
        querystring: modeQuery,
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { fields, images } = await readFieldsAndImages(request, uploads);
      const parsed = suggestFieldsSchema.safeParse(fields);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'İstek doğrulanamadı', parsed.error.issues.map((i) => ({ path: i.path, message: i.message })));
      }
      const started = await service.start(user.id, parsed.data, images);
      const asyncMode = request.query.async === '1' || request.query.async === 'true';
      return respond(request, reply, started, asyncMode);
    },
  );

  app.get(
    '/suggest/:runId',
    { schema: { tags: ['suggest'], summary: 'Run snapshot with all cards', security, params: runIdParams, response: { 200: runDtoSchema } } },
    async (request) => service.snapshot(getAuthUser(request).id, request.params.runId),
  );

  app.get(
    '/suggest/:runId/events',
    { schema: { tags: ['suggest'], summary: 'Re-attach to a running run (SSE, replays past events)', security, params: runIdParams } },
    async (request, reply) => {
      const user = getAuthUser(request);
      const snapshot = await service.snapshot(user.id, request.params.runId);
      if (service.hasLiveEvents(request.params.runId)) {
        streamRun(service, request.params.runId, reply);
        return reply;
      }
      // Run no longer in memory: replay the stored cards as events.
      reply.hijack();
      const channel = openSse(reply.raw);
      for (const card of snapshot.cards) channel.send('item', { type: 'item', card });
      channel.send('done', { type: 'done', status: snapshot.status, stats: null });
      channel.close();
      return reply;
    },
  );

  app.post(
    '/suggest/:runId/cancel',
    {
      schema: {
        tags: ['suggest'],
        security,
        params: runIdParams,
        response: { 200: z.object({ cancelled: z.boolean() }) },
      },
    },
    async (request) => service.cancel(getAuthUser(request).id, request.params.runId),
  );

  app.post(
    '/suggest/:runId/continue',
    {
      schema: {
        tags: ['suggest'],
        summary: '"Devam et": process pending items (re-send pending images as multipart)',
        security,
        params: runIdParams,
        querystring: modeQuery,
        consumes: ['multipart/form-data', 'application/json'],
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { images } = await readFieldsAndImages(request, uploads);
      const started = await service.continueRun(user.id, request.params.runId, images);
      const asyncMode = request.query.async === '1' || request.query.async === 'true';
      return respond(request, reply, started, asyncMode);
    },
  );

  app.post(
    '/suggestion-items/:id/accept',
    {
      schema: {
        tags: ['suggest'],
        summary: 'Approve a card (optionally edited): saved as an approved template',
        security,
        params: itemIdParams,
        body: acceptBodySchema,
        response: { 200: z.object({ card: cardDtoSchema, templateId: z.uuid() }) },
      },
    },
    async (request) => service.accept(getAuthUser(request).id, request.params.id, request.body),
  );

  app.post(
    '/suggestion-items/:id/skip',
    { schema: { tags: ['suggest'], security, params: itemIdParams, response: { 200: cardDtoSchema } } },
    async (request) => service.skip(getAuthUser(request).id, request.params.id),
  );
};
