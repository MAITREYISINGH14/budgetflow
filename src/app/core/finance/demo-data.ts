import { BudgetPayload, TransactionPayload } from '../models';
import { shiftYearMonth, yearMonthOf } from '../utils/dates';

/**
 * Demo data generated relative to `today`, so "this month" always has activity.
 * Amounts are fixed per month so the demo reliably shows every state:
 *
 *   current month   Food at 82% (near limit), Shopping over by ₹2,400,
 *                   Food +24% vs last month, Transport down, savings ~70%
 *   last month      Travel budget exceeded, the rest healthy
 *   3 months back   heavy month with several budgets exceeded
 *
 * Stays well under MockAPI's 100-records-per-resource free limit (72 + 19).
 */

interface MonthPlan {
  income: Record<string, number>;
  expenses: Record<string, number>;
  budgets?: Record<string, number>;
}

// Oldest first; the last entry is the current month. Keys are category ids.
const PLANS: MonthPlan[] = [
  {
    income: { salary: 78000, investment: 2400 },
    expenses: {
      food: 7400,
      transport: 3900,
      shopping: 4800,
      bills: 6800,
      entertainment: 2100,
      subscriptions: 1297,
      healthcare: 900,
    },
  },
  {
    income: { salary: 78000, freelance: 12000 },
    expenses: {
      food: 8100,
      transport: 4200,
      shopping: 6900,
      bills: 7050,
      entertainment: 3200,
      subscriptions: 1297,
      education: 4500,
    },
  },
  {
    income: { salary: 80000 },
    expenses: {
      food: 9800,
      transport: 4600,
      shopping: 11000,
      bills: 7200,
      entertainment: 4200,
      subscriptions: 1497,
      healthcare: 3500,
      travel: 24000,
    },
    budgets: { food: 9000, transport: 5000, shopping: 8000, entertainment: 4000, bills: 7500, subscriptions: 1500 },
  },
  {
    income: { salary: 80000, bonus: 20000, investment: 3100 },
    expenses: {
      food: 7200,
      transport: 3600,
      shopping: 5400,
      bills: 6900,
      entertainment: 2600,
      subscriptions: 1497,
      'other-expense': 1800,
    },
  },
  {
    income: { salary: 80000 },
    expenses: {
      food: 6600,
      transport: 3800,
      shopping: 5200,
      bills: 7100,
      entertainment: 2800,
      subscriptions: 1497,
      healthcare: 1200,
      travel: 12000,
    },
    budgets: { food: 10000, transport: 5000, shopping: 8000, entertainment: 4000, bills: 9000, travel: 10000 },
  },
  {
    income: { salary: 80000, freelance: 15000 },
    expenses: { food: 8200, transport: 2100, shopping: 8400, bills: 6950, entertainment: 1500, subscriptions: 1497 },
    budgets: {
      food: 10000,
      transport: 5000,
      shopping: 6000,
      entertainment: 3000,
      bills: 7000,
      subscriptions: 2000,
      healthcare: 2000,
    },
  },
];

const DESCRIPTIONS: Record<string, string[]> = {
  salary: ['Monthly salary'],
  freelance: ['Freelance: landing page project', 'Freelance: dashboard redesign'],
  bonus: ['Quarterly performance bonus'],
  investment: ['Mutual fund dividend', 'FD interest'],
  food: ['Groceries – BigBasket', 'Swiggy dinner', 'Lunch with team', 'Weekend brunch'],
  transport: ['Metro card recharge', 'Uber to office', 'Petrol'],
  shopping: ['Amazon order', 'Myntra – shirts', 'Decathlon running shoes'],
  bills: ['Electricity bill', 'Broadband, Airtel', 'Mobile postpaid', 'Society maintenance'],
  entertainment: ['Movie tickets', 'Bowling with friends', 'Concert tickets'],
  healthcare: ['Pharmacy', 'Doctor consultation'],
  education: ['Online course: system design'],
  travel: ['Flight tickets', 'Hotel stay'],
  subscriptions: ['Netflix', 'Spotify'],
  'other-expense': ['Gift for a friend'],
};

/** How many transactions each category total is split into. */
const SPLITS: Record<string, number> = { food: 2, bills: 2, subscriptions: 2 };
const SPREAD_DAYS = [3, 9, 14, 21, 26];

/** Splits a total into whole-rupee parts that add up exactly to the total. */
export function splitAmount(total: number, parts: number): number[] {
  if (parts <= 1) return [total];
  const first = Math.round(total * 0.58);
  return [first, total - first];
}

function dateFor(year: number, month: number, day: number, today: string, isCurrentMonth: boolean): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let safeDay = Math.min(day, lastDay);
  if (isCurrentMonth) safeDay = Math.min(safeDay, Number(today.slice(8, 10)));
  return `${year}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

export function buildDemoData(today: string): { transactions: TransactionPayload[]; budgets: BudgetPayload[] } {
  const transactions: TransactionPayload[] = [];
  const budgets: BudgetPayload[] = [];
  const current = yearMonthOf(today);

  PLANS.forEach((plan, index) => {
    const monthsAgo = PLANS.length - 1 - index;
    const { year, month } = shiftYearMonth(current, -monthsAgo);
    const isCurrentMonth = monthsAgo === 0;

    Object.entries(plan.income).forEach(([categoryId, amount], i) => {
      const options = DESCRIPTIONS[categoryId];
      transactions.push({
        type: 'INCOME',
        amount,
        categoryId,
        description: options[index % options.length],
        date: dateFor(year, month, i === 0 ? 1 : 12 + i * 4, today, isCurrentMonth),
      });
    });

    Object.entries(plan.expenses).forEach(([categoryId, total], categoryIndex) => {
      const options = DESCRIPTIONS[categoryId];
      splitAmount(total, SPLITS[categoryId] ?? 1).forEach((amount, i) => {
        transactions.push({
          type: 'EXPENSE',
          amount,
          categoryId,
          description: options[(i + index) % options.length],
          date: dateFor(year, month, SPREAD_DAYS[(i + categoryIndex) % SPREAD_DAYS.length], today, isCurrentMonth),
        });
      });
    });

    Object.entries(plan.budgets ?? {}).forEach(([categoryId, limit]) => {
      budgets.push({ categoryId, month, year, limit });
    });
  });

  return { transactions, budgets };
}
