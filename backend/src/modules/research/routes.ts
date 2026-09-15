import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { getAuthUser } from '../../plugins/auth.js';
import { researchRequestSchema, researchResultDtoSchema } from './schemas.js';
import type { ResearchService } from './service.js';

export const researchRoutes: FastifyPluginAsyncZod<{ service: ResearchService }> = async (app, { service }) => {
  app.post(
    '/research',
    {
      schema: {
        tags: ['research'],
        summary: 'Research a restaurant on the web (Groq compound): menu items, summary, sources — no prices',
        description:
          'Give restaurantName (+ city, cuisineId) or a branchId. With a branch, items already on its menu are marked. ' +
          'Cached for 7 days; refresh=true searches again.',
        security: [{ bearerAuth: [] }],
        body: researchRequestSchema,
        response: { 200: researchResultDtoSchema },
      },
    },
    async (request) => service.research(getAuthUser(request).id, request.body),
  );
};
