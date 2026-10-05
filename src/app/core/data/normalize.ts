import { findCategory } from '../categories';
import { Budget, Transaction } from '../models';
import { isValidIsoDate } from '../utils/dates';

type Raw = Record<string, unknown>;

/**
 * MockAPI stores whatever JSON it is sent and may hand back numbers as strings or
 * include its own sample fields. Everything coming in is checked here, and rows that
 * are not valid BudgetFlow records are skipped instead of breaking the UI.
 */
export function toTransaction(raw: Raw): Transaction | null {
  const type = raw['type'];
  const amount = Number(raw['amount']);
  const categoryId = String(raw['categoryId'] ?? '');
  const date = String(raw['date'] ?? '').slice(0, 10);
  const category = findCategory(categoryId);

  if ((type !== 'INCOME' && type !== 'EXPENSE') || !category || category.type !== type) return null;
  if (!Number.isFinite(amount) || amount <= 0 || !isValidIsoDate(date)) return null;

  return {
    id: String(raw['id']),
    type,
    amount: Math.round(amount * 100) / 100,
    categoryId,
    description: typeof raw['description'] === 'string' ? raw['description'] : '',
    date,
    createdAt: String(raw['createdAt'] ?? ''),
    updatedAt: String(raw['updatedAt'] ?? ''),
  };
}

export function toBudget(raw: Raw): Budget | null {
  const categoryId = String(raw['categoryId'] ?? '');
  const month = Number(raw['month']);
  const year = Number(raw['year']);
  const limit = Number(raw['limit']);

  if (findCategory(categoryId)?.type !== 'EXPENSE') return null;
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) return null;
  if (!Number.isFinite(limit) || limit < 0) return null;

  return {
    id: String(raw['id']),
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
