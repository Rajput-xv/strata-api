import { describe, it, expect, vi } from 'vitest';
import { authenticate, authorize } from '@/middleware/auth.middleware';
import { signAccessToken } from '@/utils/jwt';
import { UnauthorizedError, ForbiddenError } from '@/core/errors';
import { mockReq, mockRes } from '../helpers/http';

describe('authenticate', () => {
  it('rejects a request with no Authorization header', () => {
    const next = vi.fn();
    authenticate(mockReq(), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('rejects a non-Bearer scheme', () => {
    const next = vi.fn();
    authenticate(mockReq({ headers: { authorization: 'Basic abc' } }), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('attaches req.user for a valid token', () => {
    const token = signAccessToken({ id: 'u-1', email: 'a@b.com', role: 'ADMIN' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const next = vi.fn();
    authenticate(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({ id: 'u-1', email: 'a@b.com', role: 'ADMIN' });
  });

  it('rejects an invalid token', () => {
    const req = mockReq({ headers: { authorization: 'Bearer not.a.token' } });
    const next = vi.fn();
    authenticate(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });
});

describe('authorize', () => {
  it('passes when the role is allowed', () => {
    const req = mockReq({ user: { id: 'u-1', email: 'a@b.com', role: 'ADMIN' } });
    const next = vi.fn();
    authorize('ADMIN')(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('forbids when the role is not allowed', () => {
    const req = mockReq({ user: { id: 'u-1', email: 'a@b.com', role: 'USER' } });
    const next = vi.fn();
    authorize('ADMIN')(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it('rejects when no user is present', () => {
    const next = vi.fn();
    authorize('ADMIN')(mockReq(), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });
});
