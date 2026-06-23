import { describe, it, expect } from 'vitest';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '@/utils/jwt';

const user = { id: 'user-1', email: 'ada@example.com', role: 'ADMIN' as const };

describe('jwt', () => {
  it('access token round-trips with its claims', () => {
    const token = signAccessToken(user);
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.email).toBe('ada@example.com');
    expect(payload.role).toBe('ADMIN');
    expect(payload.type).toBe('access');
  });

  it('refresh token carries sub + jti', () => {
    const token = signRefreshToken('user-1', 'jti-123');
    const payload = verifyRefreshToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.jti).toBe('jti-123');
    expect(payload.type).toBe('refresh');
  });

  it('rejects an access token verified with the refresh secret', () => {
    const refresh = signRefreshToken('user-1', 'jti-123');
    expect(() => verifyAccessToken(refresh)).toThrow();
  });

  it('rejects a tampered/garbage token', () => {
    expect(() => verifyAccessToken('not-a-real-token')).toThrow();
  });
});
