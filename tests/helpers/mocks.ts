import { vi } from 'vitest';

/** In-memory stand-in for the ioredis client used across the app.
 *  Deliberately omits `defineCommand`/`rlflxIncr` so RateLimiterRedis falls back
 *  to its in-memory insurance limiter instead of touching a real Redis. */
export function makeRedisModule() {
  const store = new Map<string, string>();
  const pipe = { del: vi.fn(() => pipe), exec: vi.fn(async () => [] as unknown[]) };
  const redis = {
    status: 'ready' as const,
    __store: store,
    get: vi.fn(async (k: string) => (store.has(k) ? store.get(k)! : null)),
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    }),
    del: vi.fn(async (...keys: string[]) => {
      let n = 0;
      for (const k of keys) if (store.delete(k)) n++;
      return n;
    }),
    ping: vi.fn(async () => 'PONG'),
    quit: vi.fn(async () => 'OK'),
    on: vi.fn(),
    pipeline: vi.fn(() => pipe),
    scanStream: vi.fn(() => {
      const keys = [...store.keys()];
      return (async function* () {
        if (keys.length) yield keys;
      })();
    }),
  };
  return { redis, bullConnection: redis, disconnectRedis: vi.fn(async () => undefined) };
}

/** Mock of the Prisma client: every method is a vi.fn() configured per test. */
export function makePrismaModule() {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $queryRaw: vi.fn(async () => [{ result: 1 }]),
    $disconnect: vi.fn(async () => undefined),
  };
  return { prisma, disconnectPrisma: vi.fn(async () => undefined) };
}

/** A passthrough rate-limit module so integration tests aren't throttled. */
export function makeRateLimitModule() {
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return { rateLimiter: passthrough, createRateLimiter: () => passthrough };
}
