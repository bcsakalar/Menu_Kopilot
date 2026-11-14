import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { ToolsService } from './service.js';

/** The tools page's server side (D-218): only the dictionary; the text, spreadsheet and image work runs in the browser. */
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
};
