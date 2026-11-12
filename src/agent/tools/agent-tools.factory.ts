import { Injectable } from '@nestjs/common';
import { tool, type ToolRuntime } from 'langchain';
import { DocumentsService } from '../../documents/documents.service.js';
import { EmailsRepository } from '../../emails/emails.repository.js';
import type { EmailEntity } from '../../emails/entities/email.entity.js';
import { InvoiceWriterService } from '../../invoices/invoice-writer.service.js';
import { EmailNotInRunError, InvalidWorkspacePathError } from '../domain/agent-tool.errors.js';
import { emailIdFromPath } from '../files/workspace-paths.js';
import { AgentWorkspaceService } from '../files/workspace.service.js';
import { asToolResult, emitEvent, resolveImportScope, resolveRunScope, type RunScope } from './run-scope.js';
import {
  recordTriageSchema,
  saveImportedInvoiceSchema,
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
    private readonly workspace: AgentWorkspaceService,
  ) {}

  triageTools() {
    return [this.recordTriage()];
  }

  extractorTools() {
    return [this.saveInvoice(), this.saveInvoiceProducts(), this.storeInvoiceDocument()];
  }

  /** Imported documents (PDFs or images): the server attaches the original document itself once the thread finishes. */
  documentExtractorTools() {
    return [this.saveImportedInvoice(), this.saveInvoiceProducts()];
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
          emitEvent(runtime, {
            event: 'email.triaged',
            emailId: input.emailId,
            verdict: input.verdict,
          });
          return `Recorded ${input.verdict} for ${input.emailId}.`;
        }),
      {
        name: 'record_triage',
        description: 'Record whether an email likely contains an invoice. Call it once for every email you review.',
        schema: recordTriageSchema,
      },
    );
  }

  private saveInvoice() {
    return tool(
      (input, runtime: ToolRuntime) =>
        asToolResult(async () => {
          const scope = resolveRunScope(runtime);
          const email = await this.assertEmailInRun(scope, input.emailId);
          const { emailId, ...invoice } = input;
          const saved = await this.writer.saveInvoice(
            {
              userId: scope.userId,
              runId: scope.threadId,
              emailId,
              gmailConnectionId: email.gmailConnectionId,
              importFileId: null,
            },
            invoice,
          );
          emitEvent(runtime, {
            event: 'invoice.saved',
            invoiceId: saved.invoiceId,
            created: saved.created,
          });
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

  private saveImportedInvoice() {
    return tool(
      (input, runtime: ToolRuntime) =>
        asToolResult(async () => {
          const scope = resolveImportScope(runtime);
          const saved = await this.writer.saveInvoice(
            {
              userId: scope.userId,
              runId: scope.runId,
              emailId: null,
              gmailConnectionId: null,
              importFileId: scope.importFileId,
            },
            input,
          );
          emitEvent(runtime, {
            event: 'invoice.saved',
            invoiceId: saved.invoiceId,
            created: saved.created,
          });
          return saved.created
            ? `Saved invoice ${saved.invoiceId}. Now call save_invoice_products with invoiceId ${saved.invoiceId}.`
            : `Invoice already existed and was updated: ${saved.invoiceId}. Call save_invoice_products to refresh its lines.`;
        }),
      {
        name: 'save_invoice',
        description: 'Store the invoice header and vendor. Amounts are decimal strings; returns the invoiceId.',
        schema: saveImportedInvoiceSchema,
      },
    );
  }

  private saveInvoiceProducts() {
    return tool(
      (input, runtime: ToolRuntime) =>
        asToolResult(async () => {
          const scope = resolveRunScope(runtime);
          const result = await this.writer.saveLines(scope.userId, input.invoiceId, input.lines);
          if (result.emailId)
            await this.emails.updateTriage(result.emailId, {
              triage: 'extracted',
            });
          emitEvent(runtime, {
            event: 'invoice.lines_saved',
            invoiceId: input.invoiceId,
            lineCount: result.lineCount,
          });
          return `Saved ${result.lineCount} lines (${result.productIds.length} products) for invoice ${input.invoiceId}.`;
        }),
      {
        name: 'save_invoice_products',
        description:
          'Store all line items of an invoice saved with save_invoice. Replaces previous lines of that invoice.',
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
            return 'Error: pass an attachment path (/inbox/{emailId}/attachments/…).';
          }
          this.attachmentEmailId(input.path);
          const file = await this.workspace.readFile(scope.userId, scope.threadId, input.path);
          if (!file) return `Error: ${input.path} does not exist.`;

          const bytes = typeof file.content === 'string' ? new TextEncoder().encode(file.content) : file.content;
          const stored = await this.documents.storeOriginal({
            source: 'email',
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
        description:
          'Upload the original attachment an invoice came from to permanent storage and link it to the invoice.',
        schema: storeInvoiceDocumentSchema,
      },
    );
  }

  private attachmentEmailId(path: string): string {
    const emailId = emailIdFromPath(path);
    if (!emailId) throw new InvalidWorkspacePathError(path);
    return emailId;
  }

  private async assertEmailInRun(scope: RunScope, emailId: string): Promise<EmailEntity> {
    const email = await this.emails.findOneForRun(scope.userId, scope.threadId, emailId);
    if (!email) throw new EmailNotInRunError(emailId);
    return email;
  }
}
