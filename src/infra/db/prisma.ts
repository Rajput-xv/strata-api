import { PrismaClient } from '@prisma/client';
import { env } from '@/config';
import { logger } from '@/core/logger/logger';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });

if (env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Prisma disconnected');
}
