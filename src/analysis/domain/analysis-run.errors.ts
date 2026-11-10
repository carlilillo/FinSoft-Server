import { DomainError } from '../../common/domain/domain-error.js';
import type { RunStatus } from './analysis-run.js';

export class RunAlreadyActiveError extends DomainError {
  readonly code = 'RUN_ALREADY_ACTIVE';
  constructor(activeRunId: string) {
    super(`An analysis is already in progress (${activeRunId}). Wait for it to finish before starting another one.`);
  }
}

export class RunNotContinuableError extends DomainError {
  readonly code = 'RUN_NOT_CONTINUABLE';
  constructor(runId: string, status: RunStatus) {
    super(`Analysis ${runId} is ${status}; it can be re-run only after it finishes`);
  }
}

export class RunStillActiveError extends DomainError {
  readonly code = 'RUN_STILL_ACTIVE';
  constructor() {
    super('An analysis is still running. Wait for it to finish before deleting your account.');
  }
}
