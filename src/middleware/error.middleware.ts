import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '@/core/errors';
import { HttpStatus } from '@/core/http/httpStatus';
import { logger } from '@/core/logger/logger';
import { env } from '@/config';
import type { ApiErrorBody } from '@/core/http/response';

/** Central error formatter. Every thrown/forwarded error ends here and is
 *  serialized into the standard error envelope. Must be the LAST middleware. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong';
  let details: unknown;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    statusCode = HttpStatus.UNPROCESSABLE_ENTITY;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = err.flatten();
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      statusCode = HttpStatus.CONFLICT;
      code = 'CONFLICT';
      message = 'Resource already exists';
    } else if (err.code === 'P2025') {
      statusCode = HttpStatus.NOT_FOUND;
      code = 'NOT_FOUND';
      message = 'Resource not found';
    }
  } else if (err instanceof Error) {
    message = err.message;
  }

  const isServerError = statusCode >= 500;
  const logPayload = { err, requestId: req.id, code, statusCode };
  if (isServerError) logger.error(logPayload, 'Request failed');
  else logger.warn(logPayload, 'Request error');

  const body: ApiErrorBody = {
    success: false,
    error: {
      code,
      message: isServerError && env.NODE_ENV === 'production' ? 'Internal server error' : message,
      requestId: String(req.id),
      ...(details !== undefined ? { details } : {}),
    },
  };
  res.status(statusCode).json(body);
}
