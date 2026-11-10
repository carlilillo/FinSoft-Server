import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { AnalysisService } from '../analysis/analysis.service.js';
import { DomainError } from '../common/domain/domain-error.js';
import { JobQueueService } from '../jobs/job-queue.service.js';
import { SCHEDULED_ANALYSIS_QUEUE, type ScheduledAnalysisJob } from '../jobs/jobs.constants.js';
import { AnalysisSchedulesRepository } from './analysis-schedules.repository.js';
import { AnalysisSchedulesService } from './analysis-schedules.service.js';

/**
 * Runs when a user's weekly schedule fires: starts the same Gmail analysis the "Analyze last week's
 * emails" button starts, which the analysis worker then carries out end to end on its own.
 */
@Injectable()
export class ScheduledAnalysisProcessor implements OnApplicationBootstrap {
  private readonly logger = new Logger(ScheduledAnalysisProcessor.name);

  constructor(
    private readonly jobs: JobQueueService,
    private readonly schedules: AnalysisSchedulesRepository,
    private readonly schedulesService: AnalysisSchedulesService,
    private readonly analysis: AnalysisService,
  ) {}

  /** On every boot: workers first, so a catch-up job sent for an occurrence missed while down is picked up. */
  async onApplicationBootstrap(): Promise<void> {
    await this.jobs.work<ScheduledAnalysisJob>(SCHEDULED_ANALYSIS_QUEUE, (job) => this.handle(job));
    await this.schedulesService.reconcile();
  }

  async handle({ userId }: ScheduledAnalysisJob): Promise<void> {
    const schedule = await this.schedules.findByUser(userId);
    if (!schedule?.enabled) {
      this.logger.log({ userId }, 'Scheduled analysis skipped: the schedule was turned off');
      return;
    }
    try {
      const { runId } = await this.analysis.start(userId);
      this.logger.log({ userId, runId }, 'Scheduled analysis started');
    } catch (error) {
      // Gmail disconnected, or an analysis of the inbox already running: nothing to retry this week.
      if (error instanceof DomainError) {
        this.logger.warn({ userId, code: error.code }, `Scheduled analysis skipped: ${error.message}`);
        return;
      }
      throw error;
    }
  }
}
