import { addDays, computeCashFlow } from './cash-flow.js';

describe('computeCashFlow', () => {
  const today = '2026-11-09';

  it('returns an empty series for a window without invoices', () => {
    const series = computeCashFlow([], '7d', today);
    expect(series.from).toBe('2026-11-03');
    expect(series.to).toBe(today);
    expect(series.currencies).toEqual([]);
  });

  it('buckets received invoices per day and currency and tracks the previous window', () => {
    const series = computeCashFlow(
      [
        { direction: 'received', issueDate: '2026-11-09', currency: 'EUR', total: '10.00' },
        { direction: 'received', issueDate: '2026-11-09', currency: 'EUR', total: '5.00' },
        { direction: 'received', issueDate: '2026-11-04', currency: 'EUR', total: '25.00' },
        { direction: 'received', issueDate: '2026-10-30', currency: 'EUR', total: '70.00' },
        { direction: 'received', issueDate: '2026-11-05', currency: 'USD', total: '3.00' },
        { direction: 'received', issueDate: '2026-09-01', currency: 'EUR', total: '999.99' },
      ],
      '7d',
      today,
    );
    const [eur, usd] = series.currencies;
    expect(eur?.currency).toBe('EUR');
    expect(eur?.days).toHaveLength(7);
    expect(eur?.received).toEqual({ total: '40.00', previousTotal: '70.00', invoiceCount: 3 });
    expect(eur?.issued).toEqual({ total: '0', previousTotal: '0', invoiceCount: 0 });
    expect(eur?.days.at(-1)).toEqual({ date: today, issued: '0', received: '15.00' });
    expect(eur?.days.at(-2)).toEqual({ date: '2026-11-08', issued: '0', received: '0' });
    expect(usd?.received.total).toBe('3.00');
  });

  it('keeps issued and received invoices apart, never netting them', () => {
    const [eur] = computeCashFlow(
      [
        { direction: 'issued', issueDate: today, currency: 'EUR', total: '1210.00' },
        { direction: 'received', issueDate: today, currency: 'EUR', total: '80.50' },
        { direction: 'issued', issueDate: '2026-10-31', currency: 'EUR', total: '500.00' },
      ],
      '7d',
      today,
    ).currencies;
    expect(eur?.issued).toEqual({ total: '1210.00', previousTotal: '500.00', invoiceCount: 1 });
    expect(eur?.received).toEqual({ total: '80.50', previousTotal: '0', invoiceCount: 1 });
    expect(eur?.days.at(-1)).toEqual({ date: today, issued: '1210.00', received: '80.50' });
  });

  it('puts the currency with the most activity, in either direction, first', () => {
    const series = computeCashFlow(
      [
        { direction: 'received', issueDate: today, currency: 'EUR', total: '100.00' },
        { direction: 'issued', issueDate: today, currency: 'USD', total: '90.00' },
        { direction: 'received', issueDate: today, currency: 'USD', total: '20.00' },
      ],
      '7d',
      today,
    );
    expect(series.currencies.map((entry) => entry.currency)).toEqual(['USD', 'EUR']);
  });

  it('spans 30 days for the month range', () => {
    const series = computeCashFlow(
      [{ direction: 'issued', issueDate: today, currency: 'EUR', total: '0.01' }],
      '30d',
      today,
    );
    expect(series.currencies[0]?.days).toHaveLength(30);
  });

  it('adds days across month boundaries', () => {
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
  });
});
