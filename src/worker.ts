import { logger } from '@/core/logger/logger';
import { emailWorker } from '@/infra/queue/workers/email.worker';
import { disconnectRedis } from '@/infra/cache/redis';

const workers = [emailWorker];
logger.info('👷 Worker process started');

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Worker shutting down...');
  await Promise.all(workers.map((w) => w.close()));
  await disconnectRedis();
  process.exit(0);
}

['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => void shutdown(sig)));
