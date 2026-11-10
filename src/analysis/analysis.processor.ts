import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { AgentPersistenceService } from '../agent/agent-persistence.service.js';
import { AgentRunnerService } from '../agent/agent-runner.service.js';
import { JobQueueService } from '../jobs/job-queue.service.js';
import { ANALYSIS_QUEUE, type AnalysisJob } from '../jobs/jobs.constants.js';
import { AnalysisIngestionService } from './analysis-ingestion.service.js';
import { AnalysisRunsRepository } from './analysis-runs.repository.js';
import { buildStartMessage } from './domain/agent-messages.js';
import { AnalysisRun } from './domain/analysis-run.js';

const MAX_ATTEMPTS = 2;

/** Background worker: ingestion + agent invocation for each analysis job. */
@Injectable()
export class AnalysisProcessor implements OnApplicationBootstrap {
  private readonly logger = new Logger(AnalysisProcessor.name);

  constructor(
    private readonly jobs: JobQueueService,
    private readonly runs: AnalysisRunsRepository,
    private readonly ingestion: AnalysisIngestionService,
    private readonly agent: AgentRunnerService,
    private readonly persistence: AgentPersistenceService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.jobs.work<AnalysisJob>(ANALYSIS_QUEUE, (job, attempt) => this.handle(job, attempt.retryCount));
  }

  async handle(job: AnalysisJob, retryCount: number): Promise<void> {
    const entity = await this.runs.findById(job.runId);
    if (!entity) {
      this.logger.warn({ runId: job.runId }, 'Job for a deleted run ignored');
      return;
    }
    const run = AnalysisRun.from(entity);

    try {
      if (retryCount > 0 && (await this.persistence.hasCheckpoint(job.runId))) {
        this.logger.log({ runId: job.runId, retryCount }, 'Resuming thread from last checkpoint');
        await this.agent.run({ userId: job.userId, threadId: job.runId, message: null });
      } else if (job.kind === 'start') {
        await this.runStart(run, job.userId);
      } else {
        run.beginExtraction(entity.emailsTotal);
        await this.runs.save(run.toState());
        await this.agent.run({ userId: job.userId, threadId: job.runId, message: job.message });
      }
      run.complete(new Date());
      await this.runs.save(run.toState());
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error({ runId: job.runId, retryCount, error: message }, 'Analysis job failed');
      if (retryCount + 1 < MAX_ATTEMPTS) {
        await this.runs.save({ ...run.toState(), stageDetail: 'Something went wrong; retrying' });
        throw error;
      }
      run.fail(userFacingError(message), new Date());
      await this.runs.save(run.toState());
    }
  }

  private async runStart(run: AnalysisRun, userId: string): Promise<void> {
    run.beginIngestion();
    await this.runs.save(run.toState());

    const emails = await this.ingestion.ingest(userId, run.toState().id);
    run.beginExtraction(emails.length);
    await this.runs.save(run.toState());
    if (emails.length === 0) return;

    await this.agent.run({ userId, threadId: run.toState().id, message: buildStartMessage(emails) });
  }
}

function userFacingError(message: string): string {
  if (/invalid_grant|GMAIL_NOT_CONNECTED/i.test(message)) {
    return 'Gmail access expired or was revoked. Reconnect Gmail and run the analysis again.';
  }
  if (/rate limit|429/i.test(message)) return 'The AI service is busy right now. Try the analysis again in a few minutes.';
  return 'The analysis stopped unexpectedly. Everything found so far was saved; you can re-run it.';
}
