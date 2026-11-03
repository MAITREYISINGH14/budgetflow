import { RecurringRule, Transaction, TransactionPayload, YearMonth } from '../models';
import { compareYearMonth, parseIsoMonth, shiftYearMonth, toIsoMonth, yearMonthOf } from '../utils/dates';

/** How far ahead nextOccurrence looks before giving up (a rule can skip many months). */
const LOOKAHEAD_MONTHS = 36;

type RuleTiming = Pick<RecurringRule, 'startDate' | 'day' | 'until' | 'skip'>;

/** The rule's date in a month; a day the month does not have becomes its last day (31 → 30 Nov, 28/29 Feb). */
export function occurrenceDate(rule: Pick<RecurringRule, 'day'>, { year, month }: YearMonth): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(rule.day, lastDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Months from the rule's first month through `through` (inclusive), respecting `until` but not `skip`. */
function scheduledMonths(rule: RuleTiming, through: YearMonth): YearMonth[] {
  const until = parseIsoMonth(rule.until);
  const last = until && compareYearMonth(until, through) < 0 ? until : through;
  const months: YearMonth[] = [];
  for (let m = yearMonthOf(rule.startDate); compareYearMonth(m, last) <= 0; m = shiftYearMonth(m, 1)) months.push(m);
  return months;
}

/** The first month uses the exact start date; later months use the rule's day. */
function dateIn(rule: RuleTiming, month: YearMonth): string {
  return toIsoMonth(month) === rule.startDate.slice(0, 7) ? rule.startDate : occurrenceDate(rule, month);
}

function existingMonths(ruleId: string, transactions: readonly Transaction[]): Set<string> {
  return new Set(transactions.filter((t) => t.ruleId === ruleId).map((t) => t.date.slice(0, 7)));
}

/** A rule still produces transactions this month or later. */
export function isRuleActive(rule: Pick<RecurringRule, 'until'>, today: string): boolean {
  return rule.until === null || rule.until >= today.slice(0, 7);
}

/**
 * Transactions that should exist by `today` but do not: one per scheduled month whose date
 * has arrived, unless that month was skipped on purpose or already has its transaction.
 * Running it again after the payloads are saved returns nothing, so it is safe to call on
 * every load. A new rule with a past start date gets its earlier months filled in.
 */
export function dueOccurrences(
  rules: readonly RecurringRule[],
  transactions: readonly Transaction[],
  today: string,
): TransactionPayload[] {
  const due: TransactionPayload[] = [];
  for (const rule of rules) {
    const existing = existingMonths(rule.id, transactions);
    for (const month of scheduledMonths(rule, yearMonthOf(today))) {
      const key = toIsoMonth(month);
      const date = dateIn(rule, month);
      if (date > today || existing.has(key) || rule.skip.includes(key)) continue;
      due.push({
        type: rule.type,
        amount: rule.amount,
        categoryId: rule.categoryId,
        description: rule.description,
        date,
        ruleId: rule.id,
      });
    }
  }
  return due.sort((a, b) => a.date.localeCompare(b.date));
}

/** How many transactions a new rule starting on `startDate` would add straight away. */
export function backfillCount(startDate: string, today: string): number {
  const rule: RecurringRule = {
    id: 'new',
    type: 'EXPENSE',
    amount: 1,
    categoryId: 'other-expense',
    description: '',
    startDate,
    day: Number(startDate.slice(8, 10)),
    until: null,
    skip: [],
    createdAt: '',
    updatedAt: '',
  };
  return dueOccurrences([rule], [], today).length;
}

/** The next date after today on which the rule will add a transaction, or null if it has ended. */
export function nextOccurrence(rule: RecurringRule, today: string): string | null {
  const start = yearMonthOf(today);
  const horizon = shiftYearMonth(start, LOOKAHEAD_MONTHS);
  for (const month of scheduledMonths(rule, horizon)) {
    if (compareYearMonth(month, start) < 0 || rule.skip.includes(toIsoMonth(month))) continue;
    const date = dateIn(rule, month);
    if (date > today) return date;
  }
  return null;
}

export interface UpcomingOccurrence {
  rule: RecurringRule;
  date: string;
}

/** Rules that will still add a transaction later in today's month, soonest first. */
export function upcomingThisMonth(
  rules: readonly RecurringRule[],
  transactions: readonly Transaction[],
  today: string,
): UpcomingOccurrence[] {
  const month = today.slice(0, 7);
  return rules
    .flatMap((rule) => {
      const next = nextOccurrence(rule, today);
      if (!next || next.slice(0, 7) !== month || existingMonths(rule.id, transactions).has(month)) return [];
      return [{ rule, date: next }];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 1 → "1st", 22 → "22nd", 13 → "13th". */
export function ordinal(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th'}`;
}
