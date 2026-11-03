import { findCategory } from '../categories';
import { Budget, RecurringRule, RecurringRulePayload, Transaction } from '../models';
import { ISO_MONTH_PATTERN, isValidIsoDate } from '../utils/dates';

type Raw = Record<string, unknown>;

/** MockAPI ids are numeric strings; a row without one cannot be edited or deleted, so it is skipped. */
function idOf(raw: Raw): string | null {
  const id = raw['id'];
  return (typeof id === 'string' && id.trim() !== '') || typeof id === 'number' ? String(id) : null;
}

/**
 * MockAPI stores whatever JSON it is sent and may hand back numbers as strings or
 * include its own sample fields. Everything coming in is checked here, and rows that
 * are not valid BudgetFlow records are skipped instead of breaking the UI.
 */
/** Rows with this kind are recurring rules, not money. */
export const RULE_KIND = 'RULE';

export function toTransaction(raw: Raw): Transaction | null {
  if (raw['kind'] === RULE_KIND) return null;
  const type = raw['type'];
  const amount = Number(raw['amount']);
  const categoryId = String(raw['categoryId'] ?? '');
  const date = String(raw['date'] ?? '').slice(0, 10);
  const category = findCategory(categoryId);
  const id = idOf(raw);

  if (id === null) return null;
  if ((type !== 'INCOME' && type !== 'EXPENSE') || !category || category.type !== type) return null;
  if (!Number.isFinite(amount) || amount <= 0 || !isValidIsoDate(date)) return null;

  return {
    id,
    type,
    amount: Math.round(amount * 100) / 100,
    categoryId,
    description: typeof raw['description'] === 'string' ? raw['description'] : '',
    date,
    createdAt: String(raw['createdAt'] ?? ''),
    updatedAt: String(raw['updatedAt'] ?? ''),
    ...(typeof raw['ruleId'] === 'string' && raw['ruleId'] !== '' ? { ruleId: raw['ruleId'] } : {}),
  };
}

/**
 * A rule row: the same money fields as a transaction plus `repeatDay`, `repeatUntil`
 * (YYYY-MM or empty) and `repeatSkip` (comma-separated YYYY-MM). Flat strings and numbers
 * keep the row compatible with a plain MockAPI schema.
 */
export function toRecurringRule(raw: Raw): RecurringRule | null {
  if (raw['kind'] !== RULE_KIND) return null;
  const base = toTransaction({ ...raw, kind: undefined, ruleId: undefined });
  const day = Number(raw['repeatDay']);
  if (!base || !Number.isInteger(day) || day < 1 || day > 31) return null;
  const until = String(raw['repeatUntil'] ?? '');
  const skip = String(raw['repeatSkip'] ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter((m) => ISO_MONTH_PATTERN.test(m));
  return {
    id: base.id,
    type: base.type,
    amount: base.amount,
    categoryId: base.categoryId,
    description: base.description,
    startDate: base.date,
    day,
    until: ISO_MONTH_PATTERN.test(until) ? until : null,
    skip,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
  };
}

/** The row MockAPI stores for a rule (see toRecurringRule). */
export function ruleToRow(rule: RecurringRulePayload): Record<string, unknown> {
  return {
    kind: RULE_KIND,
    type: rule.type,
    amount: rule.amount,
    categoryId: rule.categoryId,
    description: rule.description,
    date: rule.startDate,
    repeatDay: rule.day,
    repeatUntil: rule.until ?? '',
    repeatSkip: rule.skip.join(','),
  };
}

export function toBudget(raw: Raw): Budget | null {
  const categoryId = String(raw['categoryId'] ?? '');
  const month = Number(raw['month']);
  const year = Number(raw['year']);
  const limit = Number(raw['limit']);
  const id = idOf(raw);

  if (id === null) return null;
  if (findCategory(categoryId)?.type !== 'EXPENSE') return null;
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) return null;
  if (!Number.isFinite(limit) || limit < 0) return null;

  return {
    id,
    categoryId,
    month,
    year,
    limit: Math.round(limit * 100) / 100,
    createdAt: String(raw['createdAt'] ?? ''),
    updatedAt: String(raw['updatedAt'] ?? ''),
  };
}

export function normalizeList<T>(raw: unknown, map: (row: Raw) => T | null): T[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    const item = row && typeof row === 'object' ? map(row as Raw) : null;
    return item ? [item] : [];
  });
}
