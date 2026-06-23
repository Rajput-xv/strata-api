import { describe, it, expect, vi } from 'vitest';
import { notFoundHandler } from '@/middleware/notFound.middleware';
import { NotFoundError } from '@/core/errors';
import { mockReq, mockRes } from '../helpers/http';

describe('notFoundHandler', () => {
  it('forwards a NotFoundError describing the route', () => {
    const req = mockReq({ method: 'GET', originalUrl: '/api/v1/nope' });
    const next = vi.fn();
    notFoundHandler(req, mockRes(), next);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.message).toBe('Route not found: GET /api/v1/nope');
  });
});
