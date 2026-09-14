import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEV_JWT_SECRET, ENV_KEYS, parseEnv } from '../../src/config/env.js';
import { parseDurationMs } from '../../src/lib/duration.js';

describe('parseEnv', () => {
  it('applies defaults for local development', () => {
    const config = parseEnv({ DATABASE_URL: 'postgres://x' });
    expect(config.port).toBe(3000);
    expect(config.budget).toEqual({ maxLlmCalls: 6, maxInputTokens: 25_000 });
    expect(config.retrieval).toEqual({ trigramThreshold: 0.72, vectorThreshold: 0.85 });
    expect(config.providers.localOnlyMode).toBe(false);
    expect(config.providers.geminiApiKey).toBeUndefined();
  });

  it('treats empty provider keys as missing and parses booleans', () => {
    const config = parseEnv({ DATABASE_URL: 'postgres://x', GEMINI_API_KEY: '  ', LOCAL_ONLY_MODE: 'true' });
    expect(config.providers.geminiApiKey).toBeUndefined();
    expect(config.providers.localOnlyMode).toBe(true);
  });

  it('refuses dev secrets in production', () => {
    expect(() => parseEnv({ DATABASE_URL: 'postgres://x', NODE_ENV: 'production', JWT_SECRET: DEV_JWT_SECRET })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('keeps .env.example in sync with the supported variables', () => {
    const examplePath = fileURLToPath(new URL('../../../.env.example', import.meta.url));
    const example = readFileSync(examplePath, 'utf8');
    const declared = new Set(
      example
        .split(/\r?\n/)
        .map((line) => /^#?\s*([A-Z0-9_]+)=/.exec(line)?.[1])
        .filter((k): k is string => k !== undefined),
    );
    for (const key of ENV_KEYS) {
      expect(declared.has(key), `${key} missing from .env.example`).toBe(true);
    }
  });
});

describe('parseDurationMs', () => {
  it.each([
    ['2m59.56s', 179_560],
    ['7.66s', 7_660],
    ['250ms', 250],
    ['1h2m', 3_720_000],
    ['12h', 43_200_000],
    ['2', 2_000],
  ])('%s → %i ms', (input, expected) => {
    expect(parseDurationMs(input)).toBe(expected);
  });

  it('returns undefined for garbage', () => {
    expect(parseDurationMs('soon')).toBeUndefined();
    expect(parseDurationMs('')).toBeUndefined();
    expect(parseDurationMs(undefined)).toBeUndefined();
  });
});
