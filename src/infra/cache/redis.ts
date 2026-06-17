import Redis from 'ioredis';
import { env } from '@/config';
import { logger } from '@/core/logger/logger';

/** App cache connection. */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

/** BullMQ REQUIRES a dedicated connection with maxRetriesPerRequest = null. */
export const bullConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

redis.on('error', (err) => logger.error({ err }, 'Redis error'));
redis.on('connect', () => logger.info('Redis connected'));

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  await bullConnection.quit();
  logger.info('Redis disconnected');
}
