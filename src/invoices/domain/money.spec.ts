import { fromCents, toCents, toCentsOrNull } from './money.js';
import { InvalidMoneyAmountError } from './invoice.errors.js';

describe('toCents', () => {
  it.each([
    ['12.34', 1234],
    ['0.29', 29],
    ['1234.5', 123450],
    ['7', 700],
    ['-15.00', -1500],
    ['0.005', 1],
    ['2.675', 268],
    ['-0.004', 0],
  ])('converts %s to %d cents', (input, expected) => {
    expect(toCents(input)).toBe(expected);
  });

  it('accepts numbers without float drift', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(19.99)).toBe(1999);
  });

  it.each(['1.234,56', '€12', '12,50', 'abc', '', '1e3'])('rejects locale or invalid format %s', (input) => {
    expect(() => toCents(input)).toThrow(InvalidMoneyAmountError);
  });

  it('treats empty optional values as null', () => {
    expect(toCentsOrNull(null)).toBeNull();
    expect(toCentsOrNull('')).toBeNull();
    expect(toCentsOrNull('3.10')).toBe(310);
  });

  it('formats cents back to a decimal string', () => {
    expect(fromCents(123456)).toBe('1234.56');
    expect(fromCents(-5)).toBe('-0.05');
  });
});
