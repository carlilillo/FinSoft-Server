export type SpendRange = '7d' | '14d' | '30d';

export const SPEND_RANGE_DAYS: Record<SpendRange, number> = { '7d': 7, '14d': 14, '30d': 30 };

export interface SpendInvoice {
  issueDate: string;
  currency: string;
  totalCents: number;
}

export interface SpendDay {
  date: string;
  totalCents: number;
}

export interface CurrencySpend {
  currency: string;
  totalCents: number;
  previousTotalCents: number;
  invoiceCount: number;
  days: SpendDay[];
}

export interface SpendSeries {
  range: SpendRange;
  from: string;
  to: string;
  currencies: CurrencySpend[];
}

/** Window [from, to] inclusive, ending today, plus the previous window of equal length. */
export function spendWindow(range: SpendRange, today: string): { from: string; to: string; previousFrom: string } {
  const days = SPEND_RANGE_DAYS[range];
  return { from: addDays(today, -(days - 1)), to: today, previousFrom: addDays(today, -(2 * days - 1)) };
}

/**
 * Buckets invoice totals per day and currency over the window. Days without
 * invoices are present with 0 so charts render a continuous axis.
 * Currencies are sorted by spend, the first one being the dashboard's primary.
 */
export function computeSpendSeries(invoices: SpendInvoice[], range: SpendRange, today: string): SpendSeries {
  const { from, to, previousFrom } = spendWindow(range, today);
  const dates = enumerateDays(from, to);
  const byCurrency = new Map<string, CurrencySpend>();

  for (const invoice of invoices) {
    if (invoice.issueDate < previousFrom || invoice.issueDate > to) continue;
    const entry = byCurrency.get(invoice.currency) ?? createCurrencySpend(invoice.currency, dates);
    byCurrency.set(invoice.currency, entry);

    if (invoice.issueDate < from) {
      entry.previousTotalCents += invoice.totalCents;
      continue;
    }
    const day = entry.days.find((bucket) => bucket.date === invoice.issueDate);
    if (day) day.totalCents += invoice.totalCents;
    entry.totalCents += invoice.totalCents;
    entry.invoiceCount += 1;
  }

  const currencies = [...byCurrency.values()].sort((a, b) => b.totalCents - a.totalCents);
  return { range, from, to, currencies };
}

function createCurrencySpend(currency: string, dates: string[]): CurrencySpend {
  return {
    currency,
    totalCents: 0,
    previousTotalCents: 0,
    invoiceCount: 0,
    days: dates.map((date) => ({ date, totalCents: 0 })),
  };
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function enumerateDays(from: string, to: string): string[] {
  const result: string[] = [];
  for (let current = from; current <= to; current = addDays(current, 1)) result.push(current);
  return result;
}
