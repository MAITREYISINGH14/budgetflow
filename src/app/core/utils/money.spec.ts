import { currencySymbol, formatMoney, sumAmounts } from './money';

describe('money helpers', () => {
  it('uses Indian digit grouping for INR', () => {
    expect(formatMoney(1250)).toBe('₹1,250');
    expect(formatMoney(25000)).toBe('₹25,000');
    expect(formatMoney(125000)).toBe('₹1,25,000');
  });

  it('shows paise only when there are any', () => {
    expect(formatMoney(1250.5)).toBe('₹1,250.50');
  });

  it('never prints NaN', () => {
    expect(formatMoney(Number.NaN)).toBe('₹0');
  });

  it('adds amounts without floating point drift', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumAmounts([0.1, 0.2])).toBe(0.3);
    expect(sumAmounts([1000.1, -250.05])).toBe(750.05);
  });

  it('knows currency symbols', () => {
    expect(currencySymbol('INR')).toBe('₹');
    expect(currencySymbol('USD')).toBe('$');
  });
});
