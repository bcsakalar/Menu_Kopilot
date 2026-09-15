import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getAuthUser } from '../../plugins/auth.js';
import { usageRangeSchema, usageSummarySchema } from './schemas.js';
import type { UsageService } from './service.js';

export const usageRoutes: FastifyPluginAsyncZod<{ service: UsageService }> = async (app, { service }) => {
  app.get(
    '/usage/summary',
    {
      schema: {
        tags: ['usage'],
        summary: 'AI usage of the signed-in user: calls per model/task, tokens, errors, cache and DB hit ratios, quota',
        security: [{ bearerAuth: [] }],
        querystring: z.object({ range: usageRangeSchema.default('today') }),
        response: { 200: usageSummarySchema },
      },
    },
    async (request) => service.summary(getAuthUser(request).id, request.query.range),
  );
};
