import { describeInsight } from './insight-text';

const format = (value: number) => `₹${value.toLocaleString('en-IN')}`;

describe('describeInsight', () => {
  it('words each rule result', () => {
    expect(
      describeInsight({ kind: 'SPENDING_INCREASE', severity: 'WARNING', category: 'Food', percentage: 24 }, format)
        .message,
    ).toBe('Food spending increased by 24% compared with the previous month.');
    expect(
      describeInsight({ kind: 'BUDGET_EXCEEDED', severity: 'WARNING', category: 'Shopping', amount: 2400 }, format)
        .message,
    ).toBe('You exceeded your Shopping budget by ₹2,400.');
    expect(
      describeInsight(
        { kind: 'SPENDING_DECREASE', severity: 'POSITIVE', category: 'Transport', percentage: 45 },
        format,
      ).tone,
    ).toBe('ok');
  });

  it('uses the given period wording', () => {
    expect(
      describeInsight({ kind: 'HIGH_SAVINGS', severity: 'POSITIVE', percentage: 41.2 }, format, 'in August').message,
    ).toBe('You saved 41.2% of your income in August.');
  });
});
