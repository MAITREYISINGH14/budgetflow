import { findCategory } from '../categories';
import { BudgetView, RecurringRule, Transaction } from '../models';
import {
  addDays,
  compareYearMonth,
  formatMonth,
  monthBounds,
  shiftYearMonth,
  toIsoMonth,
  yearMonthOf,
} from '../utils/dates';
import { toPaise } from '../utils/money';
import { categoryThisMonth } from '../utils/transaction-filters';
import { inRange, summarize } from './aggregations';
import { isRuleActive, nextOccurrence } from './recurring';

export type NotificationKind =
  | 'BILL_DUE'
  | 'BUDGET_OVER'
  | 'BUDGET_NEAR'
  | 'NEW_MONTH'
  | 'RECURRING_ADDED'
  | 'UNUSUAL_SPEND'
  | 'MONTH_RECAP'
  | 'LOGGING_NUDGE';

export interface NotificationAction {
  label: string;
  path: string;
  queryParams?: Record<string, string>;
}

export interface AppNotification {
  /**
   * Stable for the same event (e.g. one bill on one date, one budget's month), so
   * read and dismissed state survives reloads and nothing is announced twice.
   */
  id: string;
  kind: NotificationKind;
  tone: 'danger' | 'warn' | 'ok' | 'info';
  icon: string;
  title: string;
  body?: string;
  /** The day the notification is about, for ordering. */
  date: string;
  action?: NotificationAction;
}

export const NOTIFICATION_RULES = {
  /** Remind this many days before a recurring bill. */
  billLeadDays: 3,
  /** Show "was added" for recurring transactions dated within this many days. */
  addedWithinDays: 2,
  /** Month-start notifications (new month, recap) show during these first days. */
  monthStartDays: 7,
  /** A payment this many times the category's usual amount is unusual... */
  unusualMultiple: 3,
  /** ...if it is at least this much... */
  unusualMinAmount: 1000,
  /** ...and the category has this many earlier payments to compare with. */
  unusualMinHistory: 3,
  /** Look this far back for unusual payments. */
  unusualWithinDays: 7,
  /** Nudge after this many days without a new transaction. */
  quietDays: 4,
  maxShown: 20,
} as const;

export interface NotificationInput {
  today: string;
  rules: readonly RecurringRule[];
  transactions: readonly Transaction[];
  /** All budgets with usage; only the relevant months are used. */
  budgets: readonly BudgetView[];
  format: (value: number) => string;
  enabled: Readonly<Record<NotificationKind, boolean>>;
}

const RULES = NOTIFICATION_RULES;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function nameOf(t: { description: string; categoryId: string }): string {
  return t.description || findCategory(t.categoryId)?.name || 'Payment';
}

function categoryLink(categoryId: string): NotificationAction {
  return { label: 'View', path: '/transactions', queryParams: categoryThisMonth(categoryId) };
}

function billsDue({ today, rules, format }: NotificationInput): AppNotification[] {
  return rules.flatMap((rule) => {
    if (rule.type !== 'EXPENSE' || !isRuleActive(rule, today)) return [];
    const due = nextOccurrence(rule, today);
    if (!due) return [];
    const days = daysBetween(today, due);
    if (days < 1 || days > RULES.billLeadDays) return [];
    const when = days === 1 ? 'tomorrow' : `in ${days} days`;
    return [
      {
        id: `bill:${rule.id}:${due}`,
        kind: 'BILL_DUE' as const,
        tone: 'info' as const,
        icon: 'event',
        title: `${nameOf(rule)} ${format(rule.amount)} is due ${when}`,
        body: 'It will be added automatically on the day.',
        date: due,
        action: { label: 'Recurring', path: '/settings' },
      },
    ];
  });
}

function budgetAlerts({ today, budgets, format }: NotificationInput): AppNotification[] {
  const { year, month } = yearMonthOf(today);
  return budgets
    .filter((b) => b.year === year && b.month === month)
    .flatMap((b): AppNotification[] => {
      if (b.status === 'EXCEEDED') {
        return [
          {
            id: `budget-over:${b.id}`,
            kind: 'BUDGET_OVER',
            tone: 'danger',
            icon: 'error',
            title: `${b.category.name} is ${format(Math.abs(b.remaining))} over budget`,
            date: today,
            action: categoryLink(b.categoryId),
          },
        ];
      }
      if (b.status === 'NEAR_LIMIT') {
        return [
          {
            id: `budget-near:${b.id}`,
            kind: 'BUDGET_NEAR',
            tone: 'warn',
            icon: 'warning',
            title: `${b.category.name} has used ${Math.floor(b.percentageUsed)}% of its budget`,
            body: `${format(b.remaining)} left for the rest of the month.`,
            date: today,
            action: categoryLink(b.categoryId),
          },
        ];
      }
      return [];
    });
}

function monthStart({ today, budgets, transactions, format }: NotificationInput): {
  newMonth: AppNotification[];
  recap: AppNotification[];
} {
  if (Number(today.slice(8, 10)) > RULES.monthStartDays) return { newMonth: [], recap: [] };
  const current = yearMonthOf(today);
  const previous = shiftYearMonth(current, -1);
  const inMonth = (ym: typeof current) => budgets.filter((b) => compareYearMonth(b, ym) === 0);
  const previousName = formatMonth(toIsoMonth(previous), 'name');

  const newMonth: AppNotification[] =
    inMonth(current).length === 0 && inMonth(previous).length > 0
      ? [
          {
            id: `new-month:${toIsoMonth(current)}`,
            kind: 'NEW_MONTH',
            tone: 'info',
            icon: 'donut_small',
            title: `${formatMonth(toIsoMonth(current), 'name')} has no budgets yet`,
            body: `Copy ${previousName}’s ${inMonth(previous).length} budgets in one step.`,
            date: today,
            action: { label: 'Set up', path: '/budgets' },
          },
        ]
      : [];

  const summary = summarize(inRange(transactions, monthBounds(previous)));
  if (summary.transactionCount === 0) return { newMonth, recap: [] };
  const over = inMonth(previous).filter((b) => b.status === 'EXCEEDED');
  const limited = inMonth(previous).filter((b) => b.status !== 'NO_LIMIT');
  const worst = [...over].sort((a, b) => a.remaining - b.remaining)[0];
  const body = worst
    ? `${worst.category.name} went ${format(Math.abs(worst.remaining))} over budget${over.length > 1 ? `, and ${over.length - 1} more went over` : ''}.`
    : limited.length
      ? 'Every budget stayed within its limit.'
      : `You spent ${format(summary.expenses)}.`;
  const title =
    summary.income > 0
      ? `${previousName} recap: you saved ${summary.savingsRate}% of your income`
      : `${previousName} recap: you spent ${format(summary.expenses)}`;
  return {
    newMonth,
    recap: [
      {
        id: `recap:${toIsoMonth(previous)}`,
        kind: 'MONTH_RECAP',
        tone: summary.savingsRate < 0 || over.length ? 'warn' : 'ok',
        icon: 'monitoring',
        title,
        body,
        date: monthBounds(current).startDate,
        action: { label: 'Review', path: '/analytics' },
      },
    ],
  };
}

function recurringAdded({ today, transactions, rules, format }: NotificationInput): AppNotification[] {
  const ruleIds = new Set(rules.map((r) => r.id));
  const since = addDays(today, -RULES.addedWithinDays);
  return transactions
    .filter((t) => t.ruleId && ruleIds.has(t.ruleId) && t.date >= since && t.date <= today)
    .map((t) => ({
      id: `added:${t.id}`,
      kind: 'RECURRING_ADDED' as const,
      tone: 'ok' as const,
      icon: 'repeat',
      title: `${nameOf(t)} ${format(t.amount)} was added`,
      body: 'Added automatically by a recurring transaction.',
      date: t.date,
      action: { label: 'View', path: '/transactions', queryParams: { range: 'this-month' } },
    }));
}

function unusualSpending({ today, transactions, format }: NotificationInput): AppNotification[] {
  const since = addDays(today, -RULES.unusualWithinDays);
  const expenses = transactions.filter((t) => t.type === 'EXPENSE');
  return expenses.flatMap((t) => {
    if (t.date < since || t.date > today || t.amount < RULES.unusualMinAmount || t.ruleId) return [];
    const history = expenses
      .filter(
        (o) => o.id !== t.id && o.categoryId === t.categoryId && o.date < t.date && o.date >= addDays(t.date, -180),
      )
      .map((o) => toPaise(o.amount));
    if (history.length < RULES.unusualMinHistory) return [];
    const usual = median(history);
    const multiple = toPaise(t.amount) / usual;
    if (multiple < RULES.unusualMultiple) return [];
    const category = findCategory(t.categoryId)?.name ?? 'this category';
    return [
      {
        id: `unusual:${t.id}`,
        kind: 'UNUSUAL_SPEND' as const,
        tone: 'warn' as const,
        icon: 'trending_up',
        title: `${format(t.amount)} on ${nameOf(t)} is ${Math.floor(multiple)}× your usual ${category} payment`,
        body: 'If this wasn’t you, check with your bank.',
        date: t.date,
        action: categoryLink(t.categoryId),
      },
    ];
  });
}

function loggingNudge({ today, transactions }: NotificationInput): AppNotification[] {
  const manual = transactions.filter((t) => !t.ruleId);
  if (manual.length === 0) return [];
  const latest = manual.reduce((max, t) => (t.date > max ? t.date : max), manual[0].date);
  const quiet = daysBetween(latest, today);
  if (quiet < RULES.quietDays) return [];
  return [
    {
      id: `nudge:${today}`,
      kind: 'LOGGING_NUDGE',
      tone: 'info',
      icon: 'add_photo_alternate',
      title: `Nothing logged for ${quiet} days`,
      body: 'Catch up in a minute by importing screenshots of your UPI history.',
      date: today,
      action: { label: 'Catch up', path: '/transactions' },
    },
  ];
}

const TONE_ORDER = { danger: 0, warn: 1, info: 2, ok: 3 } as const;

/**
 * Everything worth telling the person right now, newest first and most serious first
 * within a day. Pure: the notification service adds read/dismissed state.
 */
export function buildNotifications(input: NotificationInput): AppNotification[] {
  const { newMonth, recap } = monthStart(input);
  const all: AppNotification[] = [
    ...billsDue(input),
    ...budgetAlerts(input),
    ...newMonth,
    ...recap,
    ...recurringAdded(input),
    ...unusualSpending(input),
    ...loggingNudge(input),
  ];
  return all
    .filter((n) => input.enabled[n.kind])
    .sort((a, b) => b.date.localeCompare(a.date) || TONE_ORDER[a.tone] - TONE_ORDER[b.tone])
    .slice(0, RULES.maxShown);
}
