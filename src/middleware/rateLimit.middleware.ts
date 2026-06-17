import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { RateLimiterRedis, RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { redis } from '@/infra/cache/redis';
import { env } from '@/config';
import { TooManyRequestsError } from '@/core/errors';

interface RateLimitOptions {
  points?: number;
  duration?: number;
  keyPrefix?: string;
}

/** Distributed (Redis-backed) rate limiter. Keys by user id when authenticated,
 *  otherwise by IP - so the limit survives across horizontally-scaled instances.
 *
 *  Resilience: an `insuranceLimiter` (per-instance, in-memory) takes over if Redis
 *  is unreachable, so a Redis blip degrades the limiter to per-instance counting
 *  instead of rejecting every request. Any other internal failure fails OPEN. */
export function createRateLimiter(opts: RateLimitOptions = {}): RequestHandler {
  const points = opts.points ?? env.RATE_LIMIT_MAX;
  const duration = opts.duration ?? env.RATE_LIMIT_WINDOW_S;

  const limiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: opts.keyPrefix ?? 'rl',
    points,
    duration,
    insuranceLimiter: new RateLimiterMemory({ points, duration }),
  });

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.user?.id ?? req.ip ?? 'anonymous';
    limiter
      .consume(key)
      .then((r) => {
        res.setHeader('X-RateLimit-Remaining', r.remainingPoints);
        next();
      })
      .catch((rej: unknown) => {
        if (rej instanceof RateLimiterRes) {
          res.setHeader('Retry-After', Math.ceil(rej.msBeforeNext / 1000));
          next(new TooManyRequestsError());
        } else {
          // Limiter itself errored (Redis + insurance both unavailable): fail open.
          next();
        }
      });
  };
}

export const rateLimiter = createRateLimiter();
