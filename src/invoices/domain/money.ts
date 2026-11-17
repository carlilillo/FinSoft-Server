import Big from 'big.js';
import { InvalidMoneyAmountError } from './invoice.errors.js';

/**
 * Money is an exact decimal string everywhere ("1234.56", "0.00000023148148"): Postgres `numeric`, entities,
 * API payloads. Never use `+`, `-` or `<` on these strings; all arithmetic goes through the helpers below.
 */
export type Amount = string;

const DECIMAL_PATTERN = /^(-)?(\d+)(?:\.(\d+))?$/;
const MAX_FRACTION_DIGITS = 20;
const MAX_INTEGER_DIGITS = 18;

/**
 * Validates a decimal amount ("1234.56", "12.5", "-3", 0.1) and returns it in canonical form. Every printed
 * decimal is kept, trailing zeros included ("5.00" stays "5.00"), so usage-billed unit prices such as
 * "0.00000023148148" are stored exactly and the precision they were printed with is known.
 */
export function parseAmount(amount: string | number, field = 'amount'): Amount {
  const text = typeof amount === 'number' ? numberToPlainString(amount) : amount.trim();
  const match = DECIMAL_PATTERN.exec(text);
  if (!match) throw new InvalidMoneyAmountError(field, amount);

  const [, sign, rawInteger, fraction] = match;
  const integer = rawInteger.replace(/^0+(?=\d)/, '');
  if ((fraction?.length ?? 0) > MAX_FRACTION_DIGITS || integer.length > MAX_INTEGER_DIGITS) {
    throw new InvalidMoneyAmountError(field, amount);
  }
  const unsigned = fraction === undefined ? integer : `${integer}.${fraction}`;
  return sign && !new Big(unsigned).eq(0) ? `-${unsigned}` : unsigned;
}

export function parseAmountOrNull(amount: string | number | null | undefined, field?: string): Amount | null {
  if (amount === null || amount === undefined || amount === '') return null;
  return parseAmount(amount, field);
}

/** Exact sum of amounts (nulls count as zero), written with as many decimals as its most precise term. */
export function sumAmounts(amounts: Array<Amount | null>): Amount {
  let sum = new Big(0);
  let places = 0;
  for (const amount of amounts) {
    if (amount === null) continue;
    sum = sum.plus(amount);
    places = Math.max(places, decimalPlaces(amount));
  }
  return sum.toFixed(places);
}

export function compareAmounts(a: Amount, b: Amount): number {
  return new Big(a).cmp(b);
}

/** Number of decimals the currency uses (USD 2, JPY 0, KWD 3); 2 for codes Intl does not know. */
export function currencyMinorDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** `units` of the currency's smallest unit: 2 → 0.02 USD, 2 JPY, 0.002 KWD. */
export function minorUnits(currency: string, units: number): Big {
  return new Big(units).div(new Big(10).pow(currencyMinorDigits(currency)));
}

/** Number of decimals written in an amount ("0.00000023148148" → 14, "5.00" → 2, "5" → 0). */
export function decimalPlaces(amount: Amount): number {
  return amount.split('.')[1]?.length ?? 0;
}

function numberToPlainString(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  // Shortest round-trip representation, expanded out of exponent notation (1e-7 → "0.0000001").
  return new Big(value).toFixed();
}
