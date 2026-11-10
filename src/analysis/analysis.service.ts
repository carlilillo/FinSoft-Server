import { Injectable, NotFoundException } from '@nestjs/common';
import { newId } from '../database/ids.js';
import { planContinuation } from '../emails/domain/triage.js';
import { EmailsRepository } from '../emails/emails.repository.js';
import { GmailNotConnectedError } from '../gmail/domain/oauth-state.js';
import { GmailService } from '../gmail/gmail.service.js';
import { toInvoiceSummaryView } from '../invoices/dto/invoice.views.js';
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
  constructor(
    private readonly runs: AnalysisRunsRepository,
    private readonly emails: EmailsRepository,
    private readonly invoices: InvoicesRepository,
    private readonly products: ProductsRepository,
    private readonly gmail: GmailService,
    private readonly jobs: JobQueueService,
  ) {}

  /** Creates a pending run and hands it to the background worker. */
  async start(userId: string): Promise<{ runId: string }> {
    if (!(await this.gmail.isConnected(userId))) throw new GmailNotConnectedError();
    const active = await this.runs.findActiveForUser(userId);
    const run = AnalysisRun.start({ id: newId(), userId, activeRunId: active?.id ?? null });

    await this.runs.save(run.toState());
    await this.jobs.enqueue<AnalysisJob>(ANALYSIS_QUEUE, { kind: 'start', userId, runId: run.toState().id });
    return { runId: run.toState().id };
  }

  /** Google redirected back: store the Gmail grant, then start (or resume watching) an analysis. */
  async startAfterConsent(code: string, state: string): Promise<{ runId: string }> {
    const userId = await this.gmail.completeConsent(code, state);
    const active = await this.runs.findActiveForUser(userId);
    if (active) return { runId: active.id };
    return this.start(userId);
  }

  async continue(userId: string, runId: string, dto: ContinueAnalysisDto): Promise<{ runId: string }> {
    const entity = await this.findOwnedOrThrow(userId, runId);
    const emails = await this.emails.findForRun(userId, runId);
    const plan = planContinuation(emails, dto.emailIds);
    const active = await this.runs.findActiveForUser(userId);

    const run = AnalysisRun.from(entity);
    run.requestContinuation(active?.id ?? null);
    await this.emails.markMany(plan.toExtract, 'user_selected');
    await this.runs.save(run.toState());

    const message = buildContinuationMessage(plan, emails, dto.note ?? null);
    await this.jobs.enqueue<AnalysisJob>(ANALYSIS_QUEUE, { kind: 'continue', userId, runId, message });
    return { runId };
  }

  async list(userId: string) {
    const runs = await this.runs.listForUser(userId, 20);
    return runs.map((run) => ({
      id: run.id,
      status: run.status,
      emailsTotal: run.emailsTotal,
      createdAt: run.createdAt,
      finishedAt: run.finishedAt,
    }));
  }

  async get(userId: string, runId: string) {
    const run = await this.findOwnedOrThrow(userId, runId);
    const [emails, invoices] = await Promise.all([
      this.emails.findForRun(userId, runId),
      this.invoices.findForRun(userId, runId),
    ]);
    const progress = {
      emailsTotal: run.emailsTotal,
      emailsReviewed: emails.filter((email) => email.triage !== 'pending' && email.triage !== 'user_selected').length,
      invoicesFound: invoices.length,
    };
    const base = {
      id: run.id,
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
        emails: emails.map((email) => ({
          id: email.id,
          subject: email.subject,
          senderName: email.senderName,
          senderEmail: email.senderEmail,
          receivedAt: email.receivedAt,
          attachmentCount: email.attachmentCount,
          verdict: email.triage,
          reason: email.triageReason,
          invoiceIds: invoices.filter((invoice) => invoice.emailId === email.id).map((invoice) => invoice.id),
        })),
      },
    };
  }

  private async findOwnedOrThrow(userId: string, runId: string): Promise<AnalysisRunEntity> {
    const run = await this.runs.findOwned(userId, runId);
    if (!run) throw new NotFoundException(`Analysis ${runId} not found`);
    return run;
  }
}
