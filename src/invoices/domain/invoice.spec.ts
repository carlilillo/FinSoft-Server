import { createInvoice, type InvoiceDraft, type InvoiceLineDraft, validateInvoiceLines } from './invoice.js';
import { InvalidInvoiceError, InvoiceTotalsMismatchError } from './invoice.errors.js';

const spanishInvoice: InvoiceDraft = {
  invoiceNumber: ' F-2026/0042 ',
  issueDate: '2026-11-03',
  dueDate: null,
  currency: 'eur',
  subtotalCents: 100000,
  vatCents: 21000,
  withholdingCents: 15000,
  totalCents: 106000,
  paymentMethod: null,
  language: 'es',
  notes: null,
};

const line = (overrides: Partial<InvoiceLineDraft> = {}): InvoiceLineDraft => ({
  description: 'Consultoría',
  sku: null,
  unit: 'h',
  quantity: 10,
  unitPriceNetCents: 10000,
  unitPriceGrossCents: null,
  vatRate: 21,
  discountCents: null,
  lineNetCents: 100000,
  lineVatCents: 21000,
  lineGrossCents: 121000,
  ...overrides,
});

describe('createInvoice', () => {
  it('accepts subtotal + IVA - IRPF = total and normalizes number and currency', () => {
    const invoice = createInvoice(spanishInvoice);
    expect(invoice.invoiceNumber).toBe('F-2026/0042');
    expect(invoice.currency).toBe('EUR');
  });

  it('allows invoices without a number', () => {
    expect(createInvoice({ ...spanishInvoice, invoiceNumber: '  ' }).invoiceNumber).toBeNull();
  });

  it('rejects totals that do not add up', () => {
    expect(() => createInvoice({ ...spanishInvoice, totalCents: 121000 })).toThrow(InvoiceTotalsMismatchError);
  });

  it('tolerates a 2 cent rounding difference', () => {
    expect(() => createInvoice({ ...spanishInvoice, totalCents: 106002 })).not.toThrow();
  });

  it.each(['03/11/2026', '2026-02-30', '2026-13-01'])('rejects non ISO or impossible date %s', (issueDate) => {
    expect(() => createInvoice({ ...spanishInvoice, issueDate })).toThrow(InvalidInvoiceError);
  });

  it('rejects unknown currency formats', () => {
    expect(() => createInvoice({ ...spanishInvoice, currency: '€' })).toThrow(InvalidInvoiceError);
  });
});

describe('validateInvoiceLines', () => {
  const totals = { subtotalCents: 100000, vatCents: 21000, totalCents: 121000 };

  it('accepts lines whose net amounts add up to the subtotal', () => {
    expect(validateInvoiceLines(totals, [line()])).toHaveLength(1);
  });

  it('accepts a negative global discount line', () => {
    const lines = [line({ lineNetCents: 110000, unitPriceNetCents: 11000, lineVatCents: 23100, lineGrossCents: 133100 }),
      line({ description: 'Descuento', quantity: 1, unitPriceNetCents: -10000, lineNetCents: -10000, lineVatCents: -2100, lineGrossCents: -12100 })];
    expect(validateInvoiceLines(totals, lines)).toHaveLength(2);
  });

  it('rejects lines that do not sum to the subtotal', () => {
    expect(() => validateInvoiceLines(totals, [line({ lineNetCents: 90000, unitPriceNetCents: 9000, lineVatCents: 18900, lineGrossCents: 108900 })])).toThrow(
      InvoiceTotalsMismatchError,
    );
  });

  it('rejects a line whose quantity × price does not match its net amount', () => {
    expect(() => validateInvoiceLines(totals, [line({ unitPriceNetCents: 5000 })])).toThrow(/quantity × unit net price/);
  });

  it('rejects zero quantities and empty input', () => {
    expect(() => validateInvoiceLines(totals, [line({ quantity: 0 })])).toThrow(InvalidInvoiceError);
    expect(() => validateInvoiceLines(totals, [])).toThrow(InvalidInvoiceError);
  });
});
