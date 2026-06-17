import type { Request, Response } from 'express';
import { asyncHandler } from '@/core/http/asyncHandler';
import { sendSuccess } from '@/core/http/response';
import { HttpStatus } from '@/core/http/httpStatus';
import { authService } from '@/modules/auth/auth.service';
import type { RegisterInput, LoginInput, RefreshInput } from '@/modules/auth/auth.schema';

export const authController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.register(req.body as RegisterInput);
    sendSuccess(res, result, HttpStatus.CREATED);
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.login(req.body as LoginInput);
    sendSuccess(res, result);
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body as RefreshInput;
    sendSuccess(res, await authService.refresh(refreshToken));
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body as RefreshInput;
    await authService.logout(refreshToken);
    res.status(HttpStatus.NO_CONTENT).send();
  }),
};
