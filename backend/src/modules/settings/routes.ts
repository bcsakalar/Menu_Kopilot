import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { getAuthUser } from '../../plugins/auth.js';
import { providerSettingsSchema, quotaSchema, setPrimaryBodySchema, setPrimaryParamsSchema } from './schemas.js';
import type { SettingsService } from './service.js';

export const settingsRoutes: FastifyPluginAsyncZod<{ service: SettingsService }> = async (app, { service }) => {
  const security = [{ bearerAuth: [] }];

  app.get(
    '/settings/providers',
    {
      schema: {
        tags: ['settings'],
        summary: 'Task → model routing (primary + fallbacks) and the models eligible per task',
        security,
        response: { 200: providerSettingsSchema },
      },
    },
    async () => service.providerSettings(),
  );

  app.put(
    '/settings/providers/:taskKey',
    {
      schema: {
        tags: ['settings'],
        summary: 'Make a model the primary route of a task (others stay as fallbacks)',
        security,
        params: setPrimaryParamsSchema,
        body: setPrimaryBodySchema,
        response: { 200: providerSettingsSchema },
      },
    },
    async (request) => service.setPrimary(request.params.taskKey, request.body.model),
  );

  app.get(
    '/settings/quota',
    { schema: { tags: ['settings'], summary: 'Daily LLM quota usage', security, response: { 200: quotaSchema } } },
    async (request) => service.quota(getAuthUser(request).id),
  );
};
