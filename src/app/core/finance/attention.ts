import { findExpenseCategoryByName } from '../categories';
import { BudgetView, Insight } from '../models';
import { describeInsight } from '../utils/insight-text';
import { categoryThisMonth } from '../utils/transaction-filters';

export const MAX_ATTENTION_ITEMS = 3;

export interface AttentionAction {
  label: string;
  /** Router path, e.g. "/transactions". */
  path: string;
  queryParams?: Record<string, string>;
}

export interface AttentionItem {
  /** Stable key for @for tracking. */
  key: string;
  tone: 'danger' | 'warn';
  icon: string;
  message: string;
  action: AttentionAction;
}

type Format = (value: number) => string;

function categoryLink(categoryId: string): AttentionAction {
  return { label: 'View', path: '/transactions', queryParams: categoryThisMonth(categoryId) };
}

/**
 * The dashboard's "Needs attention" list: one ranked list instead of separate budget
 * alerts and insights, so nothing is said twice and the most urgent item comes first.
 *
 *   1. budgets over their limit, largest overspend first
 *   2. budgets near their limit, highest usage first
 *   3. spending more than was earned
 *   4. categories that grew sharply, largest increase first
 *
 * Insights of kind BUDGET_EXCEEDED are dropped because (1) already covers them, and
 * positive insights are not "attention" items. Each item links to the data behind it.
 */
export function attentionItems(
  budgets: readonly BudgetView[],
  insights: readonly Insight[],
  format: Format,
  period = 'this month',
): AttentionItem[] {
  const exceeded = budgets
    .filter((b) => b.status === 'EXCEEDED')
    .sort((a, b) => a.remaining - b.remaining)
    .map<AttentionItem>((b) => ({
      key: `over-${b.id}`,
      tone: 'danger',
      icon: 'error',
      message: `${b.category.name} is ${format(Math.abs(b.remaining))} over budget.`,
      action: categoryLink(b.categoryId),
    }));

  const nearLimit = budgets
    .filter((b) => b.status === 'NEAR_LIMIT')
    .sort((a, b) => b.percentageUsed - a.percentageUsed)
    .map<AttentionItem>((b) => ({
      key: `near-${b.id}`,
      tone: 'warn',
      icon: 'warning',
      message: `${b.category.name} has used ${Math.floor(b.percentageUsed)}% of its budget.`,
      action: categoryLink(b.categoryId),
    }));

  const overspent = insights
    .filter((i) => i.kind === 'OVERSPENT_INCOME')
    .map<AttentionItem>((i) => ({
      key: 'overspent',
      tone: 'danger',
      icon: 'trending_down',
      message: describeInsight(i, format, period).message,
      action: { label: 'View', path: '/transactions', queryParams: { type: 'EXPENSE', range: 'this-month' } },
    }));

  const increases = insights
    .filter((i) => i.kind === 'SPENDING_INCREASE')
    .sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0))
    .map<AttentionItem>((i) => {
      const category = findExpenseCategoryByName(i.category);
      return {
        key: `up-${category?.id ?? i.category}`,
        tone: 'warn',
        icon: 'arrow_upward',
        message: describeInsight(i, format, period).message,
        action: { label: 'Compare', path: '/analytics' },
      };
    });

  return [...exceeded, ...nearLimit, ...overspent, ...increases].slice(0, MAX_ATTENTION_ITEMS);
}
