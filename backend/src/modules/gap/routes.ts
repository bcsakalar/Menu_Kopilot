import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { openSse } from '../../lib/sse.js';
import { readFieldsAndImages } from '../../lib/uploads.js';
import { getAuthUser } from '../../plugins/auth.js';
import { type GapEvent, gapFieldsSchema, gapResultDtoSchema } from './schemas.js';
import type { GapService, StartedGapRun } from './service.js';

const runIdParams = z.object({ runId: z.uuid() });
const branchIdParams = z.object({ id: z.uuid() });
const modeQuery = z.object({ async: z.enum(['1', 'true', '0', 'false']).optional() });

function wantsStream(request: FastifyRequest): boolean {
  return (request.headers.accept ?? '').includes('text/event-stream');
}

function streamRun(service: GapService, runId: string, reply: FastifyReply): void {
  reply.hijack();
  const subscription: { off?: (() => void) | undefined } = {};
  const channel = openSse(reply.raw, { onClose: () => subscription.off?.() });
  subscription.off = service.subscribe(runId, (event: GapEvent) => {
    channel.send(event.type, event);
    if (event.type === 'done' || event.type === 'error') channel.close();
  });
  if (!subscription.off) {
    channel.send('error', { type: 'error', code: 'NOT_FOUND', message: 'Çalışan menü analizi bulunamadı' });
    channel.close();
  }
}

export const gapRoutes: FastifyPluginAsyncZod<{
  service: GapService;
  uploads: { maxFiles: number; maxFileBytes: number };
}> = async (app, { service, uploads }) => {
  const security = [{ bearerAuth: [] }];

  const respond = async (request: FastifyRequest, reply: FastifyReply, started: StartedGapRun, asyncMode: boolean) => {
    if (wantsStream(request)) {
      streamRun(service, started.runId, reply);
      return reply;
    }
    if (asyncMode) return reply.code(202).send({ runId: started.runId });
    await started.done;
    return reply.send(await service.snapshot(getAuthUser(request).id, started.runId));
  };

  app.post(
    '/gap-analysis',
    {
      schema: {
        tags: ['gap'],
        summary: 'Menu gap analysis from platform panel screenshots (multipart: branchId, extraNotes?, images[] 1–5)',
        description:
          'Accept: text/event-stream → SSE (run, progress, counts, questions, items, recommendations, questions_append, ' +
          'warning, done, error). ?async=1 → 202 {runId}. Otherwise waits and returns the result.',
        security,
        consumes: ['multipart/form-data'],
        querystring: modeQuery,
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { fields, images } = await readFieldsAndImages(request, uploads);
      const parsed = gapFieldsSchema.safeParse(fields);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'İstek doğrulanamadı', parsed.error.issues.map((i) => ({ path: i.path, message: i.message })));
      }
      const started = await service.start(user.id, parsed.data, images);
      const asyncMode = request.query.async === '1' || request.query.async === 'true';
      return respond(request, reply, started, asyncMode);
    },
  );

  app.get(
    '/gap-analysis/:runId',
    { schema: { tags: ['gap'], summary: 'Gap analysis result', security, params: runIdParams, response: { 200: gapResultDtoSchema } } },
    async (request) => service.snapshot(getAuthUser(request).id, request.params.runId),
  );

  app.get(
    '/gap-analysis/:runId/events',
    { schema: { tags: ['gap'], summary: 'Re-attach to a gap analysis (SSE, replays past events)', security, params: runIdParams } },
    async (request, reply) => {
      const result = await service.snapshot(getAuthUser(request).id, request.params.runId);
      if (service.hasLiveEvents(request.params.runId)) {
        streamRun(service, request.params.runId, reply);
        return reply;
      }
      // No longer in memory: replay the stored result in the usual order.
      reply.hijack();
      const channel = openSse(reply.raw);
      channel.send('run', { type: 'run', runId: result.runId, branchId: result.branchId });
      if (result.counts) channel.send('counts', { type: 'counts', counts: result.counts });
      channel.send('questions', { type: 'questions', items: result.questions });
      channel.send('items', { type: 'items', items: result.items });
      for (const source of ['db', 'ai'] as const) {
        const items = result.recommendations.filter((r) => r.source === source);
        if (items.length > 0 || source === 'db') channel.send('recommendations', { type: 'recommendations', source, items });
      }
      channel.send('done', { type: 'done', status: result.status, stats: result.stats });
      channel.close();
      return reply;
    },
  );

  app.post(
    '/gap-analysis/:runId/cancel',
    { schema: { tags: ['gap'], security, params: runIdParams, response: { 200: z.object({ cancelled: z.boolean() }) } } },
    async (request) => service.cancel(getAuthUser(request).id, request.params.runId),
  );

  app.get(
    '/branches/:id/gap/latest',
    {
      schema: {
        tags: ['gap'],
        summary: 'Latest gap analysis of a branch',
        security,
        params: branchIdParams,
        response: { 200: gapResultDtoSchema },
      },
    },
    async (request) => service.latest(getAuthUser(request).id, request.params.id),
  );
};
