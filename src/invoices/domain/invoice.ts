import { InvalidInvoiceError, InvoiceTotalsMismatchError } from './invoice.errors.js';

export type InvoiceLanguage = 'en' | 'es' | 'other';

export interface InvoiceDraft {
  invoiceNumber: string | null;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  subtotalCents: number;
  vatCents: number;
  withholdingCents: number | null;
  totalCents: number;
  paymentMethod: string | null;
  language: InvoiceLanguage;
  notes: string | null;
}

export interface InvoiceLineDraft {
  description: string;
  sku: string | null;
  unit: string | null;
  quantity: number;
  unitPriceNetCents: number;
  unitPriceGrossCents: number | null;
  vatRate: number | null;
  discountCents: number | null;
  lineNetCents: number;
  lineVatCents: number | null;
  lineGrossCents: number;
}

export interface InvoiceTotals {
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;
const TOTALS_TOLERANCE_CENTS = 2;

/** Validates an extracted invoice header and returns the normalized draft. */
export function createInvoice(draft: InvoiceDraft): InvoiceDraft {
  const invoiceNumber = draft.invoiceNumber?.trim() || null;
  if (!isValidIsoDate(draft.issueDate)) {
    throw new InvalidInvoiceError(`issueDate must be an ISO date (YYYY-MM-DD), got "${draft.issueDate}"`);
  }
  if (draft.dueDate !== null && !isValidIsoDate(draft.dueDate)) {
    throw new InvalidInvoiceError(`dueDate must be an ISO date (YYYY-MM-DD) or null, got "${draft.dueDate}"`);
  }
  const currency = draft.currency.trim().toUpperCase();
  if (!CURRENCY.test(currency)) {
    throw new InvalidInvoiceError(`currency must be an ISO 4217 code such as EUR or USD, got "${draft.currency}"`);
  }

  const withholding = draft.withholdingCents ?? 0;
  const expectedTotal = draft.subtotalCents + draft.vatCents - withholding;
  if (Math.abs(expectedTotal - draft.totalCents) > TOTALS_TOLERANCE_CENTS) {
    throw new InvoiceTotalsMismatchError(
      `subtotal (${draft.subtotalCents}) + VAT (${draft.vatCents}) - withholding (${withholding}) = ${expectedTotal} cents, ` +
        `but total is ${draft.totalCents} cents. Re-read the totals block: include any surcharge (recargo de equivalencia) in VAT ` +
        'and report IRPF as withholding.',
    );
  }

  return { ...draft, invoiceNumber, currency };
}

/** Validates the line items against themselves and against the invoice subtotal. */
export function validateInvoiceLines(totals: InvoiceTotals, lines: InvoiceLineDraft[]): InvoiceLineDraft[] {
  if (lines.length === 0) throw new InvalidInvoiceError('An invoice needs at least one line item');

  lines.forEach((line, index) => validateLine(line, index));

  const linesNet = lines.reduce((sum, line) => sum + line.lineNetCents, 0);
  const tolerance = Math.max(TOTALS_TOLERANCE_CENTS, lines.length);
  if (Math.abs(linesNet - totals.subtotalCents) > tolerance) {
    throw new InvoiceTotalsMismatchError(
      `Line net amounts add up to ${linesNet} cents but the invoice subtotal is ${totals.subtotalCents} cents. ` +
        'Add missing lines (shipping, fees) or a negative line for a global discount.',
    );
  }
  return lines.map((line) => ({ ...line, description: line.description.trim() }));
}

function validateLine(line: InvoiceLineDraft, index: number): void {
  const label = `Line ${index + 1} ("${line.description}")`;
  if (!line.description.trim()) throw new InvalidInvoiceError(`Line ${index + 1} has an empty description`);
  if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
    throw new InvalidInvoiceError(`${label}: quantity must be greater than 0 (use negative prices for credits)`);
  }
  if (line.vatRate !== null && (line.vatRate < 0 || line.vatRate > 100)) {
    throw new InvalidInvoiceError(`${label}: vatRate must be a percentage between 0 and 100`);
  }

  const expectedNet = Math.round(line.quantity * line.unitPriceNetCents) - (line.discountCents ?? 0);
  const netTolerance = Math.ceil(Math.abs(line.quantity) * 0.5) + 1;
  if (Math.abs(expectedNet - line.lineNetCents) > netTolerance) {
    throw new InvoiceTotalsMismatchError(
      `${label}: quantity × unit net price - discount = ${expectedNet} cents, but line net is ${line.lineNetCents} cents`,
    );
  }

  if (line.lineVatCents !== null && Math.abs(line.lineNetCents + line.lineVatCents - line.lineGrossCents) > 1) {
    throw new InvoiceTotalsMismatchError(
      `${label}: line net (${line.lineNetCents}) + line VAT (${line.lineVatCents}) must equal line gross (${line.lineGrossCents})`,
    );
  }
}

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
