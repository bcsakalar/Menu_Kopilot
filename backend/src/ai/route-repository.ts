import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  DEFAULT_ROUTES,
  type ProviderName,
  type RouteParams,
  TASK_KEYS,
  type TaskKey,
  eligibleModels,
  getModelSpec,
} from '../config/models.js';
import type { Database } from '../db/client.js';
import { providerConfigs } from '../db/schema/index.js';
import { AppError } from '../lib/errors.js';

export interface ResolvedRoute {
  id: string | undefined;
  provider: ProviderName;
  model: string;
  params: RouteParams;
  priority: number;
  enabled: boolean;
}

const routeParamsSchema = z
  .object({
    maxOutputTokens: z.number().int().positive().optional(),
    thinkingLevel: z.string().optional(),
    reasoningEffort: z.string().optional(),
    temperature: z.number().optional(),
    dim: z.number().int().positive().optional(),
  })
  .catch({});

const providerSchema = z.enum(['gemini', 'groq']);

function cleanParams(raw: unknown): RouteParams {
  const parsed = routeParamsSchema.parse(raw);
  const out: RouteParams = {};
  if (parsed.maxOutputTokens !== undefined) out.maxOutputTokens = parsed.maxOutputTokens;
  if (parsed.thinkingLevel !== undefined) out.thinkingLevel = parsed.thinkingLevel;
  if (parsed.reasoningEffort !== undefined) out.reasoningEffort = parsed.reasoningEffort;
  if (parsed.temperature !== undefined) out.temperature = parsed.temperature;
  if (parsed.dim !== undefined) out.dim = parsed.dim;
  return out;
}

/** Task routing from `provider_configs` (30 s cache); falls back to DEFAULT_ROUTES when a task has no rows. */
export class RouteRepository {
  private cache: { at: number; routes: Map<TaskKey, ResolvedRoute[]> } | undefined;

  constructor(
    private readonly db: Database,
    private readonly ttlMs = 30_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  invalidate(): void {
    this.cache = undefined;
  }

  private async loadAll(): Promise<Map<TaskKey, ResolvedRoute[]>> {
    if (this.cache && this.now() - this.cache.at < this.ttlMs) return this.cache.routes;
    const rows = await this.db.select().from(providerConfigs).orderBy(asc(providerConfigs.priority));
    const routes = new Map<TaskKey, ResolvedRoute[]>();
    for (const task of TASK_KEYS) {
      const forTask = rows
        .filter((r) => r.taskKey === task)
        .flatMap((r): ResolvedRoute[] => {
          const provider = providerSchema.safeParse(r.provider);
          if (!provider.success) return [];
          return [
            {
              id: r.id,
              provider: provider.data,
              model: r.model,
              params: cleanParams(r.params),
              priority: r.priority,
              enabled: r.enabled,
            },
          ];
        });
      routes.set(
        task,
        forTask.length > 0
          ? forTask
          : DEFAULT_ROUTES[task].map((d, i) => ({
              id: undefined,
              provider: d.provider,
              model: d.model,
              params: { ...d.params },
              priority: i,
              enabled: true,
            })),
      );
    }
    this.cache = { at: this.now(), routes };
    return routes;
  }

  /** Enabled routes for the task, lowest priority first (index 0 = primary, rest = fallback chain). */
  async chain(task: TaskKey): Promise<ResolvedRoute[]> {
    const all = await this.loadAll();
    return (all.get(task) ?? []).filter((r) => r.enabled);
  }

  async all(): Promise<Map<TaskKey, ResolvedRoute[]>> {
    return this.loadAll();
  }

  /** Makes `model` the primary route of `task`, keeping the others as fallbacks in their current order. */
  async setPrimary(task: TaskKey, model: string): Promise<void> {
    const spec = getModelSpec(model);
    if (!spec || !eligibleModels(task).some((m) => m.id === model)) {
      throw new AppError('VALIDATION_ERROR', `${model} bu görev için uygun değil`);
    }
    await this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(providerConfigs)
        .where(eq(providerConfigs.taskKey, task))
        .orderBy(asc(providerConfigs.priority));
      let target = rows.find((r) => r.model === model && r.provider === spec.provider);
      if (!target) {
        const defaults = DEFAULT_ROUTES[task].find((d) => d.model === model)?.params ?? {};
        const [inserted] = await tx
          .insert(providerConfigs)
          .values({ taskKey: task, provider: spec.provider, model, params: { ...defaults }, priority: -1, enabled: true })
          .returning();
        target = inserted;
      }
      if (!target) throw new AppError('INTERNAL_ERROR', 'Rota kaydedilemedi');
      const ordered = [target, ...rows.filter((r) => r.id !== target.id)];
      for (const [index, row] of ordered.entries()) {
        await tx
          .update(providerConfigs)
          .set({ priority: index, ...(row.id === target.id ? { enabled: true } : {}) })
          .where(eq(providerConfigs.id, row.id));
      }
    });
    this.invalidate();
  }
}
