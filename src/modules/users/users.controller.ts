import type { Request, Response } from 'express';
import { asyncHandler } from '@/core/http/asyncHandler';
import { sendSuccess, sendPaginated } from '@/core/http/response';
import { HttpStatus } from '@/core/http/httpStatus';
import { usersService } from '@/modules/users/users.service';
import type { ListUsersQuery, UpdateUserInput } from '@/modules/users/users.schema';

export const usersController = {
  me: asyncHandler(async (req: Request, res: Response) => {
    const user = await usersService.getById(req.user!.id);
    sendSuccess(res, user);
  }),

  getOne: asyncHandler(async (req: Request, res: Response) => {
    const user = await usersService.getById(req.params.id);
    sendSuccess(res, user);
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const { limit, cursor } = req.validated!.query as ListUsersQuery;
    const page = await usersService.list(limit, cursor);
    sendPaginated(res, page);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const user = await usersService.update(req.params.id, req.body as UpdateUserInput);
    sendSuccess(res, user);
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await usersService.remove(req.params.id);
    res.status(HttpStatus.NO_CONTENT).send();
  }),
};
