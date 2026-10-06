import { BudgetStatus, BudgetView } from '../models';

export type Tone = 'ok' | 'warn' | 'danger' | 'neutral';

/** Status is always shown as icon + text, never colour alone. */
export const BUDGET_STATUS_META: Record<BudgetStatus, { label: string; icon: string; tone: Tone }> = {
  HEALTHY: { label: 'On track', icon: 'check_circle', tone: 'ok' },
  NEAR_LIMIT: { label: 'Near limit', icon: 'warning', tone: 'warn' },
  EXCEEDED: { label: 'Over budget', icon: 'error', tone: 'danger' },
  NO_LIMIT: { label: 'No limit set', icon: 'do_not_disturb_on', tone: 'neutral' },
};

/** Width of the progress fill: 0-100, safe for NaN or negative input. */
export function progressWidth(percentageUsed: number): number {
  if (!Number.isFinite(percentageUsed) || percentageUsed <= 0) return 0;
  return Math.min(percentageUsed, 100);
}

export interface BudgetAlert {
  budgetId: string;
  tone: 'warn' | 'danger';
  message: string;
}

/** In-app alerts for budgets that need attention, most urgent first. */
export function buildBudgetAlerts(
  budgets: readonly BudgetView[],
  formatAmount: (value: number) => string,
): BudgetAlert[] {
  const exceeded = budgets
    .filter((b) => b.status === 'EXCEEDED')
    .sort((a, b) => a.remaining - b.remaining)
    .map((b) => ({
      budgetId: b.id,
      tone: 'danger' as const,
      message: `${b.category.name} budget has been exceeded by ${formatAmount(Math.abs(b.remaining))}.`,
    }));

  const nearLimit = budgets
    .filter((b) => b.status === 'NEAR_LIMIT')
    .sort((a, b) => b.percentageUsed - a.percentageUsed)
    .map((b) => ({
      budgetId: b.id,
      tone: 'warn' as const,
      message: `${b.category.name} spending has reached ${Math.floor(b.percentageUsed)}% of your monthly budget.`,
    }));

  return [...exceeded, ...nearLimit];
}
