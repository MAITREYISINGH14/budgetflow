import { EXPENSE_CATEGORIES, findCategory } from '../categories';
import { BudgetView, Category, Transaction } from '../models';
import { toPaise } from '../utils/money';

export interface CategoryRow {
  categoryId: string;
  name: string;
  spent: number;
  /** Share of the month's expenses, one decimal. */
  share: number;
  /** The month's budget for this category, if one is set. */
  budget: BudgetView | null;
}

export interface CategoryOverview {
  /** Categories with spending or a budget this month, most spent first. */
  rows: CategoryRow[];
  /** Expense categories without a budget this month, in the fixed category order. */
  unbudgeted: Category[];
}

/**
 * One list per month that answers both "where did it go?" and "how are my budgets?",
 * replacing the dashboard's separate donut and budget preview.
 * `transactions` and `budgets` must already be limited to the same month.
 */
export function categoryOverview(
  transactions: readonly Transaction[],
  budgets: readonly BudgetView[],
): CategoryOverview {
  const spentPaise = new Map<string, number>();
  for (const t of transactions) {
    if (t.type === 'EXPENSE') spentPaise.set(t.categoryId, (spentPaise.get(t.categoryId) ?? 0) + toPaise(t.amount));
  }
  const totalPaise = [...spentPaise.values()].reduce((sum, v) => sum + v, 0);
  const budgetByCategory = new Map(budgets.map((b) => [b.categoryId, b]));

  const ids = new Set([...spentPaise.keys(), ...budgetByCategory.keys()]);
  const rows = [...ids]
    .flatMap((categoryId) => {
      const category = findCategory(categoryId);
      if (!category) return [];
      const paise = spentPaise.get(categoryId) ?? 0;
      return [
        {
          categoryId,
          name: category.name,
          spent: paise / 100,
          share: totalPaise ? Math.round((paise * 1000) / totalPaise) / 10 : 0,
          budget: budgetByCategory.get(categoryId) ?? null,
        },
      ];
    })
    .sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name));

  return { rows, unbudgeted: EXPENSE_CATEGORIES.filter((c) => !budgetByCategory.has(c.id)) };
}
