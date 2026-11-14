import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { openSse } from '../../lib/sse.js';
import { readFieldsAndImages } from '../../lib/uploads.js';
import { type VisitorLimits, visitorLimits } from '../../lib/visitor-limits.js';
import { getAuthUser } from '../../plugins/auth.js';
import { conversationDetailSchema, conversationDtoSchema, messageFieldsSchema } from './schemas.js';
import type { ChatService } from './service.js';

const idParams = z.object({ id: z.uuid() });
/**
 * Chat messages per minute (D-215). A rep in a call sends a message every few seconds at most, so 30 never stops a
 * person, only a runaway script. One address — an office, a corporate proxy — carries 200 new reps and 600 messages a
 * minute: two hundred reps writing at once still fit. The daily quotas and the analysis queue guard the rest.
 */
export const CHAT_LIMITS: VisitorLimits = { perVisitor: 30, newPerAddress: 200, perAddress: 600 };

export const chatRoutes: FastifyPluginAsyncZod<{
  service: ChatService;
  uploads: { maxFiles: number; maxFileBytes: number };
}> = async (app, { service, uploads }) => {
  const limitMessages = visitorLimits(app, 'chat', CHAT_LIMITS);

  app.get(
    '/chat/conversations',
    {
      onRequest: [app.optionalSession],
      schema: {
        tags: ['chat'],
        summary: "The browser's conversations; empty before its first message",
        response: { 200: z.object({ data: z.array(conversationDtoSchema) }) },
      },
    },
    async (request) => ({ data: request.authUser ? await service.list(request.authUser.id) : [] }),
  );

  app.get(
    '/chat/conversations/:id',
    {
      onRequest: [app.authenticate],
      schema: { tags: ['chat'], params: idParams, response: { 200: conversationDetailSchema } },
    },
    async (request) => service.detail(getAuthUser(request).id, request.params.id),
  );

  app.delete(
    '/chat/conversations/:id',
    { onRequest: [app.authenticate], schema: { tags: ['chat'], params: idParams } },
    async (request, reply) => {
      await service.remove(getAuthUser(request).id, request.params.id);
      return reply.code(204).send();
    },
  );

  app.post(
    '/chat/messages',
    {
      // The limits run first (onRequest), the visitor is made after (preHandler): a flood must not create a visitor per request.
      onRequest: [limitMessages],
      preHandler: [app.ensureVisitor],
      schema: {
        tags: ['chat'],
        summary: 'Send a message (multipart: conversationId?, text?, images[] ≤5); the answer streams as SSE',
        consumes: ['multipart/form-data', 'application/json'],
      },
    },
    async (request, reply) => {
      const user = getAuthUser(request);
      const { fields, images } = await readFieldsAndImages(request, uploads);
      const parsed = messageFieldsSchema.safeParse(fields);
      if (!parsed.success) throw new AppError('VALIDATION_ERROR', 'İstek doğrulanamadı');
      const outgoing = await service.accept(user.id, { ...parsed.data, images });

      reply.hijack();
      const channel = openSse(reply.raw);
      try {
        await service.answer(user.id, outgoing, (event) => channel.send(event.type, event));
      } finally {
        channel.close();
      }
      return reply;
    },
  );
};
