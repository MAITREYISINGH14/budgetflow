import { findCategory } from '../categories';
import { BudgetView, Transaction } from '../models';
import { categoryOverview } from './category-overview';

function tx(categoryId: string, amount: number, type: 'INCOME' | 'EXPENSE' = 'EXPENSE'): Transaction {
  return {
    id: categoryId + amount,
    type,
    amount,
    categoryId,
    description: '',
    date: '2026-11-05',
    createdAt: '',
    updatedAt: '',
  };
}

function budget(categoryId: string, limit: number, spent: number): BudgetView {
  return {
    id: 'b-' + categoryId,
    categoryId,
    category: findCategory(categoryId)!,
    month: 11,
    year: 2026,
    limit,
    spent,
    remaining: limit - spent,
    percentageUsed: (spent / limit) * 100,
    status: 'HEALTHY',
    createdAt: '',
    updatedAt: '',
  };
}

describe('categoryOverview', () => {
  it('lists spending and budgeted categories together, most spent first', () => {
    const { rows } = categoryOverview(
      [tx('food', 8200), tx('shopping', 8400), tx('travel', 1400), tx('salary', 80000, 'INCOME')],
      [budget('food', 10000, 8200), budget('healthcare', 2000, 0)],
    );

    expect(rows.map((r) => [r.name, r.spent, r.share, r.budget?.limit ?? null])).toEqual([
      ['Shopping', 8400, 46.7, null],
      ['Food', 8200, 45.6, 10000],
      ['Travel', 1400, 7.8, null],
      ['Healthcare', 0, 0, 2000],
    ]);
  });

  it('returns the expense categories without a budget, in category order', () => {
    const { unbudgeted } = categoryOverview([], [budget('food', 10000, 0), budget('bills', 7000, 0)]);
    expect(unbudgeted.map((c) => c.id)).toEqual([
      'transport',
      'shopping',
      'entertainment',
      'healthcare',
      'education',
      'travel',
      'subscriptions',
      'other-expense',
    ]);
  });

  it('is empty for a month with nothing in it', () => {
    const overview = categoryOverview([], []);
    expect(overview.rows).toEqual([]);
    expect(overview.unbudgeted).toHaveLength(10);
  });
});
