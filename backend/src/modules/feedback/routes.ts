import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { type VisitorLimits, visitorLimits } from '../../lib/visitor-limits.js';
import { getAuthUser } from '../../plugins/auth.js';
import { createFeedbackSchema, feedbackDtoSchema, feedbackListQuerySchema, feedbackListSchema, updateFeedbackSchema } from './schemas.js';
import type { FeedbackService } from './service.js';

/**
 * Feedback per minute (D-215): five a minute per ADDRESS used to be the whole office's allowance. Now ten per rep, and
 * an office's one address carries a hundred.
 */
export const FEEDBACK_LIMITS: VisitorLimits = { perVisitor: 10, newPerAddress: 100, perAddress: 100 };

/** Anyone with the site open: the visitor cookie is the identity, like the chat (D-200). */
export const feedbackRoutes: FastifyPluginAsyncZod<{ service: FeedbackService }> = async (app, { service }) => {
  const limitFeedback = visitorLimits(app, 'feedback', FEEDBACK_LIMITS);
  app.post(
    '/feedback',
    {
      // The limits run first (onRequest), the visitor is made after (preHandler): a flood cannot mint a visitor per request.
      onRequest: [limitFeedback],
      preHandler: [app.ensureVisitor],
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
