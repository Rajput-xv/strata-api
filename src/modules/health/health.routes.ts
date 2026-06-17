import { Router } from 'express';
import { asyncHandler } from '@/core/http/asyncHandler';
import { prisma } from '@/infra/db/prisma';
import { redis } from '@/infra/cache/redis';

export const healthRoutes = Router();

/** Liveness: is the process up? (no dependencies checked) */
healthRoutes.get('/live', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

/** Readiness: can we serve traffic? (checks Postgres + Redis) */
healthRoutes.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    const checks: { database: string; redis: string } = { database: 'down', redis: 'down' };
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = 'up';
    } catch {
      /* leave as down */
    }
    try {
      if ((await redis.ping()) === 'PONG') checks.redis = 'up';
    } catch {
      /* leave as down */
    }
    const healthy = checks.database === 'up' && checks.redis === 'up';
    res.status(healthy ? 200 : 503).json({
      success: healthy,
      data: { status: healthy ? 'ready' : 'degraded', checks },
    });
  }),
);
