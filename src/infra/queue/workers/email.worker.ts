import { Worker } from 'bullmq';
import { bullConnection } from '@/infra/cache/redis';
import { logger } from '@/core/logger/logger';
import type { EmailJob } from '@/infra/queue';

export const emailWorker = new Worker<EmailJob>(
  'email',
  async (job) => {
    logger.info({ jobId: job.id, to: job.data.to }, 'Processing email job');
    // TODO: integrate a real provider (SES / SendGrid / Postmark).
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { delivered: true };
  },
  { connection: bullConnection, concurrency: 10 },
);

emailWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Email job failed'));
emailWorker.on('completed', (job) => logger.debug({ jobId: job.id }, 'Email job completed'));
