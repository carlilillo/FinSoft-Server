import { Injectable } from '@nestjs/common';
import { tool, type ToolRuntime } from 'langchain';
import { DocumentsService } from '../../documents/documents.service.js';
import { EmailsRepository } from '../../emails/emails.repository.js';
import { InvoiceWriterService } from '../../invoices/invoice-writer.service.js';
import { EmailNotInRunError, InvalidWorkspacePathError } from '../domain/agent-tool.errors.js';
import { convertAttachment } from '../files/attachment-converter.js';
import { derivedPath, emailIdFromPath } from '../files/inbox-paths.js';
import { InboxWorkspaceService } from '../files/inbox-workspace.service.js';
import { asToolResult, emitEvent, resolveRunScope, type RunScope } from './run-scope.js';
import {
  convertAttachmentSchema,
  recordTriageSchema,
  saveInvoiceProductsSchema,
  saveInvoiceSchema,
  storeInvoiceDocumentSchema,
} from './tool-schemas.js';

/** Builds the agent tools with their service dependencies injected by Nest. */
@Injectable()
export class AgentToolsFactory {
  constructor(
    private readonly emails: EmailsRepository,
    private readonly writer: InvoiceWriterService,
    private readonly documents: DocumentsService,
    private readonly workspace: InboxWorkspaceService,
  ) {}

  triageTools() {
    return [this.recordTriage()];
  }

  extractorTools() {
    return [this.convertAttachment(), this.saveInvoice(), this.saveInvoiceProducts(), this.storeInvoiceDocument()];
  }

  private recordTriage() {
    return tool(
      (input, runtime: ToolRuntime) =>
        asToolResult(async () => {
          const scope = resolveRunScope(runtime);
          await this.assertEmailInRun(scope, input.emailId);
          await this.emails.updateTriage(input.emailId, {
            triage: input.verdict,
            triageReason: input.reason,
            language: input.language,
          });
          emitEvent(runtime, { event: 'email.triaged', emailId: input.emailId, verdict: input.verdict });
          return `Recorded ${input.verdict} for ${input.emailId}.`;
        }),
      {
        name: 'record_triage',
        description: 'Record whether an email likely contains an invoice. Call it once for every email you review.',
        schema: recordTriageSchema,
      },
    );
  }

  private convertAttachment() {
    return tool(
      (input, runtime: ToolRuntime) =>
        asToolResult(async () => {
          const scope = resolveRunScope(runtime);
          const emailId = this.attachmentEmailId(input.path);
          const file = await this.workspace.readFile(scope.userId, scope.threadId, input.path);
          if (!file) return `Error: ${input.path} does not exist. Check the attachment list in email.md.`;

          const bytes = typeof file.content === 'string' ? new TextEncoder().encode(file.content) : file.content;
          const fileName = input.path.split('/').pop() ?? 'attachment';
          const output = await convertAttachment(fileName, file.mimeType, bytes);

          if (output.kind === 'unsupported') return `Not converted: ${output.reason}`;
          if (output.kind === 'text') {
            const path = derivedPath(emailId, output.fileName);
            await this.workspace.writeFiles(scope.userId, scope.threadId, [[path, output.text]]);
            return `Converted to text. Read it with read_file: ${path}`;
          }
          const files = output.files.map((page) => [derivedPath(emailId, page.fileName), page.content] as [string, Uint8Array]);
          await this.workspace.writeFiles(scope.userId, scope.threadId, files);
          return `This PDF is scanned. Read the page images with read_file:\n${files.map(([path]) => `- ${path}`).join('\n')}`;
        }),
      {
        name: 'convert_attachment',
        description:
          'Convert a PDF, XML or HTML attachment into files you can read. Writes them under /inbox/{emailId}/derived/ ' +
          'and returns their paths (never the content).',
        schema: convertAttachmentSchema,
      },
    );
  }

  private saveInvoice() {
    return tool(
      (input, runtime: ToolRuntime) =>
        asToolResult(async () => {
          const scope = resolveRunScope(runtime);
          await this.assertEmailInRun(scope, input.emailId);
          const { emailId, ...invoice } = input;
          const saved = await this.writer.saveInvoice({ userId: scope.userId, runId: scope.threadId, emailId }, invoice);
          emitEvent(runtime, { event: 'invoice.saved', invoiceId: saved.invoiceId, created: saved.created });
          return saved.created
            ? `Saved invoice ${saved.invoiceId}. Now call save_invoice_products with invoiceId ${saved.invoiceId}.`
            : `Invoice already existed and was updated: ${saved.invoiceId}. Call save_invoice_products to refresh its lines.`;
        }),
      {
        name: 'save_invoice',
        description: 'Store the invoice header and vendor. Amounts are decimal strings; returns the invoiceId.',
        schema: saveInvoiceSchema,
      },
    );
  }

  private saveInvoiceProducts() {
    return tool(
      (input, runtime: ToolRuntime) =>
        asToolResult(async () => {
          const scope = resolveRunScope(runtime);
          const result = await this.writer.saveLines(scope.userId, input.invoiceId, input.lines);
          if (result.emailId) await this.emails.updateTriage(result.emailId, { triage: 'extracted' });
          emitEvent(runtime, { event: 'invoice.lines_saved', invoiceId: input.invoiceId, lineCount: result.lineCount });
          return `Saved ${result.lineCount} lines (${result.productIds.length} products) for invoice ${input.invoiceId}.`;
        }),
      {
        name: 'save_invoice_products',
        description: 'Store all line items of an invoice saved with save_invoice. Replaces previous lines of that invoice.',
        schema: saveInvoiceProductsSchema,
      },
    );
  }

  private storeInvoiceDocument() {
    return tool(
      (input, runtime: ToolRuntime) =>
        asToolResult(async () => {
          const scope = resolveRunScope(runtime);
          if (!input.path.includes('/attachments/')) {
            return 'Error: pass the ORIGINAL attachment path (…/attachments/…), not a derived file.';
          }
          this.attachmentEmailId(input.path);
          const file = await this.workspace.readFile(scope.userId, scope.threadId, input.path);
          if (!file) return `Error: ${input.path} does not exist.`;

          const bytes = typeof file.content === 'string' ? new TextEncoder().encode(file.content) : file.content;
          const stored = await this.documents.storeFromEmail({
            userId: scope.userId,
            invoiceId: input.invoiceId,
            fileName: input.path.split('/').pop() ?? 'document',
            mimeType: file.mimeType,
            bytes,
          });
          return stored.duplicate
            ? `The document was already attached to invoice ${input.invoiceId}.`
            : `Stored document ${stored.documentId} for invoice ${input.invoiceId}.`;
        }),
      {
        name: 'store_invoice_document',
        description: 'Upload the original attachment an invoice came from to permanent storage and link it to the invoice.',
        schema: storeInvoiceDocumentSchema,
      },
    );
  }

  private attachmentEmailId(path: string): string {
    const emailId = emailIdFromPath(path);
    if (!emailId) throw new InvalidWorkspacePathError(path);
    return emailId;
  }

  private async assertEmailInRun(scope: RunScope, emailId: string): Promise<void> {
    const email = await this.emails.findOneForRun(scope.userId, scope.threadId, emailId);
    if (!email) throw new EmailNotInRunError(emailId);
  }
}
