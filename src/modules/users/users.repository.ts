import { prisma } from '@/infra/db/prisma';
import type { Prisma, User } from '@prisma/client';

/** All User data access lives here - the only layer that talks to Prisma directly. */
export const usersRepository = {
  findById: (id: string) => prisma.user.findUnique({ where: { id } }),
  findByEmail: (email: string) => prisma.user.findUnique({ where: { email } }),
  create: (data: Prisma.UserCreateInput) => prisma.user.create({ data }),
  update: (id: string, data: Prisma.UserUpdateInput) => prisma.user.update({ where: { id }, data }),
  delete: (id: string) => prisma.user.delete({ where: { id } }),

  /** Keyset pagination: fetch limit+1 rows to detect `hasMore`. */
  list: (limit: number, cursorId?: string): Promise<User[]> =>
    prisma.user.findMany({
      take: limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
};
