/**
 * Parses Go-style durations as used by Groq rate-limit headers ("2m59.56s", "7.66s", "1h2m", "250ms")
 * and simple TTL strings ("12h", "30d"). Returns milliseconds, or undefined when unparseable.
 */
const UNIT_MS: Readonly<Record<string, number>> = {
  ns: 1e-6,
  us: 1e-3,
  µs: 1e-3,
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function parseDurationMs(input: string | null | undefined): number | undefined {
  if (input === null || input === undefined) return undefined;
  const value = input.trim();
  if (value === '') return undefined;
  if (/^\d+(\.\d+)?$/.test(value)) return Math.round(Number(value) * 1000); // plain seconds
  const pattern = /(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h|d)/g;
  let total = 0;
  let consumed = 0;
  for (const match of value.matchAll(pattern)) {
    const [whole, amount, unit] = match;
    if (amount === undefined || unit === undefined) return undefined;
    const factor = UNIT_MS[unit];
    if (factor === undefined) return undefined;
    total += Number(amount) * factor;
    consumed += whole.length;
  }
  if (consumed !== value.length) return undefined;
  return Math.round(total);
}

export function durationToSeconds(input: string): number {
  const ms = parseDurationMs(input);
  if (ms === undefined) throw new Error(`Invalid duration: ${input}`);
  return Math.round(ms / 1000);
}
