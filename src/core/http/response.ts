import type { Response } from 'express';
import { HttpStatus } from '@/core/http/httpStatus';
import type { Paginated } from '@/core/pagination/types';

export interface ApiMeta {
  requestId: string;
  [key: string]: unknown;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode: number = HttpStatus.OK,
  extraMeta: Record<string, unknown> = {},
): Response {
  const body: ApiSuccess<T> = {
    success: true,
    data,
    meta: { requestId: String(res.req.id), ...extraMeta },
  };
  return res.status(statusCode).json(body);
}

export function sendPaginated<T>(res: Response, page: Paginated<T>, statusCode: number = HttpStatus.OK): Response {
  const body: ApiSuccess<T[]> = {
    success: true,
    data: page.items,
    meta: {
      requestId: String(res.req.id),
      pagination: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit: page.limit },
    },
  };
  return res.status(statusCode).json(body);
}
