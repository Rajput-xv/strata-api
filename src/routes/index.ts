import { Router } from 'express';
import { authRoutes } from '@/modules/auth/auth.routes';
import { userRoutes } from '@/modules/users/users.routes';

/** Aggregates all versioned API modules. Mounted under /api/v1 in app.ts. */
export const apiRouter = Router();
apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
