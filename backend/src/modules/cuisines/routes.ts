import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getAuthUser } from '../../plugins/auth.js';
import { createCuisineSchema, cuisineDtoSchema, updateCuisineSchema } from './schemas.js';
import type { CuisineService } from './service.js';

export const cuisineRoutes: FastifyPluginAsyncZod<{ service: CuisineService }> = async (app, { service }) => {
  const security = [{ bearerAuth: [] }];
  const idParams = z.object({ id: z.uuid() });

  app.get(
    '/cuisines',
    { schema: { tags: ['cuisines'], security, response: { 200: z.object({ data: z.array(cuisineDtoSchema) }) } } },
    async () => ({ data: await service.list() }),
  );

  app.post(
    '/cuisines',
    { schema: { tags: ['cuisines'], security, body: createCuisineSchema, response: { 201: cuisineDtoSchema } } },
    async (request, reply) => reply.code(201).send(await service.create(getAuthUser(request).id, request.body)),
  );

  app.patch(
    '/cuisines/:id',
    {
      schema: {
        tags: ['cuisines'],
        summary: 'Edit a cuisine (minimum product count, notes, parent; name only for user-created ones)',
        security,
        params: idParams,
        body: updateCuisineSchema,
        response: { 200: cuisineDtoSchema },
      },
    },
    async (request) => service.update(request.params.id, request.body),
  );

  app.delete(
    '/cuisines/:id',
    { schema: { tags: ['cuisines'], security, params: idParams } },
    async (request, reply) => {
      await service.remove(request.params.id);
      return reply.code(204).send();
    },
  );
};
