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
        { issueDate: '2026-11-09', currency: 'EUR', total: '10.00' },
        { issueDate: '2026-11-09', currency: 'EUR', total: '5.00' },
        { issueDate: '2026-11-04', currency: 'EUR', total: '25.00' },
        { issueDate: '2026-10-30', currency: 'EUR', total: '70.00' },
        { issueDate: '2026-11-05', currency: 'USD', total: '3.00' },
        { issueDate: '2026-09-01', currency: 'EUR', total: '999.99' },
      ],
      '7d',
      today,
    );
    const [eur, usd] = series.currencies;
    expect(eur?.currency).toBe('EUR');
    expect(eur?.days).toHaveLength(7);
    expect(eur?.total).toBe('40.00');
    expect(eur?.invoiceCount).toBe(3);
    expect(eur?.previousTotal).toBe('70.00');
    expect(eur?.days.at(-1)).toEqual({ date: today, total: '15.00' });
    expect(eur?.days.at(-2)).toEqual({ date: '2026-11-08', total: '0' });
    expect(usd?.total).toBe('3.00');
  });

  it('spans 30 days for the month range', () => {
    expect(
      computeSpendSeries([{ issueDate: today, currency: 'EUR', total: '0.01' }], '30d', today).currencies[0]?.days,
    ).toHaveLength(30);
  });

  it('adds days across month boundaries', () => {
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
  });
});
