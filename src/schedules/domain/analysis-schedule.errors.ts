import { DomainError } from '../../common/domain/domain-error.js';

export class InvalidScheduleError extends DomainError {
  readonly code = 'INVALID_SCHEDULE';
}
