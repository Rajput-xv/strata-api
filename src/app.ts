import express, { type Express } from 'express';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { logger } from '@/core/logger/logger';
import {
  requestId,
  securityMiddleware,
  rateLimiter,
  errorHandler,
  notFoundHandler,
} from '@/middleware';
import { apiRouter } from '@/routes';
import { healthRoutes } from '@/modules/health/health.routes';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(pinoHttp({ logger, genReqId: (req) => (req as { id?: string }).id ?? '' }));
  app.use(...securityMiddleware);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Operational endpoints (no version prefix, no rate limit) for load balancers.
  app.use('/health', healthRoutes);

  // Interactive API docs at /docs.
  try {
    const spec = yaml.load(readFileSync(join(process.cwd(), 'docs/openapi.yaml'), 'utf8')) as Record<string, unknown>;
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));
  } catch {
    logger.warn('OpenAPI spec not found at docs/openapi.yaml - /docs disabled');
  }

  // Versioned API behind the global rate limiter.
  app.use('/api/v1', rateLimiter, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
