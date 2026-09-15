import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getAuthUser } from '../../plugins/auth.js';
import { branchDtoSchema, createBranchSchema, updateBranchSchema } from './schemas.js';
import type { BranchService } from './service.js';

export const branchRoutes: FastifyPluginAsyncZod<{ service: BranchService }> = async (app, { service }) => {
  const security = [{ bearerAuth: [] }];
  const idParams = z.object({ id: z.uuid() });

  app.get(
    '/branches',
    { schema: { tags: ['branches'], security, response: { 200: z.object({ data: z.array(branchDtoSchema) }) } } },
    async (request) => ({ data: await service.list(getAuthUser(request).id) }),
  );

  app.post(
    '/branches',
    { schema: { tags: ['branches'], security, body: createBranchSchema, response: { 201: branchDtoSchema } } },
    async (request, reply) => reply.code(201).send(await service.create(getAuthUser(request).id, request.body)),
  );

  app.get(
    '/branches/:id',
    { schema: { tags: ['branches'], security, params: idParams, response: { 200: branchDtoSchema } } },
    async (request) => service.get(getAuthUser(request).id, request.params.id),
  );

  app.patch(
    '/branches/:id',
    {
      schema: {
        tags: ['branches'],
        summary: 'Edit a branch (targetItemCount: null resets to the automatic target)',
        security,
        params: idParams,
        body: updateBranchSchema,
        response: { 200: branchDtoSchema },
      },
    },
    async (request) => service.update(getAuthUser(request).id, request.params.id, request.body),
  );

  app.delete(
    '/branches/:id',
    { schema: { tags: ['branches'], security, params: idParams } },
    async (request, reply) => {
      await service.remove(getAuthUser(request).id, request.params.id);
      return reply.code(204).send();
    },
  );
};
