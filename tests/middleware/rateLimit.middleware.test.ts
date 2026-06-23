import { describe, it, expect, vi } from 'vitest';
import { createRateLimiter } from '@/middleware/rateLimit.middleware';
import { TooManyRequestsError } from '@/core/errors';
import { mockReq, mockRes, flush } from '../helpers/http';

// The redis mock lacks the limiter's Lua command, so RateLimiterRedis degrades
// to its in-memory insurance limiter — exactly the documented Redis-down path.
vi.mock('@/infra/cache/redis', async () => (await import('../helpers/mocks')).makeRedisModule());

describe('createRateLimiter', () => {
  it('allows requests under the limit and sets the remaining header', async () => {
    const limiter = createRateLimiter({ points: 2, duration: 60, keyPrefix: 'rl:t1' });
    const res = mockRes();
    const next = vi.fn();
    limiter(mockReq({ ip: '9.9.9.9' }), res, next);
    await flush();
    expect(next).toHaveBeenCalledWith();
    expect(res.headers['X-RateLimit-Remaining']).toBeDefined();
  });

  it('blocks once the budget is exhausted', async () => {
    const limiter = createRateLimiter({ points: 2, duration: 60, keyPrefix: 'rl:t2' });
    const ip = '8.8.8.8';

    for (let i = 0; i < 2; i++) {
      const next = vi.fn();
      limiter(mockReq({ ip }), mockRes(), next);
      await flush();
      expect(next).toHaveBeenCalledWith();
    }

    const res = mockRes();
    const next = vi.fn();
    limiter(mockReq({ ip }), res, next);
    await flush();
    expect(next).toHaveBeenCalledWith(expect.any(TooManyRequestsError));
    expect(res.headers['Retry-After']).toBeDefined();
  });

  it('keys independently per client', async () => {
    const limiter = createRateLimiter({ points: 1, duration: 60, keyPrefix: 'rl:t3' });
    const a = vi.fn();
    const b = vi.fn();
    limiter(mockReq({ ip: '1.1.1.1' }), mockRes(), a);
    await flush();
    limiter(mockReq({ ip: '2.2.2.2' }), mockRes(), b);
    await flush();
    expect(a).toHaveBeenCalledWith();
    expect(b).toHaveBeenCalledWith();
  });
});
