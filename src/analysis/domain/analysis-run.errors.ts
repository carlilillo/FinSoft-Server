import { DomainError } from '../../common/domain/domain-error.js';
import type { RunStatus } from './analysis-run.js';

export class RunLimitReachedError extends DomainError {
  readonly code = 'RUN_LIMIT_REACHED';
  constructor(limit: number) {
    super(`You already have ${limit} analyses in progress. Wait for one to finish before starting another one.`);
  }
}

export class GmailRunAlreadyActiveError extends DomainError {
  readonly code = 'GMAIL_RUN_ALREADY_ACTIVE';
  constructor() {
    super('Your inbox is already being analyzed. Wait for that analysis to finish before starting another one.');
  }
}

export class RunNotContinuableError extends DomainError {
  readonly code = 'RUN_NOT_CONTINUABLE';
  constructor(runId: string, status: RunStatus) {
    super(`Analysis ${runId} is ${status}; it can be re-run only after it finishes`);
  }
}

export class ImportRunNotContinuableError extends DomainError {
  readonly code = 'IMPORT_NOT_CONTINUABLE';
  constructor() {
    super('Imported invoices have no emails to re-select. Import the documents again instead.');
  }
}

export class RunStillActiveError extends DomainError {
  readonly code = 'RUN_STILL_ACTIVE';
  constructor() {
    super('An analysis is still running. Wait for it to finish before deleting your account.');
  }
}
