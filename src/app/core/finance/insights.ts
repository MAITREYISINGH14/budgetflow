import { findCategory } from '../categories';
import { BudgetView, Insight, Transaction, YearMonth } from '../models';
import { monthBounds, shiftYearMonth } from '../utils/dates';
import { toPaise } from '../utils/money';
import { expenseTotalsByCategory, inRange, savingsRate, summarize } from './aggregations';

export const INSIGHT_RULES = {
  /** Flag a category when it grew by more than this vs the previous month. */
  increasePercent: 20,
  /** Praise a category when it shrank by at least this much. */
  decreasePercent: 10,
  /** Savings rate above this is called out as a good month. */
  highSavingsPercent: 30,
  /** Ignore changes when last month's spend was tiny (₹200 → ₹600 is not "+200%" news). */
  minComparableSpend: 500,
  maxInsights: 6,
} as const;

export interface InsightInput {
  income: number;
  expenses: number;
  /** Category name → expense total, current month. */
  current: Map<string, number>;
  /** Category name → expense total, previous month. */
  previous: Map<string, number>;
  budgets: Pick<BudgetView, 'status' | 'remaining' | 'category'>[];
}

/**
 * Deterministic rules, no AI. Returns structured results; wording lives in
 * insight-text.ts so currency formatting stays in one place.
 */
export function generateInsights(input: InsightInput): Insight[] {
  const warnings: Insight[] = [];
  const positives: Insight[] = [];
  const income = toPaise(input.income);
  const expenses = toPaise(input.expenses);

  for (const budget of input.budgets) {
    if (budget.status === 'EXCEEDED') {
      warnings.push({
        kind: 'BUDGET_EXCEEDED',
        severity: 'WARNING',
        category: budget.category.name,
        amount: Math.abs(budget.remaining),
      });
    }
  }

  if (income > 0 && expenses > income) {
    warnings.push({ kind: 'OVERSPENT_INCOME', severity: 'WARNING', amount: (expenses - income) / 100 });
  }

  const rate = savingsRate(income, expenses);
  if (income > 0 && rate > INSIGHT_RULES.highSavingsPercent) {
    positives.push({ kind: 'HIGH_SAVINGS', severity: 'POSITIVE', percentage: rate });
  }

  const increases: Insight[] = [];
  const decreases: Insight[] = [];
  for (const [category, previousTotal] of input.previous) {
    const previous = toPaise(previousTotal);
    if (previous < INSIGHT_RULES.minComparableSpend * 100) continue;
    const current = toPaise(input.current.get(category) ?? 0);
    const change = Math.round(((current - previous) * 100) / previous);

    if (change > INSIGHT_RULES.increasePercent) {
      increases.push({ kind: 'SPENDING_INCREASE', severity: 'WARNING', category, percentage: change });
    } else if (change <= -INSIGHT_RULES.decreasePercent) {
      decreases.push({ kind: 'SPENDING_DECREASE', severity: 'POSITIVE', category, percentage: Math.abs(change) });
    }
  }

  const byPercentage = (a: Insight, b: Insight) => (b.percentage ?? 0) - (a.percentage ?? 0);
  increases.sort(byPercentage);
  decreases.sort(byPercentage);

  return [...warnings, ...increases, ...positives, ...decreases].slice(0, INSIGHT_RULES.maxInsights);
}

/** Insights for one month compared with the month before it. */
export function insightsForMonth(
  transactions: readonly Transaction[],
  budgets: readonly BudgetView[],
  period: YearMonth,
): Insight[] {
  const current = inRange(transactions, monthBounds(period));
  const previous = inRange(transactions, monthBounds(shiftYearMonth(period, -1)));
  const byName = (totals: Map<string, number>) =>
    new Map([...totals].map(([id, total]) => [findCategory(id)?.name ?? id, total]));
  const summary = summarize(current);

  return generateInsights({
    income: summary.income,
    expenses: summary.expenses,
    current: byName(expenseTotalsByCategory(current)),
    previous: byName(expenseTotalsByCategory(previous)),
    budgets: budgets.filter((b) => b.year === period.year && b.month === period.month),
  });
}
