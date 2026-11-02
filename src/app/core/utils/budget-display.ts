import { BudgetStatus } from '../models';

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
