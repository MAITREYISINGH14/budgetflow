import { DateRange, YearMonth } from '../models';

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const ISO_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
export const MIN_DATE = '2000-01-01';

export type DateRangePreset = 'all' | 'this-month' | 'last-month' | 'last-3-months' | 'last-6-months' | 'custom';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD (not toISOString, which would use UTC). */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function isValidIsoDate(value: string | null | undefined): value is string {
  if (!value || !ISO_DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function currentYearMonth(now = new Date()): YearMonth {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function yearMonthOf(isoDate: string): YearMonth {
  return { year: Number(isoDate.slice(0, 4)), month: Number(isoDate.slice(5, 7)) };
}

export function shiftYearMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function compareYearMonth(a: YearMonth, b: YearMonth): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

export function toIsoMonth({ year, month }: YearMonth): string {
  return `${year}-${pad(month)}`;
}

export function parseIsoMonth(value: string | null | undefined): YearMonth | null {
  if (!value || !ISO_MONTH_PATTERN.test(value)) return null;
  return yearMonthOf(`${value}-01`);
}

export function monthBounds({ year, month }: YearMonth): DateRange {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { startDate: `${year}-${pad(month)}-01`, endDate: `${year}-${pad(month)}-${pad(lastDay)}` };
}

/** First day of the month `monthsBack` months before `today`'s month, through today. */
export function trailingMonths(today: string, months: number): DateRange {
  const start = shiftYearMonth(yearMonthOf(today), -(months - 1));
  return { startDate: monthBounds(start).startDate, endDate: today };
}

export function resolveDateRange(
  preset: DateRangePreset,
  today: string,
  custom: { from?: string | null; to?: string | null } = {},
): Partial<DateRange> {
  switch (preset) {
    case 'this-month':
      return { startDate: monthBounds(yearMonthOf(today)).startDate, endDate: today };
    case 'last-month':
      return monthBounds(shiftYearMonth(yearMonthOf(today), -1));
    case 'last-3-months':
      return trailingMonths(today, 3);
    case 'last-6-months':
      return trailingMonths(today, 6);
    case 'custom':
      return {
        ...(custom.from ? { startDate: custom.from } : {}),
        ...(custom.to ? { endDate: custom.to } : {}),
      };
    case 'all':
    default:
      return {};
  }
}

const monthFormatters = {
  short: new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' }),
  shortYear: new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
  long: new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
};

/** "2026-05" -> "May 2026" (long), "May" (short) or "May 26" (shortYear). */
export function formatMonth(isoMonth: string, style: keyof typeof monthFormatters = 'long'): string {
  return monthFormatters[style].format(new Date(`${isoMonth}-01T00:00:00Z`));
}

const displayDate = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * "2026-09-01" -> "01 Sep 2026". The date is read as UTC and formatted in UTC so the day
 * never shifts, whatever the browser's timezone is.
 */
export function formatDisplayDate(isoDate: string): string {
  return isValidIsoDate(isoDate) ? displayDate.format(new Date(`${isoDate}T00:00:00Z`)) : isoDate;
}
