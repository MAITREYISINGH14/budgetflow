import { findCategory } from '../categories';
import { MOCKAPI_RECORD_LIMIT } from '../config';
import { buildDemoData, splitAmount } from './demo-data';

describe('buildDemoData', () => {
  const today = '2026-10-05';
  const { transactions, budgets } = buildDemoData(today);

  it('fits comfortably within the MockAPI free limit', () => {
    expect(transactions.length).toBe(72);
    expect(budgets.length).toBe(19);
    expect(transactions.length).toBeLessThan(MOCKAPI_RECORD_LIMIT);
  });

  it('never creates future-dated transactions', () => {
    expect(transactions.every((t) => t.date <= today)).toBe(true);
  });

  it('spans the current month and the five before it', () => {
    const months = [...new Set(transactions.map((t) => t.date.slice(0, 7)))].sort();
    expect(months).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  });

  it('only uses categories that match the transaction type', () => {
    expect(transactions.every((t) => findCategory(t.categoryId)?.type === t.type)).toBe(true);
  });

  it('has at most one budget per category per month', () => {
    const keys = budgets.map((b) => `${b.categoryId}|${b.month}|${b.year}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('produces the documented current-month food total', () => {
    const food = transactions.filter((t) => t.categoryId === 'food' && t.date.startsWith('2026-10'));
    expect(food.reduce((sum, t) => sum + t.amount, 0)).toBe(8200);
  });
});

describe('splitAmount', () => {
  it('splits into whole parts that add up exactly', () => {
    expect(splitAmount(1497, 2).reduce((a, b) => a + b, 0)).toBe(1497);
    expect(splitAmount(500, 1)).toEqual([500]);
  });
});
