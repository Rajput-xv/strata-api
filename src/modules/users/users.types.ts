import type { UserRole } from '@/core/types/auth';

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}
