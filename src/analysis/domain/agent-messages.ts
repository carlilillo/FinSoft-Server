import type { ContinuationPlan } from '../../emails/domain/triage.js';
import type { InvoiceDirection } from '../../invoices/domain/invoice-direction.js';

export interface EmailReference {
  id: string;
  subject: string | null;
  senderEmail: string;
}

/**
 * First message of a thread: only ids and paths; the agent reads the files itself. The user's own addresses let it
 * tell invoices the user sent to customers apart from the provider invoices it collects.
 */
export function buildStartMessage(emails: EmailReference[], ownAddresses: string[]): string {
  const lines = emails.map((email) => `- /inbox/${email.id}/email.md`);
  return [
    `Here are ${emails.length} emails received in my inbox during the last 7 days.`,
    'Review every one of them, record a triage verdict for each, and extract the invoices my providers sent me.',
    'Do not extract invoices I issued to my own customers.',
    '',
    ownAddresses.length > 0
      ? `My own email addresses (emails sent from them are mine, not a provider's): ${ownAddresses.join(', ')}`
      : 'My own email addresses are unknown.',
    '',
    ...lines,
  ].join('\n');
}

const DOCUMENT_DIRECTION_LINES: Record<InvoiceDirection, string> = {
  issued:
    'It is an invoice I ISSUED to one of my customers. Store the customer I billed as the counterparty, never my own business.',
  received:
    'It is an invoice I RECEIVED from one of my providers. Store the provider who issued it as the counterparty.',
};

/**
 * First message of an imported document's thread: the path and the kind of invoice the user imported; the extractor
 * reads the file (PDF or image) itself.
 */
export function buildDocumentMessage(
  workspacePath: string,
  originalName: string,
  mimeType: string,
  direction: InvoiceDirection,
): string {
  const kind = mimeType === 'application/pdf' ? 'a PDF' : `an image (${mimeType})`;
  return [
    `I imported this invoice by hand: ${workspacePath} (${kind}, original file name "${originalName}").`,
    DOCUMENT_DIRECTION_LINES[direction],
    'Extract every invoice it contains and store them.',
  ].join('\n');
}

/** The user's correction, sent on the same thread so the agent keeps its earlier context. */
export function buildContinuationMessage(
  plan: ContinuationPlan,
  emails: EmailReference[],
  note: string | null,
): string {
  const describe = (id: string) => {
    const email = emails.find((candidate) => candidate.id === id);
    return `- ${id} — "${email?.subject ?? '(no subject)'}" from ${email?.senderEmail ?? 'unknown'}`;
  };

  const sections = [
    'I reviewed your results. These are the emails that really contain invoices.',
    '',
    'Extract these (not extracted yet):',
    ...(plan.toExtract.length > 0 ? plan.toExtract.map(describe) : ['- none']),
    '',
    'Already extracted, keep as they are:',
    ...(plan.alreadyExtracted.length > 0 ? plan.alreadyExtracted.map(describe) : ['- none']),
  ];
  if (plan.rejected.length > 0) {
    sections.push(
      '',
      'These are NOT invoices; record them as not_invoice and do not extract them:',
      ...plan.rejected.map(describe),
    );
  }
  if (note?.trim()) sections.push('', `My note: ${note.trim()}`);
  return sections.join('\n');
}
