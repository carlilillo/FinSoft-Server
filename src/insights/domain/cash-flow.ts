import type { InvoiceDirection } from '../../invoices/domain/invoice-direction.js';
import { type Amount, compareAmounts, sumAmounts } from '../../invoices/domain/money.js';

export type CashFlowRange = '7d' | '14d' | '30d';

export const CASH_FLOW_RANGE_DAYS: Record<CashFlowRange, number> = { '7d': 7, '14d': 14, '30d': 30 };

export interface CashFlowInvoice {
  direction: InvoiceDirection;
  issueDate: string;
  currency: string;
  total: Amount;
}

/** One direction's figures over the window: what the user invoiced (issued) or spent (received). */
export interface DirectionTotals {
  total: Amount;
  previousTotal: Amount;
  invoiceCount: number;
}

/** Both amounts are positive: the client decides how to sign them (income up, spend down). */
export interface CashFlowDay {
  date: string;
  issued: Amount;
  received: Amount;
}

export interface CurrencyCashFlow {
  currency: string;
  issued: DirectionTotals;
  received: DirectionTotals;
  days: CashFlowDay[];
}

export interface CashFlowSeries {
  range: CashFlowRange;
  from: string;
  to: string;
  currencies: CurrencyCashFlow[];
}

/** Window [from, to] inclusive, ending today, plus the previous window of equal length. */
export function cashFlowWindow(
  range: CashFlowRange,
  today: string,
): { from: string; to: string; previousFrom: string } {
  const days = CASH_FLOW_RANGE_DAYS[range];
  return { from: addDays(today, -(days - 1)), to: today, previousFrom: addDays(today, -(2 * days - 1)) };
}

/**
 * Buckets invoice totals per day, currency and direction over the window: invoices the user issued (income) and
 * invoices the user received (spend) are kept apart and never netted here. Days without invoices are present with 0
 * so charts render a continuous axis. Currencies are sorted by activity (issued + received), the first one being the
 * dashboard's primary; amounts are never summed across currencies.
 */
export function computeCashFlow(invoices: CashFlowInvoice[], range: CashFlowRange, today: string): CashFlowSeries {
  const { from, to, previousFrom } = cashFlowWindow(range, today);
  const dates = enumerateDays(from, to);
  const byCurrency = new Map<string, CurrencyCashFlow>();

  for (const invoice of invoices) {
    if (invoice.issueDate < previousFrom || invoice.issueDate > to) continue;
    const entry = byCurrency.get(invoice.currency) ?? createCurrencyCashFlow(invoice.currency, dates);
    byCurrency.set(invoice.currency, entry);
    const totals = entry[invoice.direction];

    if (invoice.issueDate < from) {
      totals.previousTotal = sumAmounts([totals.previousTotal, invoice.total]);
      continue;
    }
    const day = entry.days.find((bucket) => bucket.date === invoice.issueDate);
    if (day) day[invoice.direction] = sumAmounts([day[invoice.direction], invoice.total]);
    totals.total = sumAmounts([totals.total, invoice.total]);
    totals.invoiceCount += 1;
  }

  const currencies = [...byCurrency.values()].sort((a, b) => compareAmounts(activity(b), activity(a)));
  return { range, from, to, currencies };
}

function activity(entry: CurrencyCashFlow): Amount {
  return sumAmounts([entry.issued.total, entry.received.total]);
}

function createCurrencyCashFlow(currency: string, dates: string[]): CurrencyCashFlow {
  const empty = (): DirectionTotals => ({ total: '0', previousTotal: '0', invoiceCount: 0 });
  return {
    currency,
    issued: empty(),
    received: empty(),
    days: dates.map((date) => ({ date, issued: '0', received: '0' })),
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
