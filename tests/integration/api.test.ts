import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { User } from '@prisma/client';

// Mock every external boundary before the app is imported.
vi.mock('@/infra/db/prisma', async () => (await import('../helpers/mocks')).makePrismaModule());
vi.mock('@/infra/cache/redis', async () => (await import('../helpers/mocks')).makeRedisModule());
vi.mock('@/middleware/rateLimit.middleware', async () => (await import('../helpers/mocks')).makeRateLimitModule());

import { createApp } from '@/app';
import { prisma } from '@/infra/db/prisma';
import { redis } from '@/infra/cache/redis';
import { signAccessToken, signRefreshToken } from '@/utils/jwt';
import { hashPassword } from '@/utils/password';

const app = createApp();
const store = (redis as unknown as { __store: Map<string, string> }).__store;
const UUID = '6f9619ff-8b86-d011-b42d-00cf4fc964ff';

function makeUser(over: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'ada@example.com',
    passwordHash: 'placeholder',
    name: 'Ada',
    role: 'USER',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  } as User;
}

const adminToken = signAccessToken({ id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' });
const userToken = signAccessToken({ id: 'user-1', email: 'user@example.com', role: 'USER' });

let passwordHash: string;
beforeAll(async () => {
  passwordHash = await hashPassword('password123');
});

beforeEach(() => {
  store.clear();
  vi.mocked(prisma.refreshToken.create).mockResolvedValue({} as never);
  vi.mocked(prisma.$queryRaw).mockResolvedValue([{ result: 1 }] as never);
});

describe('POST /api/v1/auth/register', () => {
  it('creates a user and returns tokens (201)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue(makeUser({ email: 'new@example.com' }));

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'new@example.com', password: 'password123', name: 'New' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('new@example.com');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(res.body.data.accessToken).toBeTypeOf('string');
  });

  it('rejects an invalid body (422)', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ email: 'bad', password: 'x' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a duplicate email (409)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser());
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'ada@example.com', password: 'password123' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

describe('POST /api/v1/auth/login', () => {
  it('returns tokens for valid credentials (200)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser({ passwordHash }));
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ada@example.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTypeOf('string');
  });

  it('rejects a wrong password (401)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser({ passwordHash }));
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ada@example.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/refresh + logout', () => {
  it('rotates a valid refresh token (200)', async () => {
    const token = signRefreshToken('user-1', 'jti-1');
    vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue({
      jti: 'jti-1',
      userId: 'user-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: makeUser({ id: 'user-1' }),
    } as never);
    vi.mocked(prisma.refreshToken.update).mockResolvedValue({} as never);

    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: token });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTypeOf('string');
  });

  it('logs out with 204', async () => {
    const token = signRefreshToken('user-1', 'jti-1');
    vi.mocked(prisma.refreshToken.updateMany).mockResolvedValue({ count: 1 } as never);
    const res = await request(app).post('/api/v1/auth/logout').send({ refreshToken: token });
    expect(res.status).toBe(204);
  });
});

describe('users routes', () => {
  it('GET /users/me requires authentication (401)', async () => {
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET /users/me returns the current user (200)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser({ id: 'user-1', email: 'user@example.com' }));
    const res = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('user@example.com');
  });

  it('GET /users is ADMIN-only (403 for USER)', async () => {
    const res = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('GET /users lists with pagination meta for ADMIN (200)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([makeUser({ id: 'user-1' })]);
    const res = await request(app).get('/api/v1/users?limit=10').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta.pagination).toMatchObject({ hasMore: false, nextCursor: null, limit: 10 });
  });

  it('GET /users/:id rejects a non-uuid (422)', async () => {
    const res = await request(app).get('/api/v1/users/not-a-uuid').set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(422);
  });

  it('GET /users/:id returns a user for a valid uuid (200)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser());
    const res = await request(app).get(`/api/v1/users/${UUID}`).set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
  });

  it('PATCH /users/:id is ADMIN-only (403 for USER)', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${UUID}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'X' });
    expect(res.status).toBe(403);
  });

  it('PATCH /users/:id updates for ADMIN (200)', async () => {
    vi.mocked(prisma.user.update).mockResolvedValue(makeUser({ name: 'Updated' }));
    const res = await request(app)
      .patch(`/api/v1/users/${UUID}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated');
  });

  it('DELETE /users/:id removes for ADMIN (204)', async () => {
    vi.mocked(prisma.user.delete).mockResolvedValue(makeUser());
    const res = await request(app).delete(`/api/v1/users/${UUID}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
  });
});

describe('health + app-wide behaviour', () => {
  it('GET /health/live is 200', async () => {
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });

  it('GET /health/ready reports both dependencies up', async () => {
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.data.checks).toEqual({ database: 'up', redis: 'up' });
  });

  it('unknown routes return a 404 envelope', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });

  it('sets a correlation id and security headers', async () => {
    const res = await request(app).get('/health/live');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
