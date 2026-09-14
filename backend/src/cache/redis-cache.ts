import { Redis } from 'ioredis';
import type { Cache } from './cache.js';

export class RedisCache implements Cache {
  readonly client: Redis;

  constructor(url: string) {
    this.client = new Redis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: true,
    });
  }

  async get(key: string): Promise<string | undefined> {
    const value = await this.client.get(key);
    return value ?? undefined;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', Math.max(1, Math.round(ttlSeconds)));
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async ping(): Promise<void> {
    await this.client.ping();
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}
