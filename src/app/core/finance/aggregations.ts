import { CategorySpending, DateRange, FinancialSummary, MonthlyTrendPoint, Transaction } from '../models';
import { findCategory } from '../categories';
import { shiftYearMonth, toIsoMonth, yearMonthOf } from '../utils/dates';
import { toPaise } from '../utils/money';

/**
 * Pure functions that turn the list of transactions into the numbers the UI shows.
 * Every sum is done in integer paise and converted back to rupees once at the end,
 * so 0.1 + 0.2 really is 0.3 here.
 */

export function inRange<T extends { date: string }>(items: readonly T[], range: DateRange): T[] {
  // ISO dates compare correctly as strings.
  return items.filter((item) => item.date >= range.startDate && item.date <= range.endDate);
}

/** (income - expenses) / income * 100, one decimal. 0 when there is no income. */
export function savingsRate(incomePaise: number, expensePaise: number): number {
  if (incomePaise <= 0) return 0;
  return Math.round(((incomePaise - expensePaise) * 1000) / incomePaise) / 10;
}

export function summarize(transactions: readonly Transaction[]): FinancialSummary {
  let income = 0;
  let expenses = 0;
  for (const t of transactions) {
    if (t.type === 'INCOME') income += toPaise(t.amount);
    else expenses += toPaise(t.amount);
  }
  return {
    income: income / 100,
    expenses: expenses / 100,
    balance: (income - expenses) / 100,
    savingsRate: savingsRate(income, expenses),
    transactionCount: transactions.length,
  };
}

/** Expense totals per category, largest first, with each category's share of the total. */
export function spendingByCategory(transactions: readonly Transaction[]): CategorySpending[] {
  const totals = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== 'EXPENSE') continue;
    totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + toPaise(t.amount));
  }
  const grandTotal = [...totals.values()].reduce((sum, v) => sum + v, 0);

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([categoryId, paise]) => ({
      categoryId,
      name: findCategory(categoryId)?.name ?? 'Unknown',
      total: paise / 100,
      percentage: grandTotal ? Math.round((paise * 1000) / grandTotal) / 10 : 0,
    }));
}

/** Expense total for each category id within the given transactions. */
export function expenseTotalsByCategory(transactions: readonly Transaction[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const t of transactions) {
    if (t.type === 'EXPENSE') totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + toPaise(t.amount));
  }
  return new Map([...totals].map(([id, paise]) => [id, paise / 100]));
}

/** One point per month in the range, including months with no transactions. */
export function monthlyTrend(transactions: readonly Transaction[], range: DateRange): MonthlyTrendPoint[] {
  const buckets = new Map<string, { income: number; expenses: number }>();
  let cursor = yearMonthOf(range.startDate);
  const lastKey = range.endDate.slice(0, 7);
  for (;;) {
    const key = toIsoMonth(cursor);
    buckets.set(key, { income: 0, expenses: 0 });
    if (key >= lastKey) break;
    cursor = shiftYearMonth(cursor, 1);
  }

  for (const t of inRange(transactions, range)) {
    const bucket = buckets.get(t.date.slice(0, 7));
    if (!bucket) continue;
    if (t.type === 'INCOME') bucket.income += toPaise(t.amount);
    else bucket.expenses += toPaise(t.amount);
  }

  return [...buckets.entries()].map(([month, b]) => ({
    month,
    income: b.income / 100,
    expenses: b.expenses / 100,
    net: (b.income - b.expenses) / 100,
  }));
}
