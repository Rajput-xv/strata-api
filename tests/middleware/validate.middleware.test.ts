import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { validate } from '@/middleware/validate.middleware';
import { ValidationError } from '@/core/errors';
import { mockReq, mockRes } from '../helpers/http';

describe('validate', () => {
  it('parses the body, replaces req.body, and sets req.validated', () => {
    const req = mockReq({ body: { email: 'a@b.com', extra: 'stripped' } });
    const next = vi.fn();
    validate({ body: z.object({ email: z.string().email() }) })(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ email: 'a@b.com' });
    expect(req.validated.body).toEqual({ email: 'a@b.com' });
  });

  it('forwards a ValidationError with flattened details on bad input', () => {
    const req = mockReq({ body: { email: 'nope' } });
    const next = vi.fn();
    validate({ body: z.object({ email: z.string().email() }) })(req, mockRes(), next);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.details.fieldErrors.email).toBeDefined();
  });

  it('validates query params', () => {
    const req = mockReq({ query: { limit: '5' } });
    const next = vi.fn();
    validate({ query: z.object({ limit: z.coerce.number() }) })(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.validated.query).toEqual({ limit: 5 });
  });
});
