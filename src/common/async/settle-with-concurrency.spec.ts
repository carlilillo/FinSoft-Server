import { settleWithConcurrency } from './settle-with-concurrency.js';

describe('settleWithConcurrency', () => {
  it('keeps input order and isolates failures', async () => {
    const results = await settleWithConcurrency([1, 2, 3], 2, async (value) => {
      if (value === 2) throw new Error('boom');
      return value * 10;
    });
    expect(results).toEqual([
      { status: 'fulfilled', value: 10 },
      { status: 'rejected', reason: new Error('boom') },
      { status: 'fulfilled', value: 30 },
    ]);
  });

  it('never runs more than `limit` items at once', async () => {
    let inFlight = 0;
    let peak = 0;
    await settleWithConcurrency(Array.from({ length: 7 }, (_, index) => index), 3, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
    });
    expect(peak).toBe(3);
  });

  it('handles an empty list', async () => {
    expect(await settleWithConcurrency([], 3, async () => 1)).toEqual([]);
  });
});
