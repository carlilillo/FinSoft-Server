import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import { AppConfigService } from '../config/app-config.service.js';

type JobHandler<T> = (data: T, attempt: { retryCount: number }) => Promise<void>;

/** pg-boss on the same PostgreSQL database (schema "pgboss"): durable background jobs with retries. */
@Injectable()
export class JobQueueService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(JobQueueService.name);
  private readonly boss: PgBoss;
  private readonly ready: Promise<void>;
  private markReady!: () => void;

  constructor(config: AppConfigService) {
    this.boss = new PgBoss({ connectionString: config.get('POSTGRESQL_URL'), schema: 'pgboss' });
    this.boss.on('error', (error: Error) => this.logger.error(error.message, error.stack));
    this.ready = new Promise((resolve) => (this.markReady = resolve));
  }

  async onModuleInit(): Promise<void> {
    await this.boss.start();
    this.markReady();
    this.logger.log('Job queue started');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.boss.stop({ graceful: true, timeout: 30_000 });
  }

  async ensureQueue(name: string): Promise<void> {
    await this.ready;
    const existing = await this.boss.getQueue(name);
    if (!existing) {
      await this.boss.createQueue(name, { retryLimit: 1, retryDelay: 30, expireInSeconds: 60 * 60 });
    }
  }

  async enqueue<T extends object>(queue: string, data: T, singletonKey?: string): Promise<void> {
    await this.ready;
    await this.boss.send(queue, data, singletonKey ? { singletonKey } : {});
  }

  async work<T extends object>(queue: string, handler: JobHandler<T>): Promise<void> {
    await this.ensureQueue(queue);
    await this.boss.work<T>(queue, { batchSize: 1 }, async ([job]) => {
      if (!job) return;
      await handler(job.data, { retryCount: (job as { retryCount?: number }).retryCount ?? 0 });
    });
  }
}
