import { describe, it, expect } from 'vitest';
import { sendSuccess, sendPaginated } from '@/core/http/response';
import { HttpStatus } from '@/core/http/httpStatus';
import { mockRes } from '../helpers/http';

describe('response helpers', () => {
  it('sendSuccess wraps data with status 200 and requestId meta', () => {
    const res = mockRes();
    sendSuccess(res, { hello: 'world' });
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(res.body).toEqual({
      success: true,
      data: { hello: 'world' },
      meta: { requestId: 'req-test-1' },
    });
  });

  it('sendSuccess honours a custom status and extra meta', () => {
    const res = mockRes();
    sendSuccess(res, { id: 1 }, HttpStatus.CREATED, { traceId: 'abc' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.body.meta).toEqual({ requestId: 'req-test-1', traceId: 'abc' });
  });

  it('sendPaginated emits items + pagination meta', () => {
    const res = mockRes();
    sendPaginated(res, { items: [{ id: 1 }], nextCursor: 'cur', hasMore: true, limit: 20 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toEqual({
      success: true,
      data: [{ id: 1 }],
      meta: { requestId: 'req-test-1', pagination: { nextCursor: 'cur', hasMore: true, limit: 20 } },
    });
  });
});
