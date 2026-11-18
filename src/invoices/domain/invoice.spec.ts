import { createInvoice, type InvoiceDraft, type InvoiceLineDraft, validateInvoiceLines } from './invoice.js';
import { InvalidInvoiceError, InvoiceTotalsMismatchError } from './invoice.errors.js';

const spanishInvoice: InvoiceDraft = {
  direction: 'received',
  invoiceNumber: ' F-2026/0042 ',
  issueDate: '2026-11-03',
  dueDate: null,
  currency: 'eur',
  subtotal: '1000.00',
  vat: '210.00',
  withholding: '150.00',
  total: '1060.00',
  paymentMethod: null,
  language: 'es',
  notes: null,
};

const line = (overrides: Partial<InvoiceLineDraft> = {}): InvoiceLineDraft => ({
  description: 'Consultoría',
  sku: null,
  unit: 'h',
  quantity: 10,
  unitPriceNet: '100.00',
  unitPriceGross: null,
  vatRate: 21,
  discount: null,
  lineNet: '1000.00',
  lineVat: '210.00',
  lineGross: '1210.00',
  ...overrides,
});

describe('createInvoice', () => {
  it('keeps the direction it was given', () => {
    expect(createInvoice({ ...spanishInvoice, direction: 'issued' }).direction).toBe('issued');
  });

  it('accepts subtotal + IVA - IRPF = total and normalizes number and currency', () => {
    const invoice = createInvoice(spanishInvoice);
    expect(invoice.invoiceNumber).toBe('F-2026/0042');
    expect(invoice.currency).toBe('EUR');
  });

  it('allows invoices without a number', () => {
    expect(createInvoice({ ...spanishInvoice, invoiceNumber: '  ' }).invoiceNumber).toBeNull();
  });

  it('rejects totals that do not add up', () => {
    expect(() => createInvoice({ ...spanishInvoice, total: '1210.00' })).toThrow(InvoiceTotalsMismatchError);
  });

  it('tolerates a 2 cent rounding difference', () => {
    expect(() => createInvoice({ ...spanishInvoice, total: '1060.02' })).not.toThrow();
    expect(() => createInvoice({ ...spanishInvoice, total: '1060.03' })).toThrow(InvoiceTotalsMismatchError);
  });

  it('measures the tolerance in the currency minor unit', () => {
    const yen = { ...spanishInvoice, currency: 'JPY', subtotal: '1000', vat: '100', withholding: null, total: '1102' };
    expect(() => createInvoice(yen)).not.toThrow();
    const dinar = { ...spanishInvoice, currency: 'KWD', subtotal: '10.000', vat: '0.500', withholding: null };
    expect(() => createInvoice({ ...dinar, total: '10.502' })).not.toThrow();
    expect(() => createInvoice({ ...dinar, total: '10.510' })).toThrow(InvoiceTotalsMismatchError);
  });

  it.each(['03/11/2026', '2026-02-30', '2026-13-01'])('rejects non ISO or impossible date %s', (issueDate) => {
    expect(() => createInvoice({ ...spanishInvoice, issueDate })).toThrow(InvalidInvoiceError);
  });

  it('rejects unknown currency formats', () => {
    expect(() => createInvoice({ ...spanishInvoice, currency: '€' })).toThrow(InvalidInvoiceError);
  });
});

describe('validateInvoiceLines', () => {
  const totals = { currency: 'EUR', subtotal: '1000.00', vat: '210.00', total: '1210.00' };

  it('accepts lines whose net amounts add up to the subtotal', () => {
    expect(validateInvoiceLines(totals, [line()])).toHaveLength(1);
  });

  it('accepts a negative global discount line', () => {
    const lines = [
      line({ lineNet: '1100.00', unitPriceNet: '110.00', lineVat: '231.00', lineGross: '1331.00' }),
      line({
        description: 'Descuento',
        quantity: 1,
        unitPriceNet: '-100.00',
        lineNet: '-100.00',
        lineVat: '-21.00',
        lineGross: '-121.00',
      }),
    ];
    expect(validateInvoiceLines(totals, lines)).toHaveLength(2);
  });

  it('rejects lines that do not sum to the subtotal', () => {
    const short = line({ lineNet: '900.00', unitPriceNet: '90.00', lineVat: '189.00', lineGross: '1089.00' });
    expect(() => validateInvoiceLines(totals, [short])).toThrow(InvoiceTotalsMismatchError);
  });

  it('rejects a line whose quantity × price does not match its net amount', () => {
    expect(() => validateInvoiceLines(totals, [line({ unitPriceNet: '50.00' })])).toThrow(/quantity × unit net price/);
  });

  it('rejects zero quantities and empty input', () => {
    expect(() => validateInvoiceLines(totals, [line({ quantity: 0 })])).toThrow(InvalidInvoiceError);
    expect(() => validateInvoiceLines(totals, [])).toThrow(InvalidInvoiceError);
  });
});

describe('validateInvoiceLines with usage-billed unit prices (Railway F7858D34-0014)', () => {
  const totals = { currency: 'USD', subtotal: '15.97', vat: '0', total: '15.97' };
  const usage = (description: string, quantity: number, unitPriceNet: string, lineNet: string): InvoiceLineDraft =>
    line({
      description,
      unit: null,
      quantity,
      unitPriceNet,
      vatRate: null,
      lineNet,
      lineVat: null,
      lineGross: lineNet,
    });
  const railway = [
    usage('Disk (per GB / min)', 23067, '0.00000347222221', '0.08'),
    usage('Network', 146, '0.00005', '0.01'),
    usage('vCPU (per vCPU / min)', 32746, '0.00000462962962', '0.15'),
    usage('Memory (per MB / min)', 46372992, '0.00000023148148', '10.73'),
    usage('Hobby plan', 1, '5.00', '5.00'),
  ];

  it('keeps every decimal of sub-cent unit prices', () => {
    const saved = validateInvoiceLines(totals, railway);
    expect(saved.map((saved) => saved.unitPriceNet)).toEqual([
      '0.00000347222221',
      '0.00005',
      '0.00000462962962',
      '0.00000023148148',
      '5.00',
    ]);
  });

  it('rejects a unit price rounded to cents on a huge quantity', () => {
    const rounded = railway.map((usageLine) =>
      usageLine.description.startsWith('Memory') ? { ...usageLine, unitPriceNet: '0.00' } : usageLine,
    );
    expect(() => validateInvoiceLines(totals, rounded)).toThrow(/unit net price is 0/);
  });

  it('rejects a precise unit price that does not match the line amount', () => {
    const wrong = railway.map((usageLine) =>
      usageLine.description.startsWith('Memory') ? { ...usageLine, unitPriceNet: '0.00000013148148' } : usageLine,
    );
    expect(() => validateInvoiceLines(totals, wrong)).toThrow(/quantity × unit net price/);
  });
});
