import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getAuthUser } from '../../plugins/auth.js';
import { forgetBodySchema, learningResultSchema } from './schemas.js';
import type { LearningService } from './service.js';

const security = [{ bearerAuth: [] }];

export const learningRoutes: FastifyPluginAsyncZod<{ service: LearningService }> = async (app, { service }) => {
  app.get(
    '/learning',
    {
      schema: {
        tags: ['learning'],
        summary: 'What the team kept throwing away and the pipeline no longer offers: products per cuisine, suggestions per product type',
        security,
        response: { 200: learningResultSchema },
      },
    },
    async () => service.rejections(),
  );

  app.post(
    '/learning/forget',
    {
      schema: {
        tags: ['learning'],
        summary: '"Geri al": the rows behind one learned verdict stop counting (kept, marked with who and when)',
        security,
        body: forgetBodySchema,
        response: { 200: z.object({ forgotten: z.number().int() }) },
      },
    },
    async (request) => service.forget(getAuthUser(request).id, request.body),
  );
};
