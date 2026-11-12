import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { AgentPersistenceService } from '../agent/agent-persistence.service.js';
import { AgentRunnerService } from '../agent/agent-runner.service.js';
import { AgentWorkspaceService } from '../agent/files/workspace.service.js';
import { AppConfigService } from '../config/app-config.service.js';
import { DomainError } from '../common/domain/domain-error.js';
import { DocumentsService } from '../documents/documents.service.js';
import { resolveImportOutcome } from '../imports/domain/import-file.js';
import type { ImportFileEntity } from '../imports/entities/import-file.entity.js';
import { ImportFilesRepository } from '../imports/import-files.repository.js';
import { InvoicesRepository } from '../invoices/invoices.repository.js';
import { JobQueueService } from '../jobs/job-queue.service.js';
import { ANALYSIS_QUEUE, type AnalysisJob } from '../jobs/jobs.constants.js';
import { AnalysisIngestionService } from './analysis-ingestion.service.js';
import { AnalysisRunsRepository } from './analysis-runs.repository.js';
import { buildDocumentMessage, buildStartMessage } from './domain/agent-messages.js';
import { AnalysisRun } from './domain/analysis-run.js';

const MAX_ATTEMPTS = 2;
/** Imported documents of one session extracted at the same time. */
const DOCUMENT_BATCH_CONCURRENCY = 5;

/** Background worker: ingestion + agent invocation for each analysis job. */
@Injectable()
export class AnalysisProcessor implements OnApplicationBootstrap {
  private readonly logger = new Logger(AnalysisProcessor.name);

  constructor(
    private readonly jobs: JobQueueService,
    private readonly config: AppConfigService,
    private readonly runs: AnalysisRunsRepository,
    private readonly importFiles: ImportFilesRepository,
    private readonly invoices: InvoicesRepository,
    private readonly documents: DocumentsService,
    private readonly workspace: AgentWorkspaceService,
    private readonly ingestion: AnalysisIngestionService,
    private readonly agent: AgentRunnerService,
    private readonly persistence: AgentPersistenceService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.jobs.work<AnalysisJob>(
      ANALYSIS_QUEUE,
      (job, attempt) => this.handle(job, attempt.retryCount),
      this.config.get('ANALYSIS_WORKER_CONCURRENCY'),
    );
  }

  async handle(job: AnalysisJob, retryCount: number): Promise<void> {
    const entity = await this.runs.findById(job.runId);
    if (!entity) {
      this.logger.warn({ runId: job.runId }, 'Job for a deleted run ignored');
      return;
    }
    const run = AnalysisRun.from(entity);

    try {
      if (job.kind === 'import') {
        await this.runImport(run, job.userId);
      } else if (retryCount > 0 && (await this.persistence.hasCheckpoint(job.runId))) {
        this.logger.log({ runId: job.runId, retryCount }, 'Resuming thread from last checkpoint');
        await this.agent.run({
          userId: job.userId,
          threadId: job.runId,
          message: null,
        });
      } else if (job.kind === 'start') {
        await this.runStart(run, job.userId);
      } else {
        run.beginExtraction(entity.emailsTotal);
        await this.runs.save(run.toState());
        await this.agent.run({
          userId: job.userId,
          threadId: job.runId,
          message: job.message,
        });
      }
      run.complete(new Date());
      await this.runs.save(run.toState());
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error({ runId: job.runId, retryCount, error: message }, 'Analysis job failed');
      if (retryCount + 1 < MAX_ATTEMPTS) {
        await this.runs.save({
          ...run.toState(),
          stageDetail: 'Something went wrong; retrying',
        });
        throw error;
      }
      if (job.kind === 'import')
        await this.importFiles.failPending(job.runId, 'The extraction stopped before reaching this document.');
      run.fail(userFacingError(error), new Date());
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

    await this.agent.run({
      userId,
      threadId: run.toState().id,
      message: buildStartMessage(emails),
    });
  }

  /**
   * Imported files (PDFs and images) skip the inbox entirely: one batch of the document extractor, one
   * element (and one thread) per file. On a retry only the documents still pending run again, resuming their threads.
   */
  private async runImport(run: AnalysisRun, userId: string): Promise<void> {
    const runId = run.toState().id;
    run.beginDocumentExtraction();
    await this.runs.save(run.toState());

    const files = await this.importFiles.findPendingForRun(runId);
    const invocations = await Promise.all(
      files.map(async (file) => ({
        userId,
        runId,
        threadId: file.id,
        message: (await this.persistence.hasCheckpoint(file.id))
          ? null
          : buildDocumentMessage(file.workspacePath, file.fileName, file.mimeType),
      })),
    );
    const results = await this.agent.extractDocuments(invocations, DOCUMENT_BATCH_CONCURRENCY);

    for (const [index, result] of results.entries()) {
      const file = files[index] as ImportFileEntity;
      if (result.status === 'fulfilled') {
        await this.finishDocument(userId, file, result.value);
      } else {
        this.logger.error(
          {
            runId,
            importFileId: file.id,
            error: (result.reason as Error).message,
          },
          'Document extraction failed',
        );
        await this.importFiles.saveOutcome(file.id, {
          status: 'failed',
          reason: 'This document could not be processed.',
        });
      }
    }
  }

  /** Attaches the original file (PDF or image) to every invoice read from it, then records what happened to it. */
  private async finishDocument(userId: string, file: ImportFileEntity, finalAnswer: string): Promise<void> {
    const invoiceIds = await this.invoices.findIdsForImportFile(userId, file.id);
    const original = invoiceIds.length > 0 ? await this.readOriginal(userId, file) : null;
    for (const invoiceId of invoiceIds) {
      if (!original) break;
      await this.documents.storeOriginal({
        source: 'import',
        userId,
        invoiceId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        bytes: original,
      });
    }
    await this.importFiles.saveOutcome(file.id, resolveImportOutcome(finalAnswer, invoiceIds.length));
  }

  private async readOriginal(userId: string, file: ImportFileEntity): Promise<Uint8Array | null> {
    const stored = await this.workspace.readFile(userId, file.id, file.workspacePath);
    if (!stored) {
      this.logger.warn(
        { importFileId: file.id },
        'Imported document missing from the workspace; invoices kept without it',
      );
      return null;
    }
    return typeof stored.content === 'string' ? new TextEncoder().encode(stored.content) : stored.content;
  }
}

const GMAIL_ACCESS_CODES = new Set(['GMAIL_ACCESS_REVOKED', 'GMAIL_NOT_CONNECTED']);

function userFacingError(error: unknown): string {
  // These already say which account to reconnect, in words meant for the user.
  if (error instanceof DomainError && GMAIL_ACCESS_CODES.has(error.code)) return error.message;
  const message = (error as Error).message;
  if (/invalid_grant/i.test(message)) {
    return 'Gmail access expired or was revoked. Reconnect Gmail and run the analysis again.';
  }
  if (/rate limit|429/i.test(message))
    return 'The AI service is busy right now. Try the analysis again in a few minutes.';
  return 'The analysis stopped unexpectedly. Everything found so far was saved; you can re-run it.';
}
