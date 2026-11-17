import { type Amount, compareAmounts, sumAmounts } from '../../invoices/domain/money.js';

export interface SessionInvoice {
  currency: string;
  subtotal: Amount;
  vat: Amount;
  withholding: Amount | null;
  total: Amount;
}

export interface CurrencyTotals {
  currency: string;
  invoiceCount: number;
  net: Amount;
  vat: Amount;
  withholding: Amount;
  gross: Amount;
}

/** Expense totals of one extraction session, per currency (never summed across currencies). */
export function summarizeSession(invoices: SessionInvoice[]): CurrencyTotals[] {
  const byCurrency = new Map<string, SessionInvoice[]>();
  for (const invoice of invoices) {
    byCurrency.set(invoice.currency, [...(byCurrency.get(invoice.currency) ?? []), invoice]);
  }
  const totals = [...byCurrency].map(([currency, group]): CurrencyTotals => ({
    currency,
    invoiceCount: group.length,
    net: sumAmounts(group.map((invoice) => invoice.subtotal)),
    vat: sumAmounts(group.map((invoice) => invoice.vat)),
    withholding: sumAmounts(group.map((invoice) => invoice.withholding)),
    gross: sumAmounts(group.map((invoice) => invoice.total)),
  }));
  return totals.sort((a, b) => compareAmounts(b.gross, a.gross));
}
