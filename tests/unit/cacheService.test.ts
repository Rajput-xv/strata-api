import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cache } from '@/infra/cache/cache.service';
import { redis } from '@/infra/cache/redis';

vi.mock('@/infra/cache/redis', async () => (await import('../helpers/mocks')).makeRedisModule());

// Exposed by the in-memory mock so we can reset between tests.
const store = (redis as unknown as { __store: Map<string, string> }).__store;

beforeEach(() => {
  store.clear();
});

describe('cache service', () => {
  it('round-trips a JSON value through get/set', async () => {
    await cache.set('k', { a: 1 });
    expect(await cache.get('k')).toEqual({ a: 1 });
  });

  it('returns null for a missing key', async () => {
    expect(await cache.get('nope')).toBeNull();
  });

  it('passes a TTL through to redis as EX', async () => {
    await cache.set('k', { a: 1 }, 300);
    expect(redis.set).toHaveBeenCalledWith('k', expect.any(String), 'EX', 300);
  });

  it('del forwards keys to redis', async () => {
    await cache.set('k', 1);
    await cache.del('k');
    expect(redis.del).toHaveBeenCalledWith('k');
    expect(await cache.get('k')).toBeNull();
  });

  it('del is a no-op with no keys', async () => {
    await cache.del();
    expect(redis.del).not.toHaveBeenCalled();
  });

  describe('wrap', () => {
    it('computes and stores on a miss', async () => {
      const producer = vi.fn(async () => ({ v: 42 }));
      const result = await cache.wrap('w', 60, producer);
      expect(result).toEqual({ v: 42 });
      expect(producer).toHaveBeenCalledTimes(1);
      expect(await cache.get('w')).toEqual({ v: 42 });
    });

    it('returns the cached value on a hit without calling the producer', async () => {
      await cache.set('w', { v: 1 });
      const producer = vi.fn(async () => ({ v: 2 }));
      const result = await cache.wrap('w', 60, producer);
      expect(result).toEqual({ v: 1 });
      expect(producer).not.toHaveBeenCalled();
    });
  });

  it('invalidatePattern deletes scanned keys via a pipeline', async () => {
    await cache.set('user:1', 1);
    await cache.set('user:2', 2);
    await cache.invalidatePattern('user:*');
    const pipe = vi.mocked(redis.pipeline).mock.results[0].value as { del: ReturnType<typeof vi.fn>; exec: ReturnType<typeof vi.fn> };
    expect(pipe.del).toHaveBeenCalled();
    expect(pipe.exec).toHaveBeenCalled();
  });
});
