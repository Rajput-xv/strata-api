import { Queue } from 'bullmq';
import { bullConnection } from '@/infra/cache/redis';

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export function createQueue<T = unknown>(name: string): Queue<T> {
  return new Queue<T>(name, { connection: bullConnection, defaultJobOptions });
}
