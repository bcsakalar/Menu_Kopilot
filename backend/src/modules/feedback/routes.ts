import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getAuthUser } from '../../plugins/auth.js';
import { createFeedbackSchema, feedbackDtoSchema, feedbackListQuerySchema, feedbackListSchema, updateFeedbackSchema } from './schemas.js';
import type { FeedbackService } from './service.js';

/** Anyone with the site open: the visitor cookie is the identity, like the chat (D-200). */
export const feedbackRoutes: FastifyPluginAsyncZod<{ service: FeedbackService }> = async (app, { service }) => {
  app.post(
    '/feedback',
    {
      // preHandler, not onRequest: the rate limit runs first, so a flood cannot mint a visitor per request.
      preHandler: [app.ensureVisitor],
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        tags: ['feedback'],
        summary: 'A rep sends feedback (suggestion, bug or other), optionally with the conversation on screen',
        body: createFeedbackSchema,
        response: { 201: z.object({ id: z.uuid() }) },
      },
    },
    async (request, reply) => reply.code(201).send(await service.create(getAuthUser(request).id, request.body)),
  );
};

export const feedbackAdminRoutes: FastifyPluginAsyncZod<{ service: FeedbackService }> = async (app, { service }) => {
  const security = [{ bearerAuth: [] }];

  app.get(
    '/admin/feedback',
    {
      schema: {
        tags: ['admin'],
        summary: 'Feedback from the reps, newest first, with counts per status',
        security,
        querystring: feedbackListQuerySchema,
        response: { 200: feedbackListSchema },
      },
    },
    async (request) => service.list(request.query),
  );

  app.patch(
    '/admin/feedback/:id',
    {
      schema: {
        tags: ['admin'],
        summary: 'Mark feedback seen / done, or leave a note on it',
        security,
        params: z.object({ id: z.uuid() }),
        body: updateFeedbackSchema,
        response: { 200: feedbackDtoSchema },
      },
    },
    async (request) => service.update(request.params.id, request.body),
  );
};
