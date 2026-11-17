import {
  compareAmounts,
  currencyMinorDigits,
  decimalPlaces,
  minorUnits,
  parseAmount,
  parseAmountOrNull,
  sumAmounts,
} from './money.js';
import { InvalidMoneyAmountError } from './invoice.errors.js';

describe('parseAmount', () => {
  it.each([
    ['12.34', '12.34'],
    ['5.00', '5.00'],
    ['007', '7'],
    [' -15.00 ', '-15.00'],
    ['-0.00', '0.00'],
    ['0.00000023148148', '0.00000023148148'],
  ])('keeps %s exactly as %s', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it('expands numbers without exponent notation', () => {
    expect(parseAmount(19.99)).toBe('19.99');
    expect(parseAmount(1e-7)).toBe('0.0000001');
  });

  it.each(['1.234,56', '€12', '12,50', 'abc', '', '1e3', '.5', '1.'])(
    'rejects locale or invalid format %s',
    (input) => {
      expect(() => parseAmount(input)).toThrow(InvalidMoneyAmountError);
    },
  );

  it('rejects more than 20 decimals or absurdly large amounts', () => {
    expect(() => parseAmount(`0.${'1'.repeat(21)}`)).toThrow(InvalidMoneyAmountError);
    expect(() => parseAmount('1'.repeat(19))).toThrow(InvalidMoneyAmountError);
  });

  it('treats empty optional values as null', () => {
    expect(parseAmountOrNull(null)).toBeNull();
    expect(parseAmountOrNull('')).toBeNull();
    expect(parseAmountOrNull('3.10')).toBe('3.10');
  });
});

describe('amount arithmetic', () => {
  it('sums exactly, keeping the widest scale', () => {
    expect(sumAmounts(['0.10', '0.20'])).toBe('0.30');
    expect(sumAmounts(['10.5', '2.20', null])).toBe('12.70');
    expect(sumAmounts(['0.00000023148148', '1'])).toBe('1.00000023148148');
    expect(sumAmounts([])).toBe('0');
  });

  it('compares numerically, not lexically', () => {
    expect(compareAmounts('9.00', '10.00')).toBe(-1);
    expect(compareAmounts('5', '5.00')).toBe(0);
  });

  it('knows each currency minor unit', () => {
    expect(currencyMinorDigits('EUR')).toBe(2);
    expect(currencyMinorDigits('JPY')).toBe(0);
    expect(currencyMinorDigits('KWD')).toBe(3);
    expect(minorUnits('USD', 2).toFixed()).toBe('0.02');
    expect(minorUnits('JPY', 2).toFixed()).toBe('2');
    expect(minorUnits('KWD', 1).toFixed()).toBe('0.001');
  });

  it('counts printed decimals', () => {
    expect(decimalPlaces('0.00000023148148')).toBe(14);
    expect(decimalPlaces('5.00')).toBe(2);
    expect(decimalPlaces('5')).toBe(0);
  });
});
