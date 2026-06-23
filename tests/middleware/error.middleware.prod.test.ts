import { describe, it, expect, vi } from 'vitest';
import { errorHandler } from '@/middleware/error.middleware';
import { NotFoundError } from '@/core/errors';
import { mockReq, mockRes } from '../helpers/http';

// Force production mode so 5xx messages are masked.
vi.mock('@/config', () => ({
  env: {
    NODE_ENV: 'production',
    PORT: 3000,
    LOG_LEVEL: 'fatal',
    CORS_ORIGIN: '*',
    DATABASE_URL: 'postgresql://app:app@localhost:5432/app',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'x'.repeat(32),
    JWT_REFRESH_SECRET: 'y'.repeat(32),
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
    BCRYPT_ROUNDS: 8,
    RATE_LIMIT_WINDOW_S: 60,
    RATE_LIMIT_MAX: 100,
  },
}));
vi.mock('@/core/logger/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));

function handle(err: unknown) {
  const res = mockRes();
  errorHandler(err, mockReq(), res, vi.fn());
  return res;
}

describe('errorHandler in production', () => {
  it('masks the message of a 500', () => {
    const res = handle(new Error('sensitive internals'));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body.error.message).toBe('Internal server error');
  });

  it('still surfaces client-error (4xx) messages', () => {
    const res = handle(new NotFoundError('user gone'));
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.body.error.message).toBe('user gone');
  });
});
