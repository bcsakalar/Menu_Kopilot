import type { FastifyReply } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { getAuthUser } from '../../plugins/auth.js';
import {
  createTemplateSchema,
  importReportSchema,
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

  const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const sendWorkbook = (reply: FastifyReply, file: Buffer, name: string) =>
    reply.header('content-type', XLSX).header('content-disposition', `attachment; filename="${name}"`).send(file);

  app.get(
    '/templates/excel/sample',
    { schema: { tags: ['templates'], summary: 'Sample .xlsx to fill in: example rows, how to fill it, cuisine list', security } },
    async (_request, reply) => sendWorkbook(reply, await service.sampleWorkbook(), 'menu-kopilot-sablon-ornegi.xlsx'),
  );

  app.get(
    '/templates/excel/export',
    {
      schema: {
        tags: ['templates'],
        summary: 'The approved pool (one cuisine or all) as .xlsx, in the import layout',
        security,
        querystring: z.object({ cuisineId: z.uuid().optional() }),
      },
    },
    async (request, reply) => sendWorkbook(reply, await service.exportWorkbook(request.query.cuisineId), 'menu-kopilot-sablonlar.xlsx'),
  );

  app.post(
    '/templates/excel/import',
    {
      schema: {
        tags: ['templates'],
        summary: 'Create / update templates from a filled .xlsx (multipart "file"); dryRun=true only previews',
        security,
        querystring: z.object({ dryRun: z.enum(['true', 'false']).default('true') }),
        response: { 200: importReportSchema },
      },
    },
    async (request) => {
      const part = await request.file();
      if (!part) throw new AppError('VALIDATION_ERROR', 'Dosya seçilmedi');
      const file = await part.toBuffer();
      return service.importWorkbook(getAuthUser(request).id, file, request.query.dryRun === 'true');
    },
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
