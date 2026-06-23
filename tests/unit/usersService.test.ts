import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '@prisma/client';
import { usersService, toPublicUser } from '@/modules/users/users.service';
import { usersRepository } from '@/modules/users/users.repository';
import { cache } from '@/infra/cache/cache.service';
import { decodeCursor } from '@/core/pagination/cursor';
import { NotFoundError } from '@/core/errors';

// Repository and cache are mocked; pagination/cursor logic stays real.
vi.mock('@/modules/users/users.repository', () => ({
  usersRepository: {
    findById: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock('@/infra/cache/cache.service', () => ({
  cache: {
    // wrap just runs the producer so getById hits the repository
    wrap: vi.fn((_k: string, _ttl: number, producer: () => Promise<unknown>) => producer()),
    del: vi.fn(async () => undefined),
    get: vi.fn(),
    set: vi.fn(),
  },
}));

function makeUser(over: Partial<User> = {}): User {
  return {
    id: 'u-1',
    email: 'ada@example.com',
    passwordHash: 'secret-hash',
    name: 'Ada',
    role: 'USER',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...over,
  } as User;
}

beforeEach(() => {
  vi.mocked(cache.wrap).mockImplementation((_k, _ttl, producer) => producer() as Promise<never>);
});

describe('toPublicUser', () => {
  it('maps a row and never leaks the password hash', () => {
    const pub = toPublicUser(makeUser());
    expect(pub).toEqual({
      id: 'u-1',
      email: 'ada@example.com',
      name: 'Ada',
      role: 'USER',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    expect(pub).not.toHaveProperty('passwordHash');
  });
});

describe('usersService.getById', () => {
  it('returns the mapped user when found', async () => {
    vi.mocked(usersRepository.findById).mockResolvedValue(makeUser());
    const user = await usersService.getById('u-1');
    expect(user.email).toBe('ada@example.com');
    expect(cache.wrap).toHaveBeenCalledWith('user:u-1', 300, expect.any(Function));
  });

  it('throws NotFoundError when the user is missing', async () => {
    vi.mocked(usersRepository.findById).mockResolvedValue(null);
    await expect(usersService.getById('missing')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('usersService.list', () => {
  it('reports no more pages when rows do not exceed the limit', async () => {
    vi.mocked(usersRepository.list).mockResolvedValue([makeUser({ id: 'u-1' })]);
    const page = await usersService.list(20);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
    expect(page.items).toHaveLength(1);
  });

  it('detects more pages and encodes a cursor from the last item', async () => {
    // limit+1 rows signals hasMore; the extra row is trimmed off.
    vi.mocked(usersRepository.list).mockResolvedValue([
      makeUser({ id: 'a' }),
      makeUser({ id: 'b' }),
      makeUser({ id: 'c' }),
    ]);
    const page = await usersService.list(2);
    expect(page.hasMore).toBe(true);
    expect(page.items.map((u) => u.id)).toEqual(['a', 'b']);
    expect(decodeCursor<{ id: string }>(page.nextCursor!)).toEqual({ id: 'b' });
  });

  it('forwards a decoded cursor id to the repository', async () => {
    vi.mocked(usersRepository.list).mockResolvedValue([]);
    const cursor = Buffer.from(JSON.stringify({ id: 'x-99' })).toString('base64url');
    await usersService.list(10, cursor);
    expect(usersRepository.list).toHaveBeenCalledWith(10, 'x-99');
  });
});

describe('usersService mutations', () => {
  it('update writes through and invalidates the cache', async () => {
    vi.mocked(usersRepository.update).mockResolvedValue(makeUser({ name: 'New' }));
    const user = await usersService.update('u-1', { name: 'New' });
    expect(user.name).toBe('New');
    expect(usersRepository.update).toHaveBeenCalledWith('u-1', { name: 'New' });
    expect(cache.del).toHaveBeenCalledWith('user:u-1');
  });

  it('remove deletes and invalidates the cache', async () => {
    vi.mocked(usersRepository.delete).mockResolvedValue(makeUser());
    await usersService.remove('u-1');
    expect(usersRepository.delete).toHaveBeenCalledWith('u-1');
    expect(cache.del).toHaveBeenCalledWith('user:u-1');
  });
});
