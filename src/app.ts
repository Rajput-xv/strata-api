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

/** Trims Swagger UI's chrome for a focused, readable test console. */
const DOCS_CSS = `
  .swagger-ui .topbar { display: none; }
  .swagger-ui .info { margin: 24px 0; }
  .swagger-ui .scheme-container { box-shadow: none; padding: 12px 0; margin: 0 0 16px; background: transparent; }
  .swagger-ui .wrapper { max-width: 1100px; }
  .swagger-ui .opblock { border-radius: 8px; margin: 0 0 10px; }
  .swagger-ui .opblock .opblock-summary { padding: 8px 12px; }
  .swagger-ui .btn.authorize { border-radius: 6px; }
  body { background: #fafafa; }
`;

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

  // Interactive API docs at /docs — tuned as a lightweight test console.
  try {
    const spec = yaml.load(readFileSync(join(process.cwd(), 'docs/openapi.yaml'), 'utf8')) as Record<string, unknown>;
    app.use(
      '/docs',
      swaggerUi.serve,
      swaggerUi.setup(spec, {
        customSiteTitle: 'Strata API — Test Console',
        customCss: DOCS_CSS,
        swaggerOptions: {
          persistAuthorization: true, // keep the Bearer token across reloads / hot restarts
          tryItOutEnabled: true, // skip the per-endpoint "Try it out" click
          filter: true, // search box to filter endpoints
          displayRequestDuration: true, // show response time on each call
          docExpansion: 'list', // collapse operations to a tidy list
          defaultModelsExpandDepth: -1, // hide the bulky schemas section
          tagsSorter: 'alpha',
          operationsSorter: 'alpha',
        },
      }),
    );
  } catch {
    logger.warn('OpenAPI spec not found at docs/openapi.yaml - /docs disabled');
  }

  // Versioned API behind the global rate limiter.
  app.use('/api/v1', rateLimiter, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
