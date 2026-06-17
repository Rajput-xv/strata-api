import type { User } from '@prisma/client';
import { usersRepository } from '@/modules/users/users.repository';
import { cache } from '@/infra/cache/cache.service';
import { encodeCursor, decodeCursor } from '@/core/pagination/cursor';
import { NotFoundError } from '@/core/errors';
import type { PublicUser } from '@/modules/users/users.types';
import type { Paginated } from '@/core/pagination/types';
import type { UpdateUserInput } from '@/modules/users/users.schema';
import type { UserRole } from '@/core/types/auth';

const CACHE_TTL = 300;
const cacheKey = (id: string): string => `user:${id}`;

/** Map a DB row to the public-facing shape (never expose passwordHash). */
export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role as UserRole,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

export const usersService = {
  async getById(id: string): Promise<PublicUser> {
    return cache.wrap(cacheKey(id), CACHE_TTL, async () => {
      const found = await usersRepository.findById(id);
      if (!found) throw new NotFoundError('User not found');
      return toPublicUser(found);
    });
  },

  async list(limit: number, cursor?: string): Promise<Paginated<PublicUser>> {
    const decoded = cursor ? decodeCursor<{ id: string }>(cursor) : null;
    const rows = await usersRepository.list(limit, decoded?.id);
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(toPublicUser);
    const last = items[items.length - 1];
    return {
      items,
      hasMore,
      limit,
      nextCursor: hasMore && last ? encodeCursor({ id: last.id }) : null,
    };
  },

  async update(id: string, input: UpdateUserInput): Promise<PublicUser> {
    const updated = await usersRepository.update(id, input);
    await cache.del(cacheKey(id));
    return toPublicUser(updated);
  },

  async remove(id: string): Promise<void> {
    await usersRepository.delete(id);
    await cache.del(cacheKey(id));
  },
};
