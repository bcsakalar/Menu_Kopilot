import type { ZodError } from 'zod';

/** Compact validation issues for repair prompts and logs. */
export function formatZodIssuesShort(error: ZodError, limit = 8): string[] {
  return error.issues.slice(0, limit).map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
}
