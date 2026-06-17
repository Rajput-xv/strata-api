import { createQueue } from '@/infra/queue/queue';

export interface EmailJob {
  to: string;
  subject: string;
  template: string;
  data?: Record<string, unknown>;
}

export const emailQueue = createQueue<EmailJob>('email');

export const queues = [emailQueue];

export async function closeQueues(): Promise<void> {
  await Promise.all(queues.map((q) => q.close()));
}
