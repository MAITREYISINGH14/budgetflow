import { BudgetView, Transaction } from '../models';
import { generateInsights, InsightInput, insightsForMonth } from './insights';

function input(overrides: Partial<InsightInput> = {}): InsightInput {
  return { income: 95000, expenses: 28647, current: new Map(), previous: new Map(), budgets: [], ...overrides };
}

const shopping = { id: 'shopping', name: 'Shopping', type: 'EXPENSE' as const };

describe('generateInsights', () => {
  it('reports a category that grew by more than 20%', () => {
    const insights = generateInsights(
      input({ current: new Map([['Food', 8200]]), previous: new Map([['Food', 6600]]) }),
    );
    expect(insights).toContainEqual({
      kind: 'SPENDING_INCREASE',
      severity: 'WARNING',
      category: 'Food',
      percentage: 24,
    });
  });

  it('does not report an increase of exactly 20%', () => {
    const insights = generateInsights(
      input({ current: new Map([['Food', 6000]]), previous: new Map([['Food', 5000]]) }),
    );
    expect(insights.some((i) => i.kind === 'SPENDING_INCREASE')).toBe(false);
  });

  it('reports decreases, including a category with no spending this month', () => {
    const insights = generateInsights(
      input({
        current: new Map([['Transport', 2100]]),
        previous: new Map([
          ['Transport', 3800],
          ['Travel', 12000],
        ]),
      }),
    );
    expect(insights.filter((i) => i.kind === 'SPENDING_DECREASE')).toEqual([
      { kind: 'SPENDING_DECREASE', severity: 'POSITIVE', category: 'Travel', percentage: 100 },
      { kind: 'SPENDING_DECREASE', severity: 'POSITIVE', category: 'Transport', percentage: 45 },
    ]);
  });

  it('ignores changes when last month was too small to compare', () => {
    const insights = generateInsights(
      input({ current: new Map([['Other', 1500]]), previous: new Map([['Other', 200]]) }),
    );
    expect(insights.some((i) => i.category === 'Other')).toBe(false);
  });

  it('reports exceeded budgets with the overspent amount first', () => {
    const insights = generateInsights(
      input({ budgets: [{ status: 'EXCEEDED', remaining: -2400, category: shopping }] }),
    );
    expect(insights[0]).toEqual({ kind: 'BUDGET_EXCEEDED', severity: 'WARNING', category: 'Shopping', amount: 2400 });
  });

  it('praises a savings rate above 30%', () => {
    expect(generateInsights(input())).toContainEqual({ kind: 'HIGH_SAVINGS', severity: 'POSITIVE', percentage: 69.8 });
  });

  it('warns when spending is higher than income', () => {
    const insights = generateInsights(input({ income: 30000, expenses: 42000 }));
    expect(insights).toContainEqual({ kind: 'OVERSPENT_INCOME', severity: 'WARNING', amount: 12000 });
    expect(insights.some((i) => i.kind === 'HIGH_SAVINGS')).toBe(false);
  });

  it('returns nothing for a month without data', () => {
    expect(generateInsights(input({ income: 0, expenses: 0 }))).toEqual([]);
  });
});

describe('insightsForMonth', () => {
  const t = (type: Transaction['type'], amount: number, categoryId: string, date: string): Transaction => ({
    id: date + categoryId + amount,
    type,
    amount,
    categoryId,
    description: '',
    date,
    createdAt: '',
    updatedAt: '',
  });

  it('compares the month with the one before it and only uses that month’s budgets', () => {
    const transactions = [
      t('EXPENSE', 6600, 'food', '2026-09-10'),
      t('EXPENSE', 8200, 'food', '2026-10-03'),
      t('INCOME', 50000, 'salary', '2026-10-01'),
    ];
    const septemberBudget = {
      month: 9,
      year: 2026,
      status: 'EXCEEDED',
      remaining: -100,
      category: shopping,
    } as BudgetView;

    const kinds = insightsForMonth(transactions, [septemberBudget], { year: 2026, month: 10 }).map((i) => i.kind);
    expect(kinds).toEqual(['SPENDING_INCREASE', 'HIGH_SAVINGS']);
  });
});
