import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getAuthUser } from '../../plugins/auth.js';
import {
  createTemplateSchema,
  templateDtoSchema,
  templateListQuerySchema,
  templateListSchema,
  updateTemplateSchema,
} from './schemas.js';
import type { TemplateService } from './service.js';

export const templateRoutes: FastifyPluginAsyncZod<{ service: TemplateService }> = async (app, { service }) => {
  const security = [{ bearerAuth: [] }];
  const idParams = z.object({ id: z.uuid() });

  app.get(
    '/templates',
    {
      schema: {
        tags: ['templates'],
        summary: 'Template pool: search (name or alias), filter (cuisine, source, approved), sort (usage, name, updated)',
        security,
        querystring: templateListQuerySchema,
        response: { 200: templateListSchema },
      },
    },
    async (request) => service.list(request.query),
  );

  app.get(
    '/templates/:id',
    { schema: { tags: ['templates'], security, params: idParams, response: { 200: templateDtoSchema } } },
    async (request) => service.get(request.params.id),
  );

  app.post(
    '/templates',
    {
      schema: {
        tags: ['templates'],
        summary: 'Create an approved template (source = user)',
        security,
        body: createTemplateSchema,
        response: { 201: templateDtoSchema },
      },
    },
    async (request, reply) => reply.code(201).send(await service.create(getAuthUser(request).id, request.body)),
  );

  app.patch(
    '/templates/:id',
    {
      schema: {
        tags: ['templates'],
        summary: 'Edit content, aliases, cuisine, importance or approve a draft',
        security,
        params: idParams,
        body: updateTemplateSchema,
        response: { 200: templateDtoSchema },
      },
    },
    async (request) => service.update(request.params.id, request.body),
  );

  app.delete(
    '/templates/:id',
    {
      schema: {
        tags: ['templates'],
        summary: 'Delete a template (seed templates are archived so re-seeding does not restore them)',
        security,
        params: idParams,
        response: { 200: z.object({ archived: z.boolean() }) },
      },
    },
    async (request) => service.remove(request.params.id),
  );
};
