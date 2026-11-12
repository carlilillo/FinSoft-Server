/** Pure rendering of a parsed email into the markdown file the triage agent reads. */

import {
  detectInvoiceFileFormat,
  INVOICE_FILE_FORMATS,
  INVOICE_IMAGE_MIME_TYPES,
} from '../../documents/domain/document-format.js';

export interface ParsedAttachment {
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface ParsedEmail {
  subject: string | null;
  senderName: string | null;
  senderEmail: string;
  receivedAt: Date;
  text: string;
  attachments: ParsedAttachment[];
}

const MAX_BODY_CHARS = 8_000;

export function renderEmailMarkdown(emailId: string, email: ParsedEmail, attachmentPaths: string[]): string {
  const body = email.text.trim();
  const truncated = body.length > MAX_BODY_CHARS;
  const sender = email.senderName ? `${email.senderName} <${email.senderEmail}>` : email.senderEmail;

  const attachmentLines =
    email.attachments.length === 0
      ? ['(none)']
      : email.attachments.map(
          (attachment, index) =>
            `- ${attachmentPaths[index]} (${attachment.contentType}, ${formatBytes(attachment.sizeBytes)})`,
        );

  return [
    `# Email ${emailId}`,
    '',
    `- Subject: ${email.subject ?? '(no subject)'}`,
    `- From: ${sender}`,
    `- Received: ${email.receivedAt.toISOString()}`,
    '',
    '## Attachments',
    ...attachmentLines,
    '',
    '## Body',
    truncated ? `${body.slice(0, MAX_BODY_CHARS)}\n\n[body truncated]` : body || '(empty body)',
    '',
  ].join('\n');
}

/** Extension of every attachment type worth reading, keyed by its canonical MIME type. */
const EXTENSION_BY_TYPE: Record<string, string> = {
  ...Object.fromEntries(Object.values(INVOICE_FILE_FORMATS).map((format) => [format.mimeType, format.extension])),
  'text/xml': '.xml',
  'text/html': '.html',
  'text/plain': '.txt',
  'text/csv': '.csv',
};

/** Declared types that mean the same as one of the canonical types above. */
const TYPE_ALIASES: Record<string, string> = {
  'application/xml': 'text/xml',
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
  'image/tif': 'image/tiff',
  'image/x-ms-bmp': 'image/bmp',
  'image/x-bmp': 'image/bmp',
  'image/heic-sequence': 'image/heic',
  'image/heif-sequence': 'image/heif',
};

/**
 * The attachment's real type. PDFs and images are recognised from their bytes, because mail clients
 * often declare them as "application/octet-stream" or with the wrong image type; anything else keeps
 * its declared type.
 */
export function resolveAttachmentType(declaredType: string, content: Uint8Array): string {
  const detected = detectInvoiceFileFormat(content);
  if (detected) return detected.mimeType;
  const declared = declaredType.toLowerCase().split(';')[0]?.trim() ?? '';
  return TYPE_ALIASES[declared] ?? declared;
}

/**
 * Safe, unique attachment file name whose extension matches its content type (the type itself is
 * stored with the file, the extension keeps names honest for the agent and for downloads).
 */
export function attachmentFileName(
  original: string | null,
  contentType: string,
  index: number,
  taken: Set<string>,
): string {
  const expectedExtension = EXTENSION_BY_TYPE[contentType.toLowerCase()] ?? '.bin';
  const base =
    (original ?? `attachment-${index + 1}`)
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^[._]+/, '')
      .slice(0, 100) || `attachment-${index + 1}`;
  const withExtension = `${base.replace(/\.[a-z0-9]{1,5}$/i, '')}${expectedExtension}`;

  let candidate = withExtension;
  for (let suffix = 2; taken.has(candidate); suffix++) {
    candidate = withExtension.replace(/(\.[a-z0-9]+)$/i, `-${suffix}$1`);
  }
  taken.add(candidate);
  return candidate;
}

/** Smaller images are icons, tracking pixels or signatures, never a readable invoice. */
const MIN_IMAGE_BYTES = 15_000;
/**
 * Images embedded in the email layout (inline or referenced from the HTML) are usually logos and
 * banners, but phones send photos the same way: a photo of a receipt is always well above this size.
 */
const MIN_EMBEDDED_IMAGE_BYTES = 100_000;

export interface AttachmentCandidate {
  /** Resolved with `resolveAttachmentType`. */
  contentType: string;
  sizeBytes: number;
  /** Inline, or referenced from the HTML body (cid:). */
  embedded: boolean;
}

/**
 * Attachments that can carry an invoice: PDFs, images (photos, scans and screenshots are documents
 * too) and structured or text invoices. Calendar invites, archives, icons and layout images are skipped.
 */
export function isRelevantAttachment({ contentType, sizeBytes, embedded }: AttachmentCandidate): boolean {
  const type = contentType.toLowerCase();
  if (INVOICE_IMAGE_MIME_TYPES.has(type)) return sizeBytes >= (embedded ? MIN_EMBEDDED_IMAGE_BYTES : MIN_IMAGE_BYTES);
  return type in EXTENSION_BY_TYPE;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
