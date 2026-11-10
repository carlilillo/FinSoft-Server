export interface SessionInvoice {
  currency: string;
  subtotalCents: number;
  vatCents: number;
  withholdingCents: number | null;
  totalCents: number;
}

export interface CurrencyTotals {
  currency: string;
  invoiceCount: number;
  netCents: number;
  vatCents: number;
  withholdingCents: number;
  grossCents: number;
}

/** Expense totals of one extraction session, per currency (never summed across currencies). */
export function summarizeSession(invoices: SessionInvoice[]): CurrencyTotals[] {
  const totals = new Map<string, CurrencyTotals>();
  for (const invoice of invoices) {
    const entry = totals.get(invoice.currency) ?? {
      currency: invoice.currency,
      invoiceCount: 0,
      netCents: 0,
      vatCents: 0,
      withholdingCents: 0,
      grossCents: 0,
    };
    entry.invoiceCount += 1;
    entry.netCents += invoice.subtotalCents;
    entry.vatCents += invoice.vatCents;
    entry.withholdingCents += invoice.withholdingCents ?? 0;
    entry.grossCents += invoice.totalCents;
    totals.set(invoice.currency, entry);
  }
  return [...totals.values()].sort((a, b) => b.grossCents - a.grossCents);
}
