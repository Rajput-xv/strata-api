import type { Request, Response, NextFunction } from 'express';
import { NotFoundError } from '@/core/errors';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
}
