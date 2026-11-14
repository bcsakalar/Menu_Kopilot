import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { openSse } from '../../lib/sse.js';
import { readFieldsAndImages } from '../../lib/uploads.js';
import { getAuthUser } from '../../plugins/auth.js';
import { conversationDetailSchema, conversationDtoSchema, messageFieldsSchema } from './schemas.js';
import type { ChatService } from './service.js';

const idParams = z.object({ id: z.uuid() });
/** One analysis costs several model calls: this is what keeps one browser from spending the day's quota in a minute. */
export const MESSAGES_PER_MINUTE = 20;
/** First messages (no cookie yet) per address: each creates a visitor, so this is what stops minting them (D-214). */
export const NEW_VISITORS_PER_MINUTE = 30;
/**
 * A whole office reaches the site from one address behind its router, so the address limit is loose: twenty reps
 * writing at full speed still fit under it (D-214).
 */
export const MESSAGES_PER_ADDRESS_PER_MINUTE = 120;

export const chatRoutes: FastifyPluginAsyncZod<{
  service: ChatService;
  uploads: { maxFiles: number; maxFileBytes: number };
}> = async (app, { service, uploads }) => {
  const perVisitor = app.createRateLimit({
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      const visitor = app.sessionSubject(request);
      return visitor ? `chat-visitor:${visitor}` : `chat-new:${request.ip}`;
    },
    max: (_request, key) => (key.startsWith('chat-new:') ? NEW_VISITORS_PER_MINUTE : MESSAGES_PER_MINUTE),
  });
  const perAddress = app.createRateLimit({
    timeWindow: '1 minute',
    keyGenerator: (request) => `chat-address:${request.ip}`,
    max: MESSAGES_PER_ADDRESS_PER_MINUTE,
  });
  const limitMessages = async (request: FastifyRequest): Promise<void> => {
    for (const limit of [perAddress, perVisitor]) {
      const result = await limit(request);
      if (!result.isAllowed && result.isExceeded) throw new AppError('RATE_LIMITED', 'Çok fazla istek; biraz sonra tekrar dene');
    }
  };

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
