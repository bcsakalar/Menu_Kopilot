import { z, type ZodType } from 'zod';

/**
 * Zod → JSON Schema, then provider-specific sanitizing (see docs/PROVIDER_NOTES.md):
 * - Gemini: documented subset (no minLength/maxLength/pattern), no $schema/default/examples.
 * - Groq strict: every property required, optional → nullable, additionalProperties:false,
 *   and none of minLength/maxLength/pattern/format (numeric/array bounds dropped too — Zod enforces them).
 */

export type JsonSchema = { [key: string]: JsonValue };
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function isObject(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toJsonSchema(schema: ZodType): JsonSchema {
  const out = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'output', unrepresentable: 'any' });
  return JSON.parse(JSON.stringify(out)) as JsonSchema;
}

const GEMINI_DROP = new Set(['$schema', 'minLength', 'maxLength', 'pattern', 'default', 'examples', '$id', 'id']);
const GROQ_DROP = new Set([
  '$schema',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'default',
  'examples',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minItems',
  'maxItems',
  'uniqueItems',
  '$id',
  'id',
]);

function transform(node: JsonValue, visit: (obj: { [key: string]: JsonValue }) => { [key: string]: JsonValue }): JsonValue {
  if (Array.isArray(node)) return node.map((n) => transform(n, visit));
  if (!isObject(node)) return node;
  const copy: { [key: string]: JsonValue } = {};
  for (const [key, value] of Object.entries(node)) {
    copy[key] = transform(value, visit);
  }
  return visit(copy);
}

function constToEnum(obj: { [key: string]: JsonValue }): void {
  if ('const' in obj) {
    const value = obj['const'];
    delete obj['const'];
    if (value !== undefined) obj['enum'] = [value];
  }
}

export function forGemini(schema: JsonSchema): JsonSchema {
  const result = transform(schema, (obj) => {
    for (const key of Object.keys(obj)) if (GEMINI_DROP.has(key)) delete obj[key];
    constToEnum(obj);
    return obj;
  });
  return result as JsonSchema;
}

function nullable(node: JsonValue): JsonValue {
  if (!isObject(node)) return node;
  const anyOf = node['anyOf'];
  if (Array.isArray(anyOf) && anyOf.some((n) => isObject(n) && n['type'] === 'null')) return node;
  if (node['type'] === 'null') return node;
  return { anyOf: [node, { type: 'null' }] };
}

export function forGroqStrict(schema: JsonSchema): JsonSchema {
  const result = transform(schema, (obj) => {
    for (const key of Object.keys(obj)) if (GROQ_DROP.has(key)) delete obj[key];
    constToEnum(obj);
    const properties = obj['properties'];
    if (obj['type'] === 'object' || isObject(properties)) {
      const props = isObject(properties) ? properties : {};
      const required = new Set(Array.isArray(obj['required']) ? obj['required'].filter((r) => typeof r === 'string') : []);
      for (const key of Object.keys(props)) {
        const prop = props[key];
        if (!required.has(key) && prop !== undefined) props[key] = nullable(prop);
      }
      obj['properties'] = props;
      obj['required'] = Object.keys(props);
      obj['additionalProperties'] = false;
    }
    return obj;
  });
  return result as JsonSchema;
}

/** Compact schema text for prompts of JSON-mode-only models. */
export function describeSchema(schema: JsonSchema): string {
  return JSON.stringify(forGemini(schema));
}
