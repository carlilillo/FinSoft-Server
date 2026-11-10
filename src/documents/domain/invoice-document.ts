import { DomainError } from '../../common/domain/domain-error.js';

export type DocumentSource = 'email' | 'upload';
export type DocumentStatus = 'pending_upload' | 'available';

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export const ALLOWED_DOCUMENT_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'application/xml',
  'text/xml',
  'text/html',
  'text/plain',
]);

export class DocumentTooLargeError extends DomainError {
  readonly code = 'DOCUMENT_TOO_LARGE';
  constructor(size: number) {
    super(`Documents can be up to ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB; this one is ${(size / 1024 / 1024).toFixed(1)} MB`);
  }
}

export class DocumentTypeNotAllowedError extends DomainError {
  readonly code = 'DOCUMENT_TYPE_NOT_ALLOWED';
  constructor(mimeType: string) {
    super(`Files of type ${mimeType} can't be attached to an invoice. Use PDF, an image or XML.`);
  }
}

export class DocumentAlreadyConfirmedError extends DomainError {
  readonly code = 'DOCUMENT_ALREADY_CONFIRMED';
  constructor() {
    super('This document upload was already confirmed');
  }
}

export function assertUploadAllowed(props: { mimeType: string; sizeBytes: number }): void {
  if (!ALLOWED_DOCUMENT_TYPES.has(props.mimeType)) throw new DocumentTypeNotAllowedError(props.mimeType);
  if (props.sizeBytes <= 0 || props.sizeBytes > MAX_DOCUMENT_BYTES) throw new DocumentTooLargeError(props.sizeBytes);
}

export function assertConfirmable(status: DocumentStatus): void {
  if (status !== 'pending_upload') throw new DocumentAlreadyConfirmedError();
}

/** S3 layout: everything for a user lives under users/{userId}/ so account deletion is one prefix delete. */
export function buildDocumentKey(props: { userId: string; invoiceId: string; documentId: string; fileName: string }): string {
  return `users/${props.userId}/invoices/${props.invoiceId}/${props.documentId}-${sanitizeFileName(props.fileName)}`;
}

export function sanitizeFileName(fileName: string): string {
  const cleaned = fileName
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+/, '');
  return (cleaned || 'document').slice(-120);
}
