import Big from 'big.js';
import { InvalidInvoiceError, InvoiceTotalsMismatchError } from './invoice.errors.js';
import type { InvoiceDirection } from './invoice-direction.js';
import { type Amount, decimalPlaces, minorUnits, sumAmounts } from './money.js';

export type InvoiceLanguage = 'en' | 'es' | 'other';

export interface InvoiceDraft {
  /** Set by the server from the session the invoice belongs to, never by the extraction model. */
  direction: InvoiceDirection;
  invoiceNumber: string | null;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  subtotal: Amount;
  vat: Amount;
  withholding: Amount | null;
  total: Amount;
  paymentMethod: string | null;
  language: InvoiceLanguage;
  notes: string | null;
}

export interface InvoiceLineDraft {
  description: string;
  sku: string | null;
  unit: string | null;
  quantity: number;
  /** Exactly as printed, with every decimal (usage rates such as "0.00000023148148" included). */
  unitPriceNet: Amount;
  unitPriceGross: Amount | null;
  vatRate: number | null;
  discount: Amount | null;
  lineNet: Amount;
  lineVat: Amount | null;
  lineGross: Amount;
}

export interface InvoiceTotals {
  currency: string;
  subtotal: Amount;
  vat: Amount;
  total: Amount;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;
/** Rounding slack, in the currency's smallest unit (cents for EUR/USD, yen for JPY). */
const TOTALS_TOLERANCE_UNITS = 2;

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

  const withholding = draft.withholding ?? '0';
  const expectedTotal = new Big(draft.subtotal).plus(draft.vat).minus(withholding);
  if (expectedTotal.minus(draft.total).abs().gt(minorUnits(currency, TOTALS_TOLERANCE_UNITS))) {
    throw new InvoiceTotalsMismatchError(
      `subtotal (${draft.subtotal}) + VAT (${draft.vat}) - withholding (${withholding}) = ${expectedTotal.toFixed()}, ` +
        `but total is ${draft.total}. Re-read the totals block: include any surcharge (recargo de equivalencia) in VAT ` +
        'and report IRPF as withholding.',
    );
  }

  return { ...draft, invoiceNumber, currency };
}

/** Validates the line items against themselves and against the invoice subtotal. */
export function validateInvoiceLines(totals: InvoiceTotals, lines: InvoiceLineDraft[]): InvoiceLineDraft[] {
  if (lines.length === 0) throw new InvalidInvoiceError('An invoice needs at least one line item');

  lines.forEach((line, index) => validateLine(line, index, totals.currency));

  const linesNet = sumAmounts(lines.map((line) => line.lineNet));
  const tolerance = minorUnits(totals.currency, Math.max(TOTALS_TOLERANCE_UNITS, lines.length));
  if (new Big(linesNet).minus(totals.subtotal).abs().gt(tolerance)) {
    throw new InvoiceTotalsMismatchError(
      `Line net amounts add up to ${linesNet} but the invoice subtotal is ${totals.subtotal}. ` +
        'Add missing lines (shipping, fees) or a negative line for a global discount.',
    );
  }
  return lines.map((line) => ({ ...line, description: line.description.trim() }));
}

function validateLine(line: InvoiceLineDraft, index: number, currency: string): void {
  const label = `Line ${index + 1} ("${line.description}")`;
  if (!line.description.trim()) throw new InvalidInvoiceError(`Line ${index + 1} has an empty description`);
  if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
    throw new InvalidInvoiceError(`${label}: quantity must be greater than 0 (use negative prices for credits)`);
  }
  if (line.vatRate !== null && (line.vatRate < 0 || line.vatRate > 100)) {
    throw new InvalidInvoiceError(`${label}: vatRate must be a percentage between 0 and 100`);
  }

  // A rounded tiny rate ("0.00" for 0.00000023148148/MB-min) still fits the line within its own precision,
  // so this is the one rounding the arithmetic below cannot catch on its own.
  if (
    new Big(line.unitPriceNet).eq(0) &&
    line.discount === null &&
    new Big(line.lineNet).abs().gt(minorUnits(currency, 1))
  ) {
    throw new InvoiceTotalsMismatchError(
      `${label}: unit net price is 0 but line net is ${line.lineNet}. ` +
        'Copy the unit price with all its printed decimals (e.g. "0.00000023148148"); never round it.',
    );
  }

  const quantity = new Big(line.quantity);
  const expectedNet = quantity.times(line.unitPriceNet).minus(line.discount ?? '0');
  // The printed unit price is itself rounded to its last decimal: allow that error on every unit, plus one
  // minor unit for rounding the line. A precise rate (0.00000023148148) keeps the check tight on huge quantities.
  const unitPriceRounding = new Big(`5e-${decimalPlaces(line.unitPriceNet) + 1}`);
  const netTolerance = quantity.abs().times(unitPriceRounding).plus(minorUnits(currency, 1));
  if (expectedNet.minus(line.lineNet).abs().gt(netTolerance)) {
    throw new InvoiceTotalsMismatchError(
      `${label}: quantity × unit net price - discount = ${expectedNet.toFixed()}, but line net is ${line.lineNet}. ` +
        'Copy the unit price with all its printed decimals.',
    );
  }

  if (
    line.lineVat !== null &&
    new Big(line.lineNet).plus(line.lineVat).minus(line.lineGross).abs().gt(minorUnits(currency, 1))
  ) {
    throw new InvoiceTotalsMismatchError(
      `${label}: line net (${line.lineNet}) + line VAT (${line.lineVat}) must equal line gross (${line.lineGross})`,
    );
  }
}

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
