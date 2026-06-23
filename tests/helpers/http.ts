import { vi } from 'vitest';

/** Minimal Express Response double that records status/body/headers. */
export function mockRes(statusCode = 200) {
  const res: Record<string, unknown> = { statusCode, headers: {} as Record<string, unknown>, body: undefined };
  res.status = vi.fn((c: number) => {
    res.statusCode = c;
    return res;
  });
  res.json = vi.fn((b: unknown) => {
    res.body = b;
    return res;
  });
  res.send = vi.fn((b?: unknown) => {
    res.body = b;
    return res;
  });
  res.setHeader = vi.fn((k: string, v: unknown) => {
    (res.headers as Record<string, unknown>)[k] = v;
    return res;
  });
  res.req = { id: 'req-test-1' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res as any;
}

/** Minimal Express Request double. Pass `headers` lowercased. */
export function mockReq(overrides: Record<string, unknown> = {}) {
  const headers = (overrides.headers as Record<string, string>) ?? {};
  const base = {
    method: 'GET',
    originalUrl: '/',
    url: '/',
    ip: '127.0.0.1',
    body: {},
    query: {},
    params: {},
    header: (n: string) => headers[n.toLowerCase()],
    get: (n: string) => headers[n.toLowerCase()],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ...base, ...overrides } as any;
}

/** Flush pending microtasks + one macrotask so async middleware settles. */
export function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
