import type { ModelSpec } from '../config/models.js';
import type { ImageInput } from './types.js';

/**
 * Per-request hard limits (spec 4.3): max N LLM calls and ~M input tokens. When the next call would not fit,
 * the caller stops, stores the remaining work and offers "Devam et".
 */
export class RequestBudget {
  calls = 0;
  inputTokens = 0;
  outputTokens = 0;

  constructor(
    readonly maxCalls: number,
    readonly maxInputTokens: number,
  ) {}

  canAfford(estimatedInputTokens: number): boolean {
    return this.calls < this.maxCalls && this.inputTokens + estimatedInputTokens <= this.maxInputTokens;
  }

  charge(inputTokens: number, outputTokens: number): void {
    this.calls += 1;
    this.inputTokens += Math.max(0, inputTokens);
    this.outputTokens += Math.max(0, outputTokens);
  }

  get remainingCalls(): number {
    return Math.max(0, this.maxCalls - this.calls);
  }

  snapshot() {
    return {
      calls: this.calls,
      maxCalls: this.maxCalls,
      inputTokens: this.inputTokens,
      maxInputTokens: this.maxInputTokens,
      outputTokens: this.outputTokens,
    };
  }
}

/** Conservative estimate for Turkish text (≈3 characters per token). */
export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

export function estimateImageTokens(spec: ModelSpec | undefined, image: Pick<ImageInput, 'width' | 'height'>): number {
  const rule = spec?.imageTokens;
  if (!rule) return 2048;
  if (rule.kind === 'flat') return rule.tokensPerImage;
  const width = image.width ?? 1600;
  const height = image.height ?? 1200;
  if (width <= rule.smallMaxSide && height <= rule.smallMaxSide) return rule.tokensPerTile;
  return Math.ceil(width / rule.tileSize) * Math.ceil(height / rule.tileSize) * rule.tokensPerTile;
}

export function estimateRequestTokens(
  spec: ModelSpec | undefined,
  system: string,
  user: string,
  images: readonly Pick<ImageInput, 'width' | 'height'>[] = [],
): number {
  return (
    estimateTextTokens(system) + estimateTextTokens(user) + images.reduce((sum, img) => sum + estimateImageTokens(spec, img), 0)
  );
}
