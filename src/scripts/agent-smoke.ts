import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AgentPersistenceService } from '../agent/agent-persistence.service.js';
import { AgentRunnerService } from '../agent/agent-runner.service.js';
import { AnalysisIngestionService } from '../analysis/analysis-ingestion.service.js';
import { AnalysisRunsRepository } from '../analysis/analysis-runs.repository.js';
import { buildStartMessage } from '../analysis/domain/agent-messages.js';
import { AnalysisRun } from '../analysis/domain/analysis-run.js';
import { AppModule } from '../app.module.js';
import { newId } from '../database/ids.js';
import { EmailsRepository } from '../emails/emails.repository.js';
import { InvoicesRepository } from '../invoices/invoices.repository.js';
import { StorageService } from '../storage/storage.service.js';
import { UsersService } from '../users/users.service.js';
import { buildFixtureEmails } from './fixtures.js';

/**
 * End-to-end agent check against the real Postgres, S3 and OpenAI (no Gmail, no HTTP):
 * ingests 4 fixture emails into a throwaway user, runs the agent, verifies what was stored,
 * asks a follow-up on the same thread, then removes everything it created.
 *
 *   pnpm build && pnpm agent:smoke
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  const userId = `user_smoke${newId()}`.slice(0, 32);
  const runId = newId();
  const failures: string[] = [];

  try {
    await app.get(UsersService).ensureUser(userId);
    const runs = app.get(AnalysisRunsRepository);
    const run = AnalysisRun.start({ id: runId, userId, active: { total: 0, gmail: 0 } });
    run.beginIngestion();
    await runs.save(run.toState());

    const emails = await app
      .get(AnalysisIngestionService)
      .ingestRaw(userId, runId, buildFixtureEmails().map((fixture) => ({ gmailConnectionId: null, gmailMessageId: fixture.id, raw: fixture.raw })));
    run.beginExtraction(emails.length);
    await runs.save(run.toState());

    const runner = app.get(AgentRunnerService);
    const summary = await runner.run({ userId, threadId: runId, message: buildStartMessage(emails) });
    console.log('\nAgent summary:\n', summary);

    const invoices = await app.get(InvoicesRepository).findForRun(userId, runId);
    const triage = await app.get(EmailsRepository).findForRun(userId, runId);
    console.table(triage.map((email) => ({ subject: email.subject, verdict: email.triage, language: email.language })));
    console.table(
      invoices.map((invoice) => ({
        vendor: invoice.vendor?.name,
        number: invoice.invoiceNumber,
        date: invoice.issueDate,
        net: invoice.subtotalCents,
        vat: invoice.vatCents,
        irpf: invoice.withholdingCents,
        total: invoice.totalCents,
        currency: invoice.currency,
        lines: invoice.lines?.length,
        taxId: invoice.vendor?.taxId,
        phone: invoice.vendor?.phone,
      })),
    );

    const spanish = invoices.find((invoice) => invoice.currency === 'EUR');
    const english = invoices.find((invoice) => invoice.currency === 'GBP');
    expect(failures, invoices.length === 2, `expected 2 invoices, got ${invoices.length}`);
    expect(failures, spanish?.totalCents === 10600, 'Spanish total should be 10600 cents');
    expect(failures, spanish?.withholdingCents === 1500, 'Spanish IRPF should be 1500 cents');
    expect(failures, spanish?.vendor?.phone === null, 'Spanish vendor phone is not on the document and must be null');
    expect(failures, spanish?.runId === runId, 'run_id must equal the thread id');
    expect(failures, english?.totalCents === 1200, 'English total should be 1200 cents');
    expect(failures, triage.filter((email) => email.triage === 'not_invoice').length === 2, 'newsletter and shipping must be not_invoice');

    const followUp = await runner.run({
      userId,
      threadId: runId,
      message: 'Without calling any tool: list the subjects of the emails you marked as not invoices in this conversation.',
    });
    console.log('\nFollow-up on the same thread:\n', followUp);
    expect(failures, /tech|pedido|camino/i.test(followUp), 'the second invocation must remember the first one');
  } finally {
    await app.get(AgentPersistenceService).purgeThreads(userId, [runId]);
    await app.get(StorageService).deletePrefix(`users/${userId}/`);
    await app.get(UsersService).deleteByClerkId(userId);
    await app.close();
  }

  if (failures.length > 0) {
    console.error(`\n✗ ${failures.length} check(s) failed:\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('\n✓ Agent smoke test passed');
}

function expect(failures: string[], condition: boolean, message: string): void {
  if (!condition) failures.push(message);
}

await main();
