import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { uploadPath } from '../agent/files/workspace-paths.js';
import { AgentWorkspaceService } from '../agent/files/workspace.service.js';
import { newId } from '../database/ids.js';
import { planContinuation } from '../emails/domain/triage.js';
import { EmailsRepository } from '../emails/emails.repository.js';
import type { EmailEntity } from '../emails/entities/email.entity.js';
import { GmailNotConnectedError } from '../gmail/domain/oauth-state.js';
import { GmailService } from '../gmail/gmail.service.js';
import { assertImportable, importFileName, type IncomingFile } from '../imports/domain/import-file.js';
import type { ImportFileEntity } from '../imports/entities/import-file.entity.js';
import { ImportFilesRepository } from '../imports/import-files.repository.js';
import { toInvoiceSummaryView } from '../invoices/dto/invoice.views.js';
import type { InvoiceEntity } from '../invoices/entities/invoice.entity.js';
import { InvoicesRepository } from '../invoices/invoices.repository.js';
import { JobQueueService } from '../jobs/job-queue.service.js';
import { ANALYSIS_QUEUE, type AnalysisJob } from '../jobs/jobs.constants.js';
import { ProductsRepository } from '../products/products.repository.js';
import { AnalysisRunsRepository } from './analysis-runs.repository.js';
import { buildContinuationMessage } from './domain/agent-messages.js';
import { AnalysisRun, isRunActive } from './domain/analysis-run.js';
import { summarizeSession } from './domain/session-summary.js';
import type { ContinueAnalysisDto } from './dto/continue-analysis.dto.js';
import type { AnalysisRunEntity } from './entities/analysis-run.entity.js';

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private readonly runs: AnalysisRunsRepository,
    private readonly emails: EmailsRepository,
    private readonly importFiles: ImportFilesRepository,
    private readonly invoices: InvoicesRepository,
    private readonly products: ProductsRepository,
    private readonly gmail: GmailService,
    private readonly workspace: AgentWorkspaceService,
    private readonly jobs: JobQueueService,
  ) {}

  /** Creates a pending Gmail run and hands it to the background worker. */
  async start(userId: string): Promise<{ runId: string }> {
    if (!(await this.gmail.isConnected(userId))) throw new GmailNotConnectedError();
    const runId = newId();
    await this.runs.saveExclusive(userId, (active) =>
      AnalysisRun.start({ id: runId, userId, active }).toState(),
    );
    await this.jobs.enqueue<AnalysisJob>(ANALYSIS_QUEUE, { kind: 'start', userId, runId });
    return { runId };
  }

  /**
   * Google redirected back: store the Gmail grant, then start the analysis when that is what the user
   * went to Google for. Linking an account from Settings starts nothing (`runId` is null).
   */
  async completeConsent(code: string, state: string): Promise<{ runId: string | null }> {
    const { userId, intent } = await this.gmail.completeConsent(code, state);
    if (intent === 'connect') return { runId: null };
    return this.start(userId);
  }

  /**
   * Manual import: a new extraction session fed by the user's PDFs instead of their inbox. Each PDF is
   * written to the workspace of its own thread; the worker then extracts them as one batch.
   */
  async importDocuments(userId: string, files: IncomingFile[]): Promise<{ runId: string }> {
    assertImportable(files);
    const runId = newId();
    const run = await this.runs.saveExclusive(userId, (active) =>
      AnalysisRun.startImport({ id: runId, userId, active, documentsTotal: files.length }).toState(),
    );

    try {
      const rows = [];
      for (const file of files) {
        const row = {
          id: newId(),
          userId,
          runId,
          fileName: file.fileName.slice(0, 255),
          workspacePath: uploadPath(importFileName(file.fileName)),
          sizeBytes: file.sizeBytes,
          status: 'pending' as const,
          reason: null,
        };
        await this.workspace.writeFiles(userId, row.id, [[row.workspacePath, file.bytes]]);
        rows.push(row);
      }
      await this.importFiles.insertMany(rows);
      await this.jobs.enqueue<AnalysisJob>(ANALYSIS_QUEUE, { kind: 'import', userId, runId });
    } catch (error) {
      this.logger.error({ runId, error: (error as Error).message }, 'Could not prepare the imported documents');
      const failed = AnalysisRun.from(run);
      failed.fail('The documents could not be saved. Import them again.', new Date());
      await this.runs.save(failed.toState());
      throw error;
    }
    return { runId };
  }

  async continue(userId: string, runId: string, dto: ContinueAnalysisDto): Promise<{ runId: string }> {
    const entity = await this.findOwnedOrThrow(userId, runId);
    const emails = await this.emails.findForRun(userId, runId);
    const plan = planContinuation(emails, dto.emailIds);

    await this.runs.saveExclusive(userId, (active) => {
      const run = AnalysisRun.from(entity);
      run.requestContinuation(active);
      return run.toState();
    });
    await this.emails.markMany(plan.toExtract, 'user_selected');

    const message = buildContinuationMessage(plan, emails, dto.note ?? null);
    await this.jobs.enqueue<AnalysisJob>(ANALYSIS_QUEUE, { kind: 'continue', userId, runId, message });
    return { runId };
  }

  async list(userId: string) {
    const runs = await this.runs.listForUser(userId, 20);
    return runs.map((run) => ({
      id: run.id,
      source: run.source,
      status: run.status,
      emailsTotal: run.emailsTotal,
      documentsTotal: run.documentsTotal,
      createdAt: run.createdAt,
      finishedAt: run.finishedAt,
    }));
  }

  async get(userId: string, runId: string) {
    const run = await this.findOwnedOrThrow(userId, runId);
    const [emails, accounts, documents, invoices] = await Promise.all([
      run.source === 'gmail' ? this.emails.findForRun(userId, runId) : Promise.resolve([]),
      run.source === 'gmail' ? this.gmail.accountAddresses(userId) : Promise.resolve(new Map<string, string>()),
      run.source === 'upload' ? this.importFiles.findForRun(userId, runId) : Promise.resolve([]),
      this.invoices.findForRun(userId, runId),
    ]);
    const progress = {
      emailsTotal: run.emailsTotal,
      emailsReviewed: emails.filter((email) => email.triage !== 'pending' && email.triage !== 'user_selected').length,
      documentsTotal: run.documentsTotal,
      documentsProcessed: documents.filter((document) => document.status !== 'pending').length,
      invoicesFound: invoices.length,
    };
    const base = {
      id: run.id,
      source: run.source,
      status: run.status,
      stageDetail: run.stageDetail,
      error: run.error,
      invocationCount: run.invocationCount,
      createdAt: run.createdAt,
      finishedAt: run.finishedAt,
      progress,
    };
    if (isRunActive(run.status)) return { ...base, session: null };

    const products = await this.products.findForInvoiceIds(userId, invoices.map((invoice) => invoice.id));
    return {
      ...base,
      session: {
        totals: summarizeSession(invoices),
        invoices: invoices.map(toInvoiceSummaryView),
        products,
        emails: emails.map((email) => toEvaluatedEmailView(email, invoices, accounts)),
        documents: documents.map((document) => toImportedDocumentView(document, invoices)),
      },
    };
  }

  private async findOwnedOrThrow(userId: string, runId: string): Promise<AnalysisRunEntity> {
    const run = await this.runs.findOwned(userId, runId);
    if (!run) throw new NotFoundException(`Analysis ${runId} not found`);
    return run;
  }
}

function toEvaluatedEmailView(email: EmailEntity, invoices: InvoiceEntity[], accounts: Map<string, string>) {
  return {
    id: email.id,
    /** The connected Gmail account whose inbox the email was found in. */
    gmailAccount: (email.gmailConnectionId && accounts.get(email.gmailConnectionId)) || null,
    subject: email.subject,
    senderName: email.senderName,
    senderEmail: email.senderEmail,
    receivedAt: email.receivedAt,
    attachmentCount: email.attachmentCount,
    verdict: email.triage,
    reason: email.triageReason,
    invoiceIds: invoices.filter((invoice) => invoice.emailId === email.id).map((invoice) => invoice.id),
  };
}

function toImportedDocumentView(document: ImportFileEntity, invoices: InvoiceEntity[]) {
  return {
    id: document.id,
    fileName: document.fileName,
    sizeBytes: document.sizeBytes,
    status: document.status,
    reason: document.reason,
    invoiceIds: invoices.filter((invoice) => invoice.importFileId === document.id).map((invoice) => invoice.id),
  };
}
