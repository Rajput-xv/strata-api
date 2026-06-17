import { randomUUID } from 'node:crypto';
import { prisma } from '@/infra/db/prisma';
import { hashPassword, verifyPassword } from '@/utils/password';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type RefreshTokenPayload,
} from '@/utils/jwt';
import { ConflictError, UnauthorizedError } from '@/core/errors';
import { toPublicUser } from '@/modules/users/users.service';
import type { PublicUser } from '@/modules/users/users.types';
import type { RegisterInput, LoginInput } from '@/modules/auth/auth.schema';
import type { UserRole } from '@/core/types/auth';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

async function issueTokens(user: { id: string; email: string; role: UserRole }): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const jti = randomUUID();
  await prisma.refreshToken.create({
    data: { jti, userId: user.id, expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
  });
  return { accessToken: signAccessToken(user), refreshToken: signRefreshToken(user.id, jti) };
}

export const authService = {
  async register(input: RegisterInput): Promise<AuthResult> {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictError('Email already registered');

    const passwordHash = await hashPassword(input.password);
    const user = await prisma.user.create({
      data: { email: input.email, passwordHash, name: input.name ?? null },
    });
    const tokens = await issueTokens({ id: user.id, email: user.email, role: user.role as UserRole });
    return { user: toPublicUser(user), ...tokens };
  },

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) throw new UnauthorizedError('Invalid credentials');
    if (!(await verifyPassword(input.password, user.passwordHash))) {
      throw new UnauthorizedError('Invalid credentials');
    }
    const tokens = await issueTokens({ id: user.id, email: user.email, role: user.role as UserRole });
    return { user: toPublicUser(user), ...tokens };
  },

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    let payload: RefreshTokenPayload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedError('Invalid refresh token');
    }
    const stored = await prisma.refreshToken.findUnique({
      where: { jti: payload.jti },
      include: { user: true },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token expired or revoked');
    }
    // Rotate: revoke the used token, issue a new one.
    await prisma.refreshToken.update({ where: { jti: payload.jti }, data: { revokedAt: new Date() } });
    const newJti = randomUUID();
    await prisma.refreshToken.create({
      data: { jti: newJti, userId: stored.userId, expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
    });
    return {
      accessToken: signAccessToken({
        id: stored.user.id,
        email: stored.user.email,
        role: stored.user.role as UserRole,
      }),
      refreshToken: signRefreshToken(stored.userId, newJti),
    };
  },

  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await prisma.refreshToken.updateMany({ where: { jti: payload.jti }, data: { revokedAt: new Date() } });
    } catch {
      /* no-op: logging out with an invalid token is a success from the client's view */
    }
  },
};
