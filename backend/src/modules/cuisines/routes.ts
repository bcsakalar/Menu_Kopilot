import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getAuthUser } from '../../plugins/auth.js';
import {
  categoryDtoSchema,
  createCuisineSchema,
  cuisineCategoryDtoSchema,
  cuisineDtoSchema,
  putCuisineCategoriesSchema,
  updateCategorySchema,
  updateCuisineSchema,
} from './schemas.js';
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

  // Category taxonomy + per-cuisine expectations: what the Gap Analyst measures a menu against. Kept in Postgres
  // and edited here so a new category or a changed minimum never needs a deploy.
  const keyParams = z.object({ key: z.string().regex(/^[a-z0-9-]{2,40}$/u) });

  app.get(
    '/categories',
    { schema: { tags: ['cuisines'], security, response: { 200: z.object({ data: z.array(categoryDtoSchema) }) } } },
    async () => ({ data: await service.listCategories() }),
  );

  app.patch(
    '/categories/:key',
    {
      schema: {
        tags: ['cuisines'],
        summary: 'Edit a category (label, order, the keywords that classify a product into it)',
        security,
        params: keyParams,
        body: updateCategorySchema,
        response: { 200: categoryDtoSchema },
      },
    },
    async (request) => service.updateCategory(request.params.key, request.body),
  );

  app.get(
    '/cuisines/:id/categories',
    {
      schema: {
        tags: ['cuisines'],
        security,
        params: idParams,
        response: { 200: z.object({ data: z.array(cuisineCategoryDtoSchema) }) },
      },
    },
    async (request) => ({ data: await service.cuisineCategories(request.params.id) }),
  );

  app.put(
    '/cuisines/:id/categories',
    {
      schema: {
        tags: ['cuisines'],
        summary: 'Replace the categories a cuisine is expected to have, with a minimum product count for each',
        security,
        params: idParams,
        body: putCuisineCategoriesSchema,
        response: { 200: z.object({ data: z.array(cuisineCategoryDtoSchema) }) },
      },
    },
    async (request) => ({ data: await service.replaceCuisineCategories(request.params.id, request.body) }),
  );
};
