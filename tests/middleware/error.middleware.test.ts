import { describe, it, expect, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { errorHandler } from '@/middleware/error.middleware';
import { NotFoundError } from '@/core/errors';
import { mockReq, mockRes } from '../helpers/http';

vi.mock('@/core/logger/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));

function handle(err: unknown) {
  const req = mockReq();
  req.id = 'req-1';
  const res = mockRes();
  errorHandler(err, req, res, vi.fn());
  return res;
}

describe('errorHandler', () => {
  it('serialises an AppError with its code, message, and details', () => {
    const res = handle(new NotFoundError('gone', { id: 'x' }));
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND', message: 'gone', details: { id: 'x' }, requestId: 'req-1' },
    });
  });

  it('maps a ZodError to 422 VALIDATION_ERROR', () => {
    const err = z.object({ a: z.string() }).safeParse({});
    const res = handle((err as { error: unknown }).error);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeDefined();
  });

  it('maps Prisma P2002 to 409 CONFLICT', () => {
    const err = new Prisma.PrismaClientKnownRequestError('dupe', { code: 'P2002', clientVersion: '6.0.0' });
    const res = handle(err);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('maps Prisma P2025 to 404 NOT_FOUND', () => {
    const err = new Prisma.PrismaClientKnownRequestError('missing', { code: 'P2025', clientVersion: '6.0.0' });
    const res = handle(err);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('treats a plain Error as a 500 and surfaces its message outside production', () => {
    const res = handle(new Error('boom'));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).toBe('boom');
    expect(res.body.error).not.toHaveProperty('details');
  });

  it('falls back to a generic message for a non-Error throw', () => {
    const res = handle('just a string');
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body.error.message).toBe('Something went wrong');
  });
});
