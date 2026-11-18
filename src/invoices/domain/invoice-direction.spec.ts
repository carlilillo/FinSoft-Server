import { INVOICE_DIRECTIONS, isInvoiceDirection } from './invoice-direction.js';

describe('isInvoiceDirection', () => {
  it('accepts both directions', () => {
    for (const direction of INVOICE_DIRECTIONS) expect(isInvoiceDirection(direction)).toBe(true);
  });

  it('rejects anything else', () => {
    for (const value of ['all', 'ISSUED', '', null, undefined, 1]) expect(isInvoiceDirection(value)).toBe(false);
  });
});
