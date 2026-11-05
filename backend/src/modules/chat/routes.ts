import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { openSse } from '../../lib/sse.js';
import { readFieldsAndImages } from '../../lib/uploads.js';
import { getAuthUser } from '../../plugins/auth.js';
import { conversationDetailSchema, conversationDtoSchema, messageFieldsSchema } from './schemas.js';
import type { ChatService } from './service.js';

const idParams = z.object({ id: z.uuid() });
/** One analysis costs several model calls: this is what keeps an open site from spending the day's quota in a minute. */
const MESSAGES_PER_MINUTE = 20;

export const chatRoutes: FastifyPluginAsyncZod<{
  service: ChatService;
  uploads: { maxFiles: number; maxFileBytes: number };
}> = async (app, { service, uploads }) => {
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
      // preHandler, not onRequest: the rate limit (onRequest) must run first, or a flood creates a visitor per request.
      preHandler: [app.ensureVisitor],
      config: { rateLimit: { max: MESSAGES_PER_MINUTE, timeWindow: '1 minute' } },
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
