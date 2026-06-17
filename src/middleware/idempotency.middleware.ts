import type { Request, Response, NextFunction } from 'express';
import { cache } from '@/infra/cache/cache.service';

const TTL_SECONDS = 60 * 60 * 24; // 24h

interface StoredResponse {
  status: number;
  body: unknown;
}

/** Safe retries for mutating requests. Client sends `Idempotency-Key`; the first
 *  response is cached and replayed for duplicate keys. */
export function idempotency(req: Request, res: Response, next: NextFunction): void {
  const key = req.header('idempotency-key');
  if (!key || (req.method !== 'POST' && req.method !== 'PATCH')) return next();

  const cacheKey = `idem:${req.user?.id ?? req.ip}:${key}`;
  cache
    .get<StoredResponse>(cacheKey)
    .then((stored) => {
      if (stored) {
        res.status(stored.status).json(stored.body);
        return;
      }
      const originalJson = res.json.bind(res);
      res.json = ((body: unknown) => {
        if (res.statusCode < 500) void cache.set(cacheKey, { status: res.statusCode, body }, TTL_SECONDS);
        return originalJson(body);
      }) as Response['json'];
      next();
    })
    .catch(next);
}
