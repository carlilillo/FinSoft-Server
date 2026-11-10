import type { ContinuationPlan } from '../../emails/domain/triage.js';

export interface EmailReference {
  id: string;
  subject: string | null;
  senderEmail: string;
}

/** First message of a thread: only ids and paths; the agent reads the files itself. */
export function buildStartMessage(emails: EmailReference[]): string {
  const lines = emails.map((email) => `- /inbox/${email.id}/email.md`);
  return [
    `Here are ${emails.length} emails received in my inbox during the last 7 days.`,
    'Review every one of them, record a triage verdict for each, and extract the invoices you find.',
    '',
    ...lines,
  ].join('\n');
}

/** The user's correction, sent on the same thread so the agent keeps its earlier context. */
export function buildContinuationMessage(plan: ContinuationPlan, emails: EmailReference[], note: string | null): string {
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
    sections.push('', 'These are NOT invoices; record them as not_invoice and do not extract them:', ...plan.rejected.map(describe));
  }
  if (note?.trim()) sections.push('', `My note: ${note.trim()}`);
  return sections.join('\n');
}
