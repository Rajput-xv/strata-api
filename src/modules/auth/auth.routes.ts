import { Router } from 'express';
import { authController } from '@/modules/auth/auth.controller';
import { validate, createRateLimiter } from '@/middleware';
import { registerSchema, loginSchema, refreshSchema } from '@/modules/auth/auth.schema';

// Auth endpoints get a stricter limiter to blunt credential-stuffing.
const authLimiter = createRateLimiter({ points: 10, duration: 60, keyPrefix: 'rl:auth' });

export const authRoutes = Router();
authRoutes.post('/register', authLimiter, validate({ body: registerSchema }), authController.register);
authRoutes.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);
authRoutes.post('/refresh', validate({ body: refreshSchema }), authController.refresh);
authRoutes.post('/logout', validate({ body: refreshSchema }), authController.logout);
