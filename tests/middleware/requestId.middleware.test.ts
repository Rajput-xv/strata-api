import { describe, it, expect, vi } from 'vitest';
import { requestId } from '@/middleware/requestId.middleware';
import { mockReq, mockRes } from '../helpers/http';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('requestId', () => {
  it('generates a uuid when none is provided and echoes it on the response', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();
    requestId(req, res, next);
    expect(req.id).toMatch(UUID_RE);
    expect(res.headers['x-request-id']).toBe(req.id);
    expect(next).toHaveBeenCalledWith();
  });

  it('propagates a provided correlation id', () => {
    const req = mockReq({ headers: { 'x-request-id': 'trace-abc' } });
    const res = mockRes();
    requestId(req, res, vi.fn());
    expect(req.id).toBe('trace-abc');
    expect(res.headers['x-request-id']).toBe('trace-abc');
  });

  it('ignores an absurdly long incoming id and generates a fresh one', () => {
    const req = mockReq({ headers: { 'x-request-id': 'x'.repeat(201) } });
    requestId(req, mockRes(), vi.fn());
    expect(req.id).toMatch(UUID_RE);
  });
});
