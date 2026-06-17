import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import type { RequestHandler } from 'express';
import { env } from '@/config';

export const securityMiddleware: RequestHandler[] = [
  helmet(),
  cors({
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  }),
  compression(),
];
