import { BudgetUsage } from '../models';
import { toPaise } from '../utils/money';

export const NEAR_LIMIT_PERCENT = 75;

/**
 * The single place where budget health is decided. Works in integer paise so the
 * comparisons are exact: 7500.00 of 10000.00 is NEAR_LIMIT, never 74.99999%.
 *
 * Status uses the exact ratio. The displayed percentage is rounded *down*, so
 * 99.96% shows as 99.9% next to "Near limit" instead of a contradictory 100%.
 */
export function calculateBudgetUsage(limit: number, spent: number): BudgetUsage {
  const limitPaise = toPaise(limit);
  const spentPaise = toPaise(spent);
  const remaining = (limitPaise - spentPaise) / 100;

  if (limitPaise === 0) {
    return { spent: spentPaise / 100, remaining, percentageUsed: 0, status: 'NO_LIMIT' };
  }

  const status =
    spentPaise >= limitPaise
      ? 'EXCEEDED'
      : spentPaise * 100 >= limitPaise * NEAR_LIMIT_PERCENT
        ? 'NEAR_LIMIT'
        : 'HEALTHY';

  return {
    spent: spentPaise / 100,
    remaining,
    percentageUsed: Math.floor((spentPaise * 1000) / limitPaise) / 10,
    status,
  };
}
