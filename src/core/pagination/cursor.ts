/** Opaque, stateless cursor. We base64url-encode a small JSON keyset so clients
 *  cannot tamper meaningfully and we never leak internal offsets. */
export function encodeCursor(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeCursor<T = Record<string, unknown>>(cursor: string): T | null {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}
