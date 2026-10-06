import { Insight } from '../models';

export interface InsightView {
  icon: string;
  tone: 'warn' | 'ok';
  message: string;
}

/**
 * core/finance/insights.ts decides *which* insights apply; this only words them.
 * `period` lets the dashboard say "this month" or "in August".
 */
export function describeInsight(
  insight: Insight,
  formatAmount: (value: number) => string,
  period = 'this month',
): InsightView {
  const category = insight.category ?? 'This category';
  const amount = formatAmount(insight.amount ?? 0);
  const percent = `${insight.percentage ?? 0}%`;

  switch (insight.kind) {
    case 'BUDGET_EXCEEDED':
      return { icon: 'error', tone: 'warn', message: `You exceeded your ${category} budget by ${amount}.` };
    case 'OVERSPENT_INCOME':
      return { icon: 'trending_down', tone: 'warn', message: `You spent ${amount} more than you earned ${period}.` };
    case 'SPENDING_INCREASE':
      return {
        icon: 'arrow_upward',
        tone: 'warn',
        message: `${category} spending increased by ${percent} compared with the previous month.`,
      };
    case 'SPENDING_DECREASE':
      return {
        icon: 'arrow_downward',
        tone: 'ok',
        message: `Your ${category.toLowerCase()} spending decreased by ${percent} compared with the previous month.`,
      };
    case 'HIGH_SAVINGS':
      return { icon: 'savings', tone: 'ok', message: `You saved ${percent} of your income ${period}.` };
  }
}
