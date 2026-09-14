import type { ZodType } from 'zod';

/** Key/value cache with TTLs (Redis in runtime, in-memory in tests). Every key MUST have a TTL. */
export interface Cache {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

export async function getJson<T>(cache: Cache, key: string, schema: ZodType<T>): Promise<T | undefined> {
  const raw = await cache.get(key);
  if (raw === undefined) return undefined;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export async function setJson(cache: Cache, key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await cache.set(key, JSON.stringify(value), ttlSeconds);
}

export class MemoryCache implements Cache {
  private readonly store = new Map<string, { value: string; expiresAt: number }>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  get(key: string): Promise<string | undefined> {
    const entry = this.store.get(key);
    if (!entry) return Promise.resolve(undefined);
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return Promise.resolve(undefined);
    }
    return Promise.resolve(entry.value);
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
    return Promise.resolve();
  }

  del(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }

  ping(): Promise<void> {
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.store.clear();
    return Promise.resolve();
  }

  /** Test helper. */
  keys(): string[] {
    return [...this.store.keys()];
  }
}
