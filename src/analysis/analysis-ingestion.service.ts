import { Injectable, Logger } from '@nestjs/common';
import { attachmentFileName, renderEmailMarkdown } from '../agent/domain/email-document.js';
import { parseRawEmail } from '../agent/files/email-parser.js';
import { attachmentPath, emailMarkdownPath } from '../agent/files/workspace-paths.js';
import { AgentWorkspaceService } from '../agent/files/workspace.service.js';
import { newId } from '../database/ids.js';
import { EmailsRepository } from '../emails/emails.repository.js';
import type { EmailEntity } from '../emails/entities/email.entity.js';
import { GmailService, type RawGmailMessage } from '../gmail/gmail.service.js';

/**
 * Fetches last week's inbox of every connected Gmail account and lays every email out in the agent's Postgres-backed workspace:
 * the body as markdown and each attachment as its original bytes. Nothing is put in the prompt.
 */
@Injectable()
export class AnalysisIngestionService {
  private readonly logger = new Logger(AnalysisIngestionService.name);

  constructor(
    private readonly gmail: GmailService,
    private readonly emails: EmailsRepository,
    private readonly workspace: AgentWorkspaceService,
  ) {}

  async ingest(userId: string, runId: string): Promise<EmailEntity[]> {
    return this.ingestRaw(userId, runId, await this.gmail.fetchLastWeek(userId));
  }

  /** Lays out already-fetched raw messages (also used by the smoke test with fixture .eml files). */
  async ingestRaw(userId: string, runId: string, rawMessages: RawGmailMessage[]): Promise<EmailEntity[]> {
    const rows: EmailEntity[] = [];

    for (const message of rawMessages) {
      try {
        const parsed = await parseRawEmail(message.raw);
        const emailId = newId();
        const taken = new Set<string>();
        const files = parsed.files.map((file, index) => ({
          path: attachmentPath(emailId, attachmentFileName(file.fileName, file.contentType, index, taken)),
          content: new Uint8Array(file.content),
        }));

        await this.workspace.writeFiles(userId, runId, [
          [emailMarkdownPath(emailId), renderEmailMarkdown(emailId, parsed, files.map((file) => file.path))],
          ...files.map((file) => [file.path, file.content] as [string, Uint8Array]),
        ]);

        rows.push({
          id: emailId,
          userId,
          runId,
          gmailConnectionId: message.gmailConnectionId,
          gmailMessageId: message.gmailMessageId,
          subject: parsed.subject?.slice(0, 998) ?? null,
          senderName: parsed.senderName?.slice(0, 320) ?? null,
          senderEmail: parsed.senderEmail.slice(0, 320),
          receivedAt: parsed.receivedAt,
          attachmentCount: files.length,
          language: null,
          triage: 'pending',
          triageReason: null,
        });
      } catch (error) {
        this.logger.warn({ runId, gmailMessageId: message.gmailMessageId, error: (error as Error).message }, 'Skipped unparsable email');
      }
    }

    await this.emails.insertMany(rows);
    this.logger.log({ runId, userId, emails: rows.length }, 'Inbox ingested into agent workspace');
    return rows;
  }
}
