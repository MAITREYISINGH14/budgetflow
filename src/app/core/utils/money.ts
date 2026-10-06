export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP';

export const CURRENCIES: readonly { code: CurrencyCode; label: string; locale: string }[] = [
  { code: 'INR', label: 'Indian rupee (₹)', locale: 'en-IN' },
  { code: 'USD', label: 'US dollar ($)', locale: 'en-US' },
  { code: 'EUR', label: 'Euro (€)', locale: 'en-IE' },
  { code: 'GBP', label: 'British pound (£)', locale: 'en-GB' },
];

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: CurrencyCode, digits: number, compact: boolean): Intl.NumberFormat {
  const key = `${currency}|${digits}|${compact}`;
  let cached = formatters.get(key);
  if (!cached) {
    const locale = CURRENCIES.find((c) => c.code === currency)?.locale ?? 'en-IN';
    cached = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      notation: compact ? 'compact' : 'standard',
      minimumFractionDigits: compact ? 0 : digits,
      maximumFractionDigits: compact ? 1 : digits,
    });
    formatters.set(key, cached);
  }
  return cached;
}

/**
 * Locale-aware currency formatting. INR uses Indian digit grouping (₹1,25,000).
 * Whole amounts show no decimals; anything with paise shows two.
 */
export function formatMoney(
  value: number,
  currency: CurrencyCode = 'INR',
  options: { compact?: boolean } = {},
): string {
  if (!Number.isFinite(value)) return formatter(currency, 0, false).format(0);
  const digits = Number.isInteger(value) ? 0 : 2;
  return formatter(currency, digits, options.compact ?? false).format(value);
}

/**
 * The frontend never does money maths on floats. When it must add amounts
 * (e.g. totals across budget cards) it works in integer paise.
 */
export function toPaise(value: number): number {
  return Math.round(value * 100);
}

export function sumAmounts(values: number[]): number {
  return values.reduce((total, value) => total + toPaise(value), 0) / 100;
}

/** "₹", "$", "€"… for input prefixes. */
export function currencySymbol(currency: CurrencyCode): string {
  const locale = CURRENCIES.find((c) => c.code === currency)?.locale ?? 'en-IN';
  const part = new Intl.NumberFormat(locale, { style: 'currency', currency })
    .formatToParts(0)
    .find((p) => p.type === 'currency');
  return part?.value ?? currency;
}
