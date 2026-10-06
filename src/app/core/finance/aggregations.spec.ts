import { Transaction } from '../models';
import { inRange, monthlyTrend, savingsRate, spendingByCategory, summarize } from './aggregations';

let nextId = 1;
function tx(type: Transaction['type'], amount: number, categoryId: string, date: string): Transaction {
  return { id: String(nextId++), type, amount, categoryId, description: '', date, createdAt: '', updatedAt: '' };
}

describe('summarize', () => {
  it('builds the dashboard summary', () => {
    const items = [tx('INCOME', 80000, 'salary', '2026-09-01'), tx('EXPENSE', 37500, 'bills', '2026-09-03')];
    expect(summarize(items)).toEqual({
      income: 80000,
      expenses: 37500,
      balance: 42500,
      savingsRate: 53.1,
      transactionCount: 2,
    });
  });

  it('returns 0% instead of NaN or Infinity when there is no income', () => {
    expect(summarize([])).toEqual({ income: 0, expenses: 0, balance: 0, savingsRate: 0, transactionCount: 0 });
    expect(summarize([tx('EXPENSE', 1200, 'food', '2026-09-01')]).savingsRate).toBe(0);
  });

  it('allows a negative savings rate when spending exceeds income', () => {
    expect(savingsRate(4_000_000, 5_000_000)).toBe(-25);
  });

  it('adds money without floating point drift', () => {
    const items = [tx('INCOME', 0.1, 'salary', '2026-09-01'), tx('INCOME', 0.2, 'salary', '2026-09-01')];
    expect(summarize(items).income).toBe(0.3);
  });
});

describe('inRange', () => {
  it('includes both ends of the range', () => {
    const items = [
      tx('EXPENSE', 1, 'food', '2026-08-31'),
      tx('EXPENSE', 1, 'food', '2026-09-01'),
      tx('EXPENSE', 1, 'food', '2026-09-30'),
      tx('EXPENSE', 1, 'food', '2026-10-01'),
    ];
    expect(inRange(items, { startDate: '2026-09-01', endDate: '2026-09-30' }).map((t) => t.date)).toEqual([
      '2026-09-01',
      '2026-09-30',
    ]);
  });
});

describe('spendingByCategory', () => {
  it('totals expenses per category, largest first, with shares', () => {
    const items = [
      tx('EXPENSE', 2500, 'transport', '2026-09-02'),
      tx('EXPENSE', 5000, 'food', '2026-09-03'),
      tx('EXPENSE', 2500, 'food', '2026-09-04'),
      tx('INCOME', 80000, 'salary', '2026-09-01'),
    ];
    expect(spendingByCategory(items)).toEqual([
      { categoryId: 'food', name: 'Food', total: 7500, percentage: 75 },
      { categoryId: 'transport', name: 'Transport', total: 2500, percentage: 25 },
    ]);
  });
});

describe('monthlyTrend', () => {
  it('returns one point per month and fills empty months with zeros', () => {
    const items = [
      tx('INCOME', 80000, 'salary', '2026-07-01'),
      tx('EXPENSE', 35000, 'bills', '2026-07-10'),
      tx('EXPENSE', 1200.5, 'food', '2026-09-30'),
      tx('EXPENSE', 999, 'food', '2026-10-01'),
    ];
    expect(monthlyTrend(items, { startDate: '2026-07-01', endDate: '2026-09-30' })).toEqual([
      { month: '2026-07', income: 80000, expenses: 35000, net: 45000 },
      { month: '2026-08', income: 0, expenses: 0, net: 0 },
      { month: '2026-09', income: 0, expenses: 1200.5, net: -1200.5 },
    ]);
  });

  it('crosses year boundaries', () => {
    expect(monthlyTrend([], { startDate: '2025-11-15', endDate: '2026-01-10' }).map((p) => p.month)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
    ]);
  });
});
