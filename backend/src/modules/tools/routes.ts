import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { ToolsService } from './service.js';

/**
 * The tools page's server side (D-218): the dictionary and description ideas from the pool (D-220). The text, spreadsheet
 * and image work itself runs in the browser.
 */
export const toolsRoutes: FastifyPluginAsyncZod<{ service: ToolsService }> = async (app, { service }) => {
  app.get(
    '/tools/lexicon',
    {
      // Read-only and the same for everyone; per address and generous, since a whole office opens the tools at once.
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        tags: ['tools'],
        summary: "The approved pool's words with their counts, for the text tool's Turkish letters and spelling",
        response: { 200: z.object({ words: z.array(z.tuple([z.string(), z.number().int()])) }) },
      },
    },
    async (_request, reply) => {
      reply.header('cache-control', 'public, max-age=3600');
      return { words: await service.lexicon() };
    },
  );

  app.post(
    '/tools/describe',
    {
      // A spreadsheet's names in one go; per address and generous like the dictionary, one office shares an address.
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        tags: ['tools'],
        summary: 'Approved pool descriptions for product names, matched without a model',
        body: z.object({ names: z.array(z.string().trim().max(200)).min(1).max(500) }),
        response: {
          200: z.object({
            items: z.array(z.object({ name: z.string(), ideas: z.array(z.object({ name: z.string(), description: z.string(), score: z.number() })) })),
          }),
        },
      },
    },
    async (request) => {
      const { names } = request.body;
      const ideas = await service.describe(names);
      return { items: names.map((name, index) => ({ name, ideas: ideas[index] ?? [] })) };
    },
  );
};
