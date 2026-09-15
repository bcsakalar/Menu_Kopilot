import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getAuthUser } from '../../plugins/auth.js';
import {
  branchDtoSchema,
  branchMenuDtoSchema,
  createBranchSchema,
  exportQuerySchema,
  updateBranchSchema,
  updateMenuItemSchema,
} from './schemas.js';
import type { BranchService } from './service.js';

export const branchRoutes: FastifyPluginAsyncZod<{ service: BranchService }> = async (app, { service }) => {
  const security = [{ bearerAuth: [] }];
  const idParams = z.object({ id: z.uuid() });
  const itemParams = z.object({ id: z.uuid(), itemId: z.uuid() });

  app.get(
    '/branches/:id/menu',
    {
      schema: {
        tags: ['branches'],
        summary: 'Branch menu: items on the menu (ok / incomplete) and recommendations (missing)',
        security,
        params: idParams,
        response: { 200: branchMenuDtoSchema },
      },
    },
    async (request) => service.menu(getAuthUser(request).id, request.params.id),
  );

  app.patch(
    '/branches/:id/menu/:itemId',
    {
      schema: {
        tags: ['branches'],
        summary: 'Change the status of a menu item (e.g. a recommendation confirmed on the phone)',
        security,
        params: itemParams,
        body: updateMenuItemSchema,
        response: { 200: branchMenuDtoSchema },
      },
    },
    async (request) =>
      service.updateMenuItem(getAuthUser(request).id, request.params.id, request.params.itemId, request.body.status),
  );

  app.delete(
    '/branches/:id/menu/:itemId',
    { schema: { tags: ['branches'], security, params: itemParams } },
    async (request, reply) => {
      await service.removeMenuItem(getAuthUser(request).id, request.params.id, request.params.itemId);
      return reply.code(204).send();
    },
  );

  app.get(
    '/branches/:id/export',
    {
      schema: {
        tags: ['branches'],
        summary: 'Export the branch menu (CSV for Excel: UTF-8 BOM + ";", or JSON). No prices.',
        security,
        params: idParams,
        querystring: exportQuerySchema,
        produces: ['text/csv', 'application/json'],
      },
    },
    async (request, reply) => {
      const file = await service.export(getAuthUser(request).id, request.params.id, request.query.format);
      return reply
        .header('content-type', file.contentType)
        .header('content-disposition', `attachment; filename="${file.fileName}"`)
        .send(file.body);
    },
  );

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
