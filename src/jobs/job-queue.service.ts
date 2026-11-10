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

  /**
   * Creates or replaces the recurring schedule `key` of a queue. Schedules are rows in the pgboss
   * schema, so they survive restarts, and any running instance (`schedule: true`, the default)
   * evaluates them. `missed: 'once'` sends one catch-up job for an occurrence that came due while
   * no instance was running, e.g. the server was rebooting at that moment.
   */
  async upsertSchedule<T extends object>(queue: string, key: string, cron: string, timeZone: string, data: T): Promise<void> {
    await this.ensureQueue(queue);
    await this.boss.schedule(queue, cron, data, { key, tz: timeZone, missed: 'once' });
  }

  async removeSchedule(queue: string, key: string): Promise<void> {
    await this.ready;
    await this.boss.unschedule(queue, key);
  }

  /** Every schedule of a queue, paged through so none is missed. */
  async listSchedules(queue: string): Promise<{ key: string; cron: string; timeZone: string }[]> {
    await this.ensureQueue(queue);
    const schedules = [];
    let after: { name: string; key: string } | undefined;
    for (;;) {
      const page = await this.boss.getSchedules(queue, undefined, { limit: 1000, after });
      schedules.push(...page.map((schedule) => ({ key: schedule.key, cron: schedule.cron, timeZone: schedule.timezone })));
      const last = page.at(-1);
      if (page.length < 1000 || !last) return schedules;
      after = { name: last.name, key: last.key };
    }
  }

  /** The next time a cron expression fires in `timeZone`, as pg-boss itself evaluates it. */
  async nextOccurrence(cron: string, timeZone: string): Promise<Date | null> {
    await this.ready;
    return this.boss.previewSchedule(cron, { tz: timeZone, count: 1 })[0] ?? null;
  }

  /** `concurrency` jobs of the queue are handled at the same time on this node, one per worker. */
  async work<T extends object>(queue: string, handler: JobHandler<T>, concurrency = 1): Promise<void> {
    await this.ensureQueue(queue);
    await this.boss.work<T>(queue, { batchSize: 1, localConcurrency: concurrency }, async ([job]) => {
      if (!job) return;
      await handler(job.data, { retryCount: (job as { retryCount?: number }).retryCount ?? 0 });
    });
  }
}
