import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { PromptRepository } from '../../ai/prompt-repository.js';
import { PROMPT_KEYS } from '../../db/seed/prompts.js';
import { requireAdmin } from '../../plugins/auth.js';

const promptDtoSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  version: z.number().int(),
  content: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

type PromptRow = { id: string; key: string; version: number; content: string; isActive: boolean; createdAt: Date };
const toDto = (row: PromptRow) => ({ ...row, createdAt: row.createdAt.toISOString() });

/** Versioned prompt management: improve prompts without redeploying (admin only). */
export const promptRoutes: FastifyPluginAsyncZod<{ prompts: PromptRepository }> = async (app, { prompts }) => {
  const security = [{ bearerAuth: [] }];

  app.get(
    '/prompts',
    { schema: { tags: ['prompts'], security, response: { 200: z.object({ data: z.array(promptDtoSchema) }) } } },
    async (request) => {
      requireAdmin(request);
      return { data: (await prompts.list()).map(toDto) };
    },
  );

  app.post(
    '/prompts',
    {
      schema: {
        tags: ['prompts'],
        summary: 'Create the next version of a prompt (optionally activate it)',
        security,
        body: z.object({
          key: z.enum(PROMPT_KEYS),
          content: z.string().min(1).max(20_000),
          activate: z.boolean().default(true),
        }),
        response: { 201: promptDtoSchema },
      },
    },
    async (request, reply) => {
      requireAdmin(request);
      const row = await prompts.createVersion(request.body.key, request.body.content, request.body.activate);
      return reply.code(201).send(toDto(row));
    },
  );

  app.post(
    '/prompts/:id/activate',
    {
      schema: {
        tags: ['prompts'],
        security,
        params: z.object({ id: z.uuid() }),
        response: { 200: promptDtoSchema },
      },
    },
    async (request) => {
      requireAdmin(request);
      return toDto(await prompts.activate(request.params.id));
    },
  );
};
