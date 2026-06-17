import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

/** Assigns/propagates a correlation id for every request. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  req.id = incoming && incoming.length <= 200 ? incoming : randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}
