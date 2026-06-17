import { z } from 'zod';

export const listUsersQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
});

export const userIdParam = z.object({ id: z.string().uuid() });

export type ListUsersQuery = z.infer<typeof listUsersQuery>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
