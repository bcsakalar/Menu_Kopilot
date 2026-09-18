import type { ZodError, ZodType } from 'zod';
import type { ModelSpec, ProviderName, RouteParams } from '../../config/models.js';
import { ProviderError } from '../errors.js';

export function formatZodIssues(error: ZodError, limit = 25): string[] {
  return error.issues.slice(0, limit).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${path}: ${issue.message}`;
  });
}

/**
 * Output token budget of one call: what the caller asks for (or the route default), never above the route's own cap
 * (e.g. a free-tier per-minute limit, D-141) or the model's maximum.
 */
export function outputTokenLimit(requested: number | undefined, params: RouteParams, spec: ModelSpec): number {
  const routeCap = params.maxOutputTokens ?? spec.maxOutputTokens;
  return Math.min(requested ?? params.maxOutputTokens ?? 4096, routeCap, spec.maxOutputTokens);
}

/** Parses model output that should be JSON; tolerates code fences and leading/trailing prose. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)?.[1];
    if (fenced !== undefined) return JSON.parse(fenced.trim());
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error('no JSON object found');
  }
}

export function validateOutput<T>(
  schema: ZodType<T>,
  raw: string,
  context: { provider: ProviderName; model: string },
): { ok: true; value: T } | { ok: false; error: ProviderError } {
  let parsed: unknown;
  try {
    parsed = extractJson(raw);
  } catch (err) {
    return {
      ok: false,
      error: new ProviderError({
        kind: 'invalid_output',
        message: `Model output is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        provider: context.provider,
        model: context.model,
        raw,
        issues: ['(root): geçerli JSON değil'],
      }),
    };
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: new ProviderError({
        kind: 'invalid_output',
        message: 'Model output does not match the schema',
        provider: context.provider,
        model: context.model,
        raw,
        issues: formatZodIssues(result.error),
      }),
    };
  }
  return { ok: true, value: result.data };
}

/** Combines the caller's abort signal with a per-attempt timeout. */
export function withTimeout(signal: AbortSignal | undefined, timeoutMs: number | undefined) {
  const timeout = AbortSignal.timeout(timeoutMs ?? 60_000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  return {
    signal: combined,
    abortedByCaller: () => signal?.aborted === true,
    timedOut: () => timeout.aborted,
  };
}
