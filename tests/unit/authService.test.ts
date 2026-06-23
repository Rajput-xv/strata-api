import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '@prisma/client';
import { authService } from '@/modules/auth/auth.service';
import { prisma } from '@/infra/db/prisma';
import { hashPassword } from '@/utils/password';
import { signRefreshToken, verifyAccessToken } from '@/utils/jwt';
import { ConflictError, UnauthorizedError } from '@/core/errors';

// Prisma is mocked; redis is stubbed only to prevent a real connection.
vi.mock('@/infra/db/prisma', async () => (await import('../helpers/mocks')).makePrismaModule());
vi.mock('@/infra/cache/redis', async () => (await import('../helpers/mocks')).makeRedisModule());

function makeUser(over: Partial<User> = {}): User {
  return {
    id: 'u-1',
    email: 'ada@example.com',
    passwordHash: 'placeholder',
    name: 'Ada',
    role: 'USER',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  } as User;
}

beforeEach(() => {
  vi.mocked(prisma.refreshToken.create).mockResolvedValue({} as never);
});

describe('authService.register', () => {
  it('creates a user, hashes the password, and issues tokens', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue(makeUser());

    const result = await authService.register({ email: 'ada@example.com', password: 'password123', name: 'Ada' });

    expect(result.user.email).toBe('ada@example.com');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(typeof result.accessToken).toBe('string');
    expect(typeof result.refreshToken).toBe('string');

    const createArg = vi.mocked(prisma.user.create).mock.calls[0][0];
    expect(createArg.data.passwordHash).not.toBe('password123');
    expect(verifyAccessToken(result.accessToken).email).toBe('ada@example.com');
  });

  it('rejects a duplicate email with ConflictError', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser());
    await expect(
      authService.register({ email: 'ada@example.com', password: 'password123' }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

describe('authService.login', () => {
  it('issues tokens for valid credentials', async () => {
    const passwordHash = await hashPassword('password123');
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser({ passwordHash }));
    const result = await authService.login({ email: 'ada@example.com', password: 'password123' });
    expect(result.user.email).toBe('ada@example.com');
    expect(typeof result.accessToken).toBe('string');
  });

  it('rejects an unknown email', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    await expect(authService.login({ email: 'no@one.com', password: 'x' })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('rejects a wrong password', async () => {
    const passwordHash = await hashPassword('password123');
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser({ passwordHash }));
    await expect(
      authService.login({ email: 'ada@example.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('authService.refresh', () => {
  it('rotates a valid refresh token', async () => {
    const token = signRefreshToken('u-1', 'jti-1');
    vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue({
      jti: 'jti-1',
      userId: 'u-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: makeUser(),
    } as never);
    vi.mocked(prisma.refreshToken.update).mockResolvedValue({} as never);

    const result = await authService.refresh(token);
    expect(typeof result.accessToken).toBe('string');
    expect(typeof result.refreshToken).toBe('string');
    // old token is revoked, new one persisted
    expect(prisma.refreshToken.update).toHaveBeenCalled();
    expect(prisma.refreshToken.create).toHaveBeenCalled();
  });

  it('rejects a revoked token', async () => {
    const token = signRefreshToken('u-1', 'jti-1');
    vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue({
      jti: 'jti-1',
      userId: 'u-1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      user: makeUser(),
    } as never);
    await expect(authService.refresh(token)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects a structurally invalid token', async () => {
    await expect(authService.refresh('garbage')).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('authService.logout', () => {
  it('revokes the matching token', async () => {
    const token = signRefreshToken('u-1', 'jti-1');
    vi.mocked(prisma.refreshToken.updateMany).mockResolvedValue({ count: 1 } as never);
    await authService.logout(token);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { jti: 'jti-1' },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('is a no-op for an invalid token', async () => {
    await expect(authService.logout('garbage')).resolves.toBeUndefined();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
