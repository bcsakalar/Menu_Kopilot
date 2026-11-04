import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { conversationDetailSchema } from '../chat/schemas.js';
import type { AdminService } from './service.js';

const security = [{ bearerAuth: [] }];

const overviewSchema = z.object({
  range: z.enum(['today', 'month']),
  visitors: z.number().int(),
  conversations: z.number().int(),
  runs: z.number().int(),
  cards: z.object({ total: z.number().int(), accepted: z.number().int(), rejected: z.number().int(), later: z.number().int() }),
  llm: z.object({ calls: z.number().int(), failed: z.number().int(), tokens: z.number().int() }),
  /** New products visitors said yes to, waiting for the admin. */
  drafts: z.number().int(),
  topCuisines: z.array(z.object({ name: z.string(), runs: z.number().int() })),
  site: z.object({ callsToday: z.number().int(), dailyCalls: z.number().int() }),
});

const conversationRowSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  messages: z.number().int(),
  visitor: z.string(),
  updatedAt: z.string(),
  createdAt: z.string(),
});

export const adminRoutes: FastifyPluginAsyncZod<{ service: AdminService }> = async (app, { service }) => {
  app.get(
    '/admin/overview',
    {
      schema: {
        tags: ['admin'],
        summary: 'How the site is used: visitors, calls, analyses, answers, AI spend',
        security,
        querystring: z.object({ range: z.enum(['today', 'month']).default('today') }),
        response: { 200: overviewSchema },
      },
    },
    async (request) => service.overview(request.query.range),
  );

  app.get(
    '/admin/conversations',
    {
      schema: {
        tags: ['admin'],
        summary: 'Every conversation on the site, newest first',
        security,
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(30),
          before: z.iso.datetime({ offset: true }).optional(),
        }),
        response: { 200: z.object({ data: z.array(conversationRowSchema), nextBefore: z.string().nullable() }) },
      },
    },
    async (request) => service.conversations(request.query.limit, request.query.before),
  );

  app.get(
    '/admin/conversations/:id',
    {
      schema: { tags: ['admin'], security, params: z.object({ id: z.uuid() }), response: { 200: conversationDetailSchema } },
    },
    async (request) => service.conversation(request.params.id),
  );
};
