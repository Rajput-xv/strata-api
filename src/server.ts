import { createApp } from '@/app';
import { env } from '@/config';
import { logger } from '@/core/logger/logger';
import { disconnectPrisma } from '@/infra/db/prisma';
import { disconnectRedis } from '@/infra/cache/redis';
import { closeQueues } from '@/infra/queue';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(`🚀 API listening on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Graceful shutdown initiated');
  server.close(async () => {
    try {
      await closeQueues();
      await disconnectRedis();
      await disconnectPrisma();
      logger.info('Shutdown complete 👋');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  });
  // Hard cap: never hang forever.
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => void shutdown(sig)));
process.on('unhandledRejection', (reason) => logger.error({ reason }, 'Unhandled promise rejection'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception - exiting');
  process.exit(1);
});
