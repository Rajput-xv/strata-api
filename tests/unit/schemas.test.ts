import { describe, it, expect } from 'vitest';
import { registerSchema, loginSchema, refreshSchema } from '@/modules/auth/auth.schema';
import { listUsersQuery, updateUserSchema, userIdParam } from '@/modules/users/users.schema';

describe('auth schemas', () => {
  it('registerSchema accepts a valid payload', () => {
    const parsed = registerSchema.parse({ email: 'a@b.com', password: 'password123', name: 'Ada' });
    expect(parsed.email).toBe('a@b.com');
  });

  it('registerSchema rejects bad email and short password', () => {
    expect(registerSchema.safeParse({ email: 'nope', password: 'password123' }).success).toBe(false);
    expect(registerSchema.safeParse({ email: 'a@b.com', password: 'short' }).success).toBe(false);
  });

  it('loginSchema requires a non-empty password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
  });

  it('refreshSchema enforces a minimum token length', () => {
    expect(refreshSchema.safeParse({ refreshToken: 'short' }).success).toBe(false);
    expect(refreshSchema.safeParse({ refreshToken: 'x'.repeat(20) }).success).toBe(true);
  });
});

describe('users schemas', () => {
  it('listUsersQuery defaults limit to 20 and coerces strings', () => {
    expect(listUsersQuery.parse({}).limit).toBe(20);
    expect(listUsersQuery.parse({ limit: '5' }).limit).toBe(5);
  });

  it('listUsersQuery rejects out-of-range limits', () => {
    expect(listUsersQuery.safeParse({ limit: '0' }).success).toBe(false);
    expect(listUsersQuery.safeParse({ limit: '101' }).success).toBe(false);
  });

  it('updateUserSchema constrains role to the enum', () => {
    expect(updateUserSchema.safeParse({ role: 'SUPER' }).success).toBe(false);
    expect(updateUserSchema.parse({ role: 'ADMIN' }).role).toBe('ADMIN');
  });

  it('userIdParam requires a uuid', () => {
    expect(userIdParam.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
    expect(userIdParam.safeParse({ id: '6f9619ff-8b86-d011-b42d-00cf4fc964ff' }).success).toBe(true);
  });
});
