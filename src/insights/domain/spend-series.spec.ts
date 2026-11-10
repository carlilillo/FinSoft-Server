import { addDays, computeSpendSeries } from './spend-series.js';

describe('computeSpendSeries', () => {
  const today = '2026-11-09';

  it('returns one bucket per day, zero-filled, for the 7 day window', () => {
    const series = computeSpendSeries([], '7d', today);
    expect(series.from).toBe('2026-11-03');
    expect(series.to).toBe(today);
    expect(series.currencies).toEqual([]);
  });

  it('buckets per day and currency and tracks the previous window', () => {
    const series = computeSpendSeries(
      [
        { issueDate: '2026-11-09', currency: 'EUR', totalCents: 1000 },
        { issueDate: '2026-11-09', currency: 'EUR', totalCents: 500 },
        { issueDate: '2026-11-04', currency: 'EUR', totalCents: 2500 },
        { issueDate: '2026-10-30', currency: 'EUR', totalCents: 7000 },
        { issueDate: '2026-11-05', currency: 'USD', totalCents: 300 },
        { issueDate: '2026-09-01', currency: 'EUR', totalCents: 99999 },
      ],
      '7d',
      today,
    );
    const [eur, usd] = series.currencies;
    expect(eur?.currency).toBe('EUR');
    expect(eur?.days).toHaveLength(7);
    expect(eur?.totalCents).toBe(4000);
    expect(eur?.invoiceCount).toBe(3);
    expect(eur?.previousTotalCents).toBe(7000);
    expect(eur?.days.at(-1)).toEqual({ date: today, totalCents: 1500 });
    expect(usd?.totalCents).toBe(300);
  });

  it('spans 30 days for the month range', () => {
    expect(computeSpendSeries([{ issueDate: today, currency: 'EUR', totalCents: 1 }], '30d', today).currencies[0]?.days).toHaveLength(30);
  });

  it('adds days across month boundaries', () => {
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
  });
});
