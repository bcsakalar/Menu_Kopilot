import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

export interface HealthProbe {
  name: string;
  check(): Promise<void>;
}

const readySchema = z.object({
  status: z.enum(['ready', 'degraded']),
  checks: z.record(z.string(), z.enum(['ok', 'fail'])),
});

export const healthRoutes: FastifyPluginAsyncZod<{ probes: readonly HealthProbe[]; version: string }> = async (
  app,
  { probes, version },
) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Liveness',
        response: { 200: z.object({ status: z.literal('ok'), version: z.string(), uptimeSeconds: z.number() }) },
      },
    },
    async () => ({ status: 'ok' as const, version, uptimeSeconds: Math.round(process.uptime()) }),
  );

  app.get(
    '/health/ready',
    { schema: { tags: ['health'], summary: 'Readiness (database + redis)', response: { 200: readySchema, 503: readySchema } } },
    async (request, reply) => {
      const results = await Promise.all(
        probes.map(async (probe) => {
          try {
            await probe.check();
            return [probe.name, 'ok'] as const;
          } catch (err) {
            request.log.warn({ err, probe: probe.name }, 'readiness probe failed');
            return [probe.name, 'fail'] as const;
          }
        }),
      );
      const checks = Object.fromEntries(results);
      const ok = results.every(([, state]) => state === 'ok');
      return reply.code(ok ? 200 : 503).send({ status: ok ? 'ready' : 'degraded', checks });
    },
  );
};
