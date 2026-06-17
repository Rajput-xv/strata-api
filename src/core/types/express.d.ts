import type { AuthUser } from '@/core/types/auth';
import type { ValidatedData } from '@/core/types/http';

declare global {
  namespace Express {
    interface Request {
      id: string;
      user?: AuthUser;
      validated?: ValidatedData;
    }
  }
}

export {};
