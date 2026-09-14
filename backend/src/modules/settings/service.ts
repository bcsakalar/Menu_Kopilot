import type { AiServices } from '../../ai/index.js';
import { MODEL_CATALOG, TASK_KEYS, type TaskKey, eligibleModels } from '../../config/models.js';
import { TASK_LABELS } from '../../i18n/tr.js';
import type { ProviderSettings } from './schemas.js';

export class SettingsService {
  constructor(
    private readonly ai: AiServices,
    private readonly config: { localOnlyMode: boolean; timezone: string },
  ) {}

  private configured(provider: 'gemini' | 'groq'): boolean {
    return this.ai.providers[provider]?.isConfigured() ?? false;
  }

  async providerSettings(): Promise<ProviderSettings> {
    const all = await this.ai.routes.all();
    return {
      localOnlyMode: this.config.localOnlyMode,
      providers: (['gemini', 'groq'] as const).map((name) => ({
        name,
        configured: this.configured(name),
        circuit: this.ai.breaker.state(name),
      })),
      tasks: TASK_KEYS.map((taskKey) => ({
        taskKey,
        label: TASK_LABELS[taskKey],
        chain: (all.get(taskKey) ?? []).map((route) => ({
          id: route.model,
          provider: route.provider,
          label: MODEL_CATALOG[route.model]?.label ?? route.model,
          preview: MODEL_CATALOG[route.model]?.preview ?? false,
          priority: route.priority,
          enabled: route.enabled,
          providerConfigured: this.configured(route.provider),
        })),
        eligibleModels: eligibleModels(taskKey).map((m) => ({
          id: m.id,
          provider: m.provider,
          label: m.label,
          preview: m.preview,
        })),
      })),
    };
  }

  async setPrimary(task: TaskKey, model: string): Promise<ProviderSettings> {
    await this.ai.routes.setPrimary(task, model);
    return this.providerSettings();
  }

  async quota(userId: string) {
    const status = await this.ai.quota.status(userId);
    return { ...status, timezone: this.config.timezone, localOnlyMode: this.config.localOnlyMode };
  }
}
