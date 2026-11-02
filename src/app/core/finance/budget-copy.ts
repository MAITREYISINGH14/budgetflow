import { Budget, BudgetPayload, YearMonth } from '../models';

/**
 * The budgets `from` has that `to` does not have yet, as payloads for `to`.
 * Categories `to` already budgets are left alone, so copying never overwrites a limit
 * someone has set and running it twice adds nothing the second time.
 */
export function budgetsToCopy(budgets: readonly Budget[], from: YearMonth, to: YearMonth): BudgetPayload[] {
  const inTarget = new Set(budgets.filter((b) => b.year === to.year && b.month === to.month).map((b) => b.categoryId));
  return budgets
    .filter((b) => b.year === from.year && b.month === from.month && !inTarget.has(b.categoryId))
    .map((b) => ({ categoryId: b.categoryId, limit: b.limit, year: to.year, month: to.month }));
}
