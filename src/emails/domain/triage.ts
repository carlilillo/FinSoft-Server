import { DomainError } from '../../common/domain/domain-error.js';

export type TriageVerdict = 'pending' | 'likely_invoice' | 'not_invoice' | 'user_selected' | 'extracted' | 'failed';
export type EmailLanguage = 'en' | 'es' | 'other';
export type AgentTriageVerdict = 'likely_invoice' | 'not_invoice';

export class NoEmailsSelectedError extends DomainError {
  readonly code = 'NO_EMAILS_SELECTED';
  constructor() {
    super('Select at least one email from this analysis to re-run the extraction');
  }
}

export interface TriagedEmail {
  id: string;
  triage: TriageVerdict;
}

export interface ContinuationPlan {
  toExtract: string[];
  alreadyExtracted: string[];
  rejected: string[];
}

/**
 * The user's correction: `selectedIds` are the emails that really contain invoices.
 * Emails already extracted are kept; the rest of the selection is (re)queued for extraction;
 * previously-flagged emails the user did not select are reported as rejected.
 */
export function planContinuation(emails: TriagedEmail[], selectedIds: string[]): ContinuationPlan {
  const selected = new Set(selectedIds);
  const known = emails.filter((email) => selected.has(email.id));
  if (known.length === 0) throw new NoEmailsSelectedError();

  return {
    toExtract: known.filter((email) => email.triage !== 'extracted').map((email) => email.id),
    alreadyExtracted: known.filter((email) => email.triage === 'extracted').map((email) => email.id),
    rejected: emails
      .filter((email) => !selected.has(email.id) && (email.triage === 'likely_invoice' || email.triage === 'extracted'))
      .map((email) => email.id),
  };
}
