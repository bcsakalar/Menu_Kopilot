import type { ProviderName } from '../config/models.js';

export type ProviderErrorKind =
  | 'rate_limited'
  | 'unavailable'
  | 'timeout'
  | 'auth'
  | 'not_configured'
  | 'bad_request'
  | 'invalid_output'
  | 'unsupported'
  | 'content_blocked'
  | 'local_only'
  | 'quota_exceeded'
  | 'budget_exceeded'
  | 'aborted';

export interface ProviderErrorInit {
  kind: ProviderErrorKind;
  message: string;
  provider?: ProviderName;
  model?: string;
  status?: number;
  retryAfterMs?: number;
  /** Raw model output for invalid_output (used by the single repair attempt). */
  raw?: string;
  /** Validation issues for invalid_output. */
  issues?: string[];
}

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly provider: ProviderName | undefined;
  readonly model: string | undefined;
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;
  readonly raw: string | undefined;
  readonly issues: string[] | undefined;

  constructor(init: ProviderErrorInit) {
    super(init.message);
    this.name = 'ProviderError';
    this.kind = init.kind;
    this.provider = init.provider;
    this.model = init.model;
    this.status = init.status;
    this.retryAfterMs = init.retryAfterMs;
    this.raw = init.raw;
    this.issues = init.issues;
  }
}

export function kindForStatus(status: number): ProviderErrorKind {
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'auth';
  if (status === 408 || status === 504) return 'timeout';
  if (status >= 500) return 'unavailable';
  return 'bad_request';
}

/** Errors that say nothing about the provider's health and should not trip the circuit breaker. */
export function isCallerError(kind: ProviderErrorKind): boolean {
  return (
    kind === 'invalid_output' ||
    kind === 'bad_request' ||
    kind === 'unsupported' ||
    kind === 'content_blocked' ||
    kind === 'aborted' ||
    kind === 'budget_exceeded' ||
    kind === 'quota_exceeded' ||
    kind === 'local_only'
  );
}
