import { HttpStatus } from '@/core/http/httpStatus';

export interface AppErrorOptions {
  code?: string;
  statusCode?: number;
  isOperational?: boolean;
  details?: unknown;
  cause?: unknown;
}

/** Base class for every error we deliberately throw. `isOperational` distinguishes
 *  expected (client-facing) errors from unexpected bugs. */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = options.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR;
    this.code = options.code ?? 'INTERNAL_ERROR';
    this.isOperational = options.isOperational ?? true;
    this.details = options.details;
    if (options.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: unknown) {
    super(message, { statusCode: HttpStatus.BAD_REQUEST, code: 'BAD_REQUEST', details });
  }
}
export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, { statusCode: HttpStatus.UNPROCESSABLE_ENTITY, code: 'VALIDATION_ERROR', details });
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details?: unknown) {
    super(message, { statusCode: HttpStatus.UNAUTHORIZED, code: 'UNAUTHORIZED', details });
  }
}
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: unknown) {
    super(message, { statusCode: HttpStatus.FORBIDDEN, code: 'FORBIDDEN', details });
  }
}
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: unknown) {
    super(message, { statusCode: HttpStatus.NOT_FOUND, code: 'NOT_FOUND', details });
  }
}
export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown) {
    super(message, { statusCode: HttpStatus.CONFLICT, code: 'CONFLICT', details });
  }
}
export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests', details?: unknown) {
    super(message, { statusCode: HttpStatus.TOO_MANY_REQUESTS, code: 'RATE_LIMITED', details });
  }
}
