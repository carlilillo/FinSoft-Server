import { DomainError } from '../../common/domain/domain-error.js';

export class InvalidWorkspacePathError extends DomainError {
  readonly code = 'INVALID_WORKSPACE_PATH';
  constructor(path: string) {
    super(`${path} is not inside /inbox/{emailId}/. Use the paths listed in email.md.`);
  }
}

export class EmailNotInRunError extends DomainError {
  readonly code = 'EMAIL_NOT_IN_RUN';
  constructor(emailId: string) {
    super(`Email ${emailId} is not part of this analysis. Use the email ids under /inbox/.`);
  }
}
