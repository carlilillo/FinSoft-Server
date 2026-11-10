import { InvalidMoneyAmountError } from './invoice.errors.js';

const DECIMAL_PATTERN = /^(-)?(\d+)(?:\.(\d+))?$/;

/**
 * Converts a decimal amount ("1234.56", "12.5", "-3", 0.1) to integer cents (×100).
 * Parsing is done on the decimal string, never with float multiplication, so
 * "0.29" becomes 29 and not 28.999…. Extra decimals are rounded half away from zero.
 */
export function toCents(amount: string | number, field = 'amount'): number {
  const text = typeof amount === 'number' ? numberToPlainString(amount) : amount.trim();
  const match = DECIMAL_PATTERN.exec(text);
  if (!match) throw new InvalidMoneyAmountError(field, amount);

  const [, sign, integerPart = '0', fraction = ''] = match;
  const paddedFraction = fraction.padEnd(3, '0');
  let cents = Number(integerPart) * 100 + Number(paddedFraction.slice(0, 2));
  if (Number(paddedFraction[2]) >= 5) cents += 1;
  if (!Number.isSafeInteger(cents)) throw new InvalidMoneyAmountError(field, amount);
  return sign && cents !== 0 ? -cents : cents;
}

export function toCentsOrNull(amount: string | number | null | undefined, field?: string): number | null {
  if (amount === null || amount === undefined || amount === '') return null;
  return toCents(amount, field);
}

export function fromCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  return `${sign}${Math.trunc(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

function numberToPlainString(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  // toFixed avoids exponent notation; 6 decimals is far beyond cent precision.
  return value.toFixed(6).replace(/\.?0+$/, '');
}
