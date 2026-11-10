import { DomainError } from '../../common/domain/domain-error.js';

export class InvalidMoneyAmountError extends DomainError {
  readonly code = 'INVALID_MONEY_AMOUNT';
  constructor(field: string, value: unknown) {
    super(
      `${field} must be a decimal number written with "." as decimal separator and no thousands separator (e.g. "1234.56"), got ${JSON.stringify(value)}`,
    );
  }
}

export class InvalidInvoiceError extends DomainError {
  readonly code = 'INVALID_INVOICE';
}

export class InvoiceTotalsMismatchError extends DomainError {
  readonly code = 'INVOICE_TOTALS_MISMATCH';
}
