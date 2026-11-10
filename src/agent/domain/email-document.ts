/** Pure rendering of a parsed email into the markdown file the triage agent reads. */

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

const EXTENSION_BY_TYPE: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'application/xml': '.xml',
  'text/xml': '.xml',
  'text/html': '.html',
  'text/plain': '.txt',
  'text/csv': '.csv',
};

/**
 * Safe, unique attachment file name whose extension matches its content type, because the
 * agent filesystem infers MIME types from extensions.
 */
export function attachmentFileName(original: string | null, contentType: string, index: number, taken: Set<string>): string {
  const expectedExtension = EXTENSION_BY_TYPE[contentType.toLowerCase()] ?? '.bin';
  const base = (original ?? `attachment-${index + 1}`)
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

/** Attachments that can carry an invoice; signatures, calendar invites and inline logos are skipped. */
export function isRelevantAttachment(contentType: string, sizeBytes: number, isInline: boolean): boolean {
  const type = contentType.toLowerCase();
  if (type.startsWith('image/')) return !isInline && sizeBytes > 15_000;
  return type in EXTENSION_BY_TYPE;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
