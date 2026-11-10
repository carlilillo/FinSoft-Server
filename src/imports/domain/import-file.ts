import { DomainError } from '../../common/domain/domain-error.js';

/** Outcome of extracting one imported document. */
export type ImportFileStatus = 'pending' | 'extracted' | 'not_invoice' | 'failed';

export const MAX_IMPORT_FILES = 10;
export const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024;
export const IMPORT_MIME_TYPE = 'application/pdf';

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

export interface IncomingFile {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  bytes: Uint8Array;
}

export interface ImportOutcome {
  status: Exclude<ImportFileStatus, 'pending'>;
  reason: string | null;
}

export class NoFilesToImportError extends DomainError {
  readonly code = 'NO_FILES_TO_IMPORT';
  constructor() {
    super('Choose at least one PDF invoice to import');
  }
}

export class TooManyImportFilesError extends DomainError {
  readonly code = 'TOO_MANY_IMPORT_FILES';
  constructor(count: number) {
    super(`You can import up to ${MAX_IMPORT_FILES} invoices at once; you chose ${count}`);
  }
}

export class ImportFileNotPdfError extends DomainError {
  readonly code = 'IMPORT_FILE_NOT_PDF';
  constructor(fileName: string) {
    super(`${fileName} is not a PDF. Only PDF invoices can be imported.`);
  }
}

export class ImportFileTooLargeError extends DomainError {
  readonly code = 'IMPORT_FILE_TOO_LARGE';
  constructor(fileName: string) {
    super(`${fileName} is larger than ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB`);
  }
}

/** Checks the batch and every file's real content (not just its declared type) before anything is stored. */
export function assertImportable(files: IncomingFile[]): void {
  if (files.length === 0) throw new NoFilesToImportError();
  if (files.length > MAX_IMPORT_FILES) throw new TooManyImportFilesError(files.length);
  for (const file of files) {
    if (file.sizeBytes <= 0 || file.sizeBytes > MAX_IMPORT_FILE_BYTES) throw new ImportFileTooLargeError(file.fileName);
    if (file.mimeType !== IMPORT_MIME_TYPE || !isPdf(file.bytes)) throw new ImportFileNotPdfError(file.fileName);
  }
}

export function isPdf(bytes: Uint8Array): boolean {
  return PDF_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

/** Workspace-safe file name that always ends in ".pdf" (the agent filesystem infers MIME types from extensions). */
export function importFileName(original: string): string {
  const base = original
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\.pdf$/i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(0, 100);
  return `${base || 'invoice'}.pdf`;
}

/**
 * What happened to a document once its extraction finished. Stored invoices win; otherwise the
 * extractor's final "NOT_AN_INVOICE: …" / "FAILED: …" line explains why nothing was stored.
 */
export function resolveImportOutcome(finalMessage: string, invoicesStored: number): ImportOutcome {
  if (invoicesStored > 0) return { status: 'extracted', reason: null };
  const text = finalMessage.trim();
  const notInvoice = /NOT_AN_INVOICE:?\s*(.*)/is.exec(text);
  if (notInvoice) return { status: 'not_invoice', reason: shorten(notInvoice[1]) ?? 'This document is not an invoice.' };
  const failed = /FAILED:?\s*(.*)/is.exec(text);
  return { status: 'failed', reason: shorten(failed?.[1]) ?? 'No invoice could be extracted from this document.' };
}

function shorten(reason: string | undefined): string | null {
  const firstLine = reason?.trim().split('\n')[0]?.trim();
  return firstLine ? firstLine.slice(0, 500) : null;
}
