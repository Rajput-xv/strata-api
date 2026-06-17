import { Router } from 'express';
import { usersController } from '@/modules/users/users.controller';
import { authenticate, authorize, validate } from '@/middleware';
import { listUsersQuery, updateUserSchema, userIdParam } from '@/modules/users/users.schema';

export const userRoutes = Router();

userRoutes.use(authenticate);
userRoutes.get('/me', usersController.me);
userRoutes.get('/', authorize('ADMIN'), validate({ query: listUsersQuery }), usersController.list);
userRoutes.get('/:id', validate({ params: userIdParam }), usersController.getOne);
userRoutes.patch('/:id', authorize('ADMIN'), validate({ params: userIdParam, body: updateUserSchema }), usersController.update);
userRoutes.delete('/:id', authorize('ADMIN'), validate({ params: userIdParam }), usersController.remove);
