import { BudgetView } from '../models';
import { toPaise } from '../utils/money';

/** Spending this many points ahead of the calendar counts as "ahead of pace". */
export const PACE_TOLERANCE_PERCENT = 5;

/**
 * What "left to spend" is measured against:
 * BUDGET  the month's budgets (only categories with a limit above 0)
 * INCOME  the month's income, when no budget has a limit
 * NONE    neither, so there is nothing to measure against
 */
export type PaceBasis = 'BUDGET' | 'INCOME' | 'NONE';
export type PaceStatus = 'ON_PACE' | 'AHEAD' | 'OVER' | 'NONE';

export interface MonthPace {
  basis: PaceBasis;
  /** Budgeted total or income; 0 for NONE. */
  planned: number;
  /** Spending counted against `planned`: budgeted categories for BUDGET, all expenses otherwise. */
  spent: number;
  /** planned - spent. Negative when over. */
  left: number;
  /** Days remaining including today. */
  daysLeft: number;
  dayOfMonth: number;
  daysInMonth: number;
  /** Whole rupees per remaining day, 0 when nothing is left, null for NONE. */
  perDay: number | null;
  /** Share of `planned` already spent, rounded down to one decimal. */
  usedPercent: number;
  /** Share of the month that has passed, including today. */
  elapsedPercent: number;
  status: PaceStatus;
}

export interface MonthPaceInput {
  /** YYYY-MM-DD, a day inside the month being measured. */
  today: string;
  budgets: readonly Pick<BudgetView, 'limit' | 'spent'>[];
  income: number;
  expenses: number;
}

/**
 * How the current month is going, for the dashboard hero and the budgets page.
 * Sums are done in paise like the rest of core/finance.
 */
export function monthPace({ today, budgets, income, expenses }: MonthPaceInput): MonthPace {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const dayOfMonth = Number(today.slice(8, 10));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const daysLeft = daysInMonth - dayOfMonth + 1;
  const elapsedPercent = Math.round((dayOfMonth * 100) / daysInMonth);

  const limited = budgets.filter((b) => toPaise(b.limit) > 0);
  let basis: PaceBasis;
  let plannedPaise: number;
  let spentPaise: number;
  if (limited.length > 0) {
    basis = 'BUDGET';
    plannedPaise = limited.reduce((sum, b) => sum + toPaise(b.limit), 0);
    spentPaise = limited.reduce((sum, b) => sum + toPaise(b.spent), 0);
  } else if (toPaise(income) > 0) {
    basis = 'INCOME';
    plannedPaise = toPaise(income);
    spentPaise = toPaise(expenses);
  } else {
    basis = 'NONE';
    plannedPaise = 0;
    spentPaise = toPaise(expenses);
  }

  const leftPaise = plannedPaise - spentPaise;
  const usedPercent = plannedPaise > 0 ? Math.floor((spentPaise * 1000) / plannedPaise) / 10 : 0;

  let status: PaceStatus = 'NONE';
  if (basis !== 'NONE') {
    if (spentPaise >= plannedPaise) status = 'OVER';
    else if (usedPercent > elapsedPercent + PACE_TOLERANCE_PERCENT) status = 'AHEAD';
    else status = 'ON_PACE';
  }

  return {
    basis,
    planned: plannedPaise / 100,
    spent: spentPaise / 100,
    left: leftPaise / 100,
    daysLeft,
    dayOfMonth,
    daysInMonth,
    perDay: basis === 'NONE' ? null : leftPaise > 0 ? Math.floor(leftPaise / daysLeft / 100) : 0,
    usedPercent,
    elapsedPercent,
    status,
  };
}
