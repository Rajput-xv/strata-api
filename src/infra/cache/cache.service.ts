import { redis } from '@/infra/cache/redis';
import { logger } from '@/core/logger/logger';

/** Thin JSON cache-aside helper over Redis. */
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  },

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const raw = JSON.stringify(value);
    if (ttlSeconds) await redis.set(key, raw, 'EX', ttlSeconds);
    else await redis.set(key, raw);
  },

  async del(...keys: string[]): Promise<void> {
    if (keys.length) await redis.del(...keys);
  },

  /** Cache-aside: return cached value or compute, store, and return it. */
  async wrap<T>(key: string, ttlSeconds: number, producer: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const fresh = await producer();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  },

  /** Non-blocking pattern invalidation using SCAN (never use KEYS in production). */
  async invalidatePattern(pattern: string): Promise<void> {
    const stream = redis.scanStream({ match: pattern, count: 100 });
    const pipeline = redis.pipeline();
    let count = 0;
    for await (const keys of stream) {
      for (const k of keys as string[]) {
        pipeline.del(k);
        count++;
      }
    }
    if (count) await pipeline.exec();
    logger.debug({ pattern, count }, 'cache pattern invalidated');
  },
};
