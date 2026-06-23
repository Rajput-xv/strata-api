import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '@/utils/password';

describe('password', () => {
  it('hashes to something other than the plaintext', async () => {
    const hash = await hashPassword('supersecret');
    expect(hash).not.toBe('supersecret');
    expect(hash.length).toBeGreaterThan(20);
  });

  it('verifies a correct password', async () => {
    const hash = await hashPassword('supersecret');
    expect(await verifyPassword('supersecret', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('supersecret');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('produces distinct hashes for the same input (salted)', async () => {
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(a).not.toBe(b);
  });
});
