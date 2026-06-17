import { describe, it, expect } from 'vitest';
import { AppError, NotFoundError, ConflictError } from '@/core/errors';

describe('AppError hierarchy', () => {
  it('NotFoundError maps to 404 / NOT_FOUND', () => {
    const err = new NotFoundError('missing');
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.isOperational).toBe(true);
  });

  it('ConflictError carries details', () => {
    const err = new ConflictError('dupe', { field: 'email' });
    expect(err.statusCode).toBe(409);
    expect(err.details).toEqual({ field: 'email' });
  });
});
