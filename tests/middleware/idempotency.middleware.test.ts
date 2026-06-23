import { describe, it, expect, vi, beforeEach } from 'vitest';
import { idempotency } from '@/middleware/idempotency.middleware';
import { redis } from '@/infra/cache/redis';
import { mockReq, mockRes, flush } from '../helpers/http';

vi.mock('@/infra/cache/redis', async () => (await import('../helpers/mocks')).makeRedisModule());

const store = (redis as unknown as { __store: Map<string, string> }).__store;

beforeEach(() => store.clear());

describe('idempotency', () => {
  it('skips non-mutating methods', async () => {
    const next = vi.fn();
    idempotency(mockReq({ method: 'GET', headers: { 'idempotency-key': 'abc' } }), mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('skips when no Idempotency-Key is present', async () => {
    const next = vi.fn();
    idempotency(mockReq({ method: 'POST' }), mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('caches the first response and replays it for a duplicate key', async () => {
    const req = mockReq({ method: 'POST', headers: { 'idempotency-key': 'abc' } });

    // First request: passes through, then the controller responds.
    const res1 = mockRes(201);
    const next1 = vi.fn();
    idempotency(req, res1, next1);
    await flush();
    expect(next1).toHaveBeenCalledWith();
    res1.json({ created: true });
    await flush();

    // Duplicate request: served from cache, controller never runs.
    const res2 = mockRes();
    const next2 = vi.fn();
    idempotency(req, res2, next2);
    await flush();
    expect(next2).not.toHaveBeenCalled();
    expect(res2.status).toHaveBeenCalledWith(201);
    expect(res2.body).toEqual({ created: true });
  });

  it('does not cache 5xx responses', async () => {
    const req = mockReq({ method: 'POST', headers: { 'idempotency-key': 'fail' } });
    const res = mockRes(500);
    idempotency(req, res, vi.fn());
    await flush();
    res.json({ error: true });
    await flush();
    expect(store.size).toBe(0);
  });
});
