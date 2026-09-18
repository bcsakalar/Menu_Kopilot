import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { forGemini, forGroqStrict, type JsonSchema, toJsonSchema } from '../../src/ai/json-schema.js';

const schema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        description: z.string().max(160),
        price_mode: z.enum(['free', 'surcharge', 'sets_base']),
        section: z.string().nullable(),
        note: z.string().optional(),
        confidence: z.number().min(0).max(1),
        kind: z.literal('product'),
      }),
    )
    .max(80),
});

function walk(node: unknown, visit: (obj: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, visit));
    return;
  }
  if (typeof node === 'object' && node !== null) {
    const obj = node as Record<string, unknown>;
    visit(obj);
    Object.values(obj).forEach((v) => walk(v, visit));
  }
}

function collectKeys(schemaJson: JsonSchema): Set<string> {
  const keys = new Set<string>();
  walk(schemaJson, (obj) => Object.keys(obj).forEach((k) => keys.add(k)));
  return keys;
}

describe('provider JSON schema sanitizers', () => {
  const base = toJsonSchema(schema);

  it('Groq strict: every property required, optional → nullable, closed objects, no unsupported keywords', () => {
    const groq = forGroqStrict(base);
    const keys = collectKeys(groq);
    for (const banned of ['minLength', 'maxLength', 'pattern', 'format', 'minimum', 'maximum', 'maxItems', '$schema', 'const']) {
      expect(keys.has(banned), banned).toBe(false);
    }
    walk(groq, (obj) => {
      if (obj['type'] === 'object') {
        expect(obj['additionalProperties']).toBe(false);
        const props = Object.keys((obj['properties'] as Record<string, unknown>) ?? {});
        expect(obj['required']).toEqual(props);
      }
    });
    const item = ((groq['properties'] as Record<string, JsonSchema>)['items'] as JsonSchema)['items'] as JsonSchema;
    const note = (item['properties'] as Record<string, JsonSchema>)['note'];
    expect(note).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] });
    const kind = (item['properties'] as Record<string, JsonSchema>)['kind'];
    expect(kind?.['enum']).toEqual(['product']);
  });

  it('Gemini: keeps the supported subset and drops string length/pattern and array length keywords', () => {
    const gemini = forGemini(base);
    const keys = collectKeys(gemini);
    expect(keys.has('maxLength')).toBe(false);
    expect(keys.has('minLength')).toBe(false);
    expect(keys.has('$schema')).toBe(false);
    // The Interactions API answers 400 "invalid argument" for these (D-141); Zod enforces the caps after parsing.
    expect(keys.has('maxItems')).toBe(false);
    expect(keys.has('minItems')).toBe(false);
    expect(keys.has('enum')).toBe(true);
    expect(keys.has('minimum')).toBe(true);
  });
});
