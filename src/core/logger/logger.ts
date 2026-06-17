import pino from 'pino';
import { env } from '@/config';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'strata-api' },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.passwordHash', '*.token', '*.refreshToken'],
    remove: true,
  },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' } }
      : undefined,
});

export type Logger = typeof logger;
