import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from '@/core/errors';
import { verifyAccessToken } from '@/utils/jwt';
import type { UserRole } from '@/core/types/auth';

/** Require a valid Bearer access token; attaches `req.user`. */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or invalid Authorization header'));
  }
  try {
    const payload = verifyAccessToken(header.slice(7));
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

/** Require one of the given roles (use after `authenticate`). */
export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    if (roles.length && !roles.includes(req.user.role)) {
      return next(new ForbiddenError('Insufficient permissions'));
    }
    next();
  };
}
