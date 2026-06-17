import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor } from '@/core/pagination/cursor';

describe('cursor', () => {
  it('round-trips an object', () => {
    const cursor = encodeCursor({ id: 'abc-123' });
    expect(decodeCursor<{ id: string }>(cursor)).toEqual({ id: 'abc-123' });
  });

  it('returns null for malformed input', () => {
    expect(decodeCursor('@@not-valid-json@@')).toBeNull();
  });
});
