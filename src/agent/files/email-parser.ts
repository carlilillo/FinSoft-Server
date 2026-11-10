import { type AddressObject, simpleParser } from 'mailparser';
import { convert as htmlToText } from 'html-to-text';
import { isRelevantAttachment, type ParsedEmail } from '../domain/email-document.js';

export interface ParsedEmailWithFiles extends ParsedEmail {
  files: Array<{ fileName: string | null; contentType: string; content: Buffer }>;
}

/** Parses a raw RFC 822 message into headers, a plain-text body and the attachments worth reading. */
export async function parseRawEmail(raw: Buffer): Promise<ParsedEmailWithFiles> {
  const parsed = await simpleParser(raw, { skipImageLinks: true });
  const from = firstAddress(parsed.from);
  const relevant = parsed.attachments.filter((attachment) =>
    isRelevantAttachment(attachment.contentType, attachment.size, attachment.contentDisposition === 'inline'),
  );

  return {
    subject: parsed.subject ?? null,
    senderName: from?.name || null,
    senderEmail: from?.address ?? 'unknown@unknown',
    receivedAt: parsed.date ?? new Date(),
    text: parsed.text?.trim() || (parsed.html ? htmlToText(parsed.html, { wordwrap: false }) : ''),
    attachments: relevant.map((attachment) => ({
      fileName: attachment.filename ?? 'attachment',
      contentType: attachment.contentType,
      sizeBytes: attachment.size,
    })),
    files: relevant.map((attachment) => ({
      fileName: attachment.filename ?? null,
      contentType: attachment.contentType,
      content: attachment.content,
    })),
  };
}

function firstAddress(address: AddressObject | AddressObject[] | undefined): { name: string; address?: string } | null {
  const object = Array.isArray(address) ? address[0] : address;
  return object?.value[0] ?? null;
}
