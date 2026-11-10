import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { Env } from '../config/env.validation.js';
import { RecurrenceService } from './recurrence.service.js';

export const QUEUE_NAME = 'recurrence';
export const SCHEDULER_ID = 'make-next-assignments';
const EVERY_MS = 5 * 60 * 1000;

/** Turns a redis:// URL into the options BullMQ takes. */
export function redisOptions(url: string): ConnectionOptions {
  const u = new URL(url);
  const db = u.pathname.length > 1 ? Number(u.pathname.slice(1)) : undefined;
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: Number.isInteger(db) ? db : undefined,
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

/**
 * Runs the repeat job every five minutes. Redis holds the schedule, so with
 * several API servers only one runs each tick. With no REDIS_URL it does
 * nothing, and repeating assignments are not made.
 */
@Injectable()
export class RecurrenceScheduler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(RecurrenceScheduler.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly recurrence: RecurrenceService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const url = this.config.get('REDIS_URL', { infer: true });
    if (!url) {
      this.logger.warn(
        'REDIS_URL is not set. Daily and weekly assignments will not repeat.',
      );
      return;
    }
    try {
      const connection = redisOptions(url);
      this.queue = new Queue(QUEUE_NAME, { connection });
      this.queue.on('error', (e) => this.logger.error(`Queue: ${e.message}`));
      await this.queue.upsertJobScheduler(
        SCHEDULER_ID,
        { every: EVERY_MS },
        { name: 'tick', opts: { removeOnComplete: true, removeOnFail: 50 } },
      );
      this.worker = new Worker(
        QUEUE_NAME,
        async () => {
          const made = await this.recurrence.generateDue();
          if (made > 0) this.logger.log(`Made ${made} repeat assignment(s)`);
        },
        { connection },
      );
      this.worker.on('error', (e) => this.logger.error(`Worker: ${e.message}`));
      this.worker.on('failed', (_job, e) =>
        this.logger.error(`Repeat job failed: ${e.message}`),
      );
      this.logger.log('Repeat job scheduled every 5 minutes');
    } catch (err) {
      // The API still works without repeats, so do not stop it from starting.
      this.logger.error(
        'Could not start the repeat job',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
