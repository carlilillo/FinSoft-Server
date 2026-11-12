import { DomainError } from '../../common/domain/domain-error.js';
import {
  detectInvoiceFileFormat,
  type InvoiceFileFormat,
  SUPPORTED_INVOICE_FORMATS,
} from '../../documents/domain/document-format.js';

/** Outcome of extracting one imported document. */
export type ImportFileStatus = 'pending' | 'extracted' | 'not_invoice' | 'failed';

export const MAX_IMPORT_FILES = 10;
export const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024;

export interface IncomingFile {
  fileName: string;
  /** Declared by the browser; not trusted (phones often send "" or "application/octet-stream"). */
  mimeType: string;
  sizeBytes: number;
  bytes: Uint8Array;
}

/** An incoming file whose real format (read from its bytes) is a PDF or a supported image. */
export interface ImportableFile extends IncomingFile {
  format: InvoiceFileFormat;
}

export interface ImportOutcome {
  status: Exclude<ImportFileStatus, 'pending'>;
  reason: string | null;
}

export class NoFilesToImportError extends DomainError {
  readonly code = 'NO_FILES_TO_IMPORT';
  constructor() {
    super('Choose at least one invoice (PDF or image) to import');
  }
}

export class TooManyImportFilesError extends DomainError {
  readonly code = 'TOO_MANY_IMPORT_FILES';
  constructor(count: number) {
    super(`You can import up to ${MAX_IMPORT_FILES} invoices at once; you chose ${count}`);
  }
}

export class UnsupportedImportFileError extends DomainError {
  readonly code = 'IMPORT_FILE_UNSUPPORTED';
  constructor(fileName: string) {
    super(`${fileName} is not a PDF or a supported image. Invoices can be imported as ${SUPPORTED_INVOICE_FORMATS}.`);
  }
}

export class ImportFileTooLargeError extends DomainError {
  readonly code = 'IMPORT_FILE_TOO_LARGE';
  constructor(fileName: string) {
    super(`${fileName} is larger than ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB`);
  }
}

/**
 * Checks the batch and every file before anything is stored. A file's format comes from its content,
 * not its declared type or name: PDFs and images (photos, scans, screenshots) are equally invoices.
 */
export function assertImportable(files: IncomingFile[]): ImportableFile[] {
  if (files.length === 0) throw new NoFilesToImportError();
  if (files.length > MAX_IMPORT_FILES) throw new TooManyImportFilesError(files.length);
  return files.map((file) => {
    if (file.sizeBytes <= 0 || file.sizeBytes > MAX_IMPORT_FILE_BYTES) throw new ImportFileTooLargeError(file.fileName);
    const format = detectInvoiceFileFormat(file.bytes);
    if (!format) throw new UnsupportedImportFileError(file.fileName);
    return { ...file, format };
  });
}

/** Workspace-safe file name whose extension always matches the file's real format. */
export function importFileName(original: string, format: InvoiceFileFormat): string {
  const base = original
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(0, 100);
  return `${base || 'invoice'}${format.extension}`;
}

/**
 * What happened to a document once its extraction finished. Stored invoices win; otherwise the
 * extractor's final "NOT_AN_INVOICE: …" / "FAILED: …" line explains why nothing was stored.
 */
export function resolveImportOutcome(finalMessage: string, invoicesStored: number): ImportOutcome {
  if (invoicesStored > 0) return { status: 'extracted', reason: null };
  const text = finalMessage.trim();
  const notInvoice = /NOT_AN_INVOICE:?\s*(.*)/is.exec(text);
  if (notInvoice)
    return {
      status: 'not_invoice',
      reason: shorten(notInvoice[1]) ?? 'This document is not an invoice.',
    };
  const failed = /FAILED:?\s*(.*)/is.exec(text);
  return {
    status: 'failed',
    reason: shorten(failed?.[1]) ?? 'No invoice could be extracted from this document.',
  };
}

function shorten(reason: string | undefined): string | null {
  const firstLine = reason?.trim().split('\n')[0]?.trim();
  return firstLine ? firstLine.slice(0, 500) : null;
}
