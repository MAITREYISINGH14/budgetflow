import { Page, TransactionSort, TransactionView } from '../models';
import { resolveDateRange } from '../utils/dates';
import { TransactionFilters } from '../utils/transaction-filters';

/**
 * Filters combine with AND: each one can only remove rows, never add them back,
 * so no filter can overwrite another. Search is the only OR (description or category).
 */
export function filterTransactions(items: readonly TransactionView[], filters: TransactionFilters, today: string): TransactionView[] {
  const { startDate, endDate } = resolveDateRange(filters.range, today, filters);
  const search = filters.search.trim().toLowerCase();

  return items.filter(
    (t) =>
      (!filters.type || t.type === filters.type) &&
      (!filters.categoryId || t.categoryId === filters.categoryId) &&
      (!startDate || t.date >= startDate) &&
      (!endDate || t.date <= endDate) &&
      (filters.minAmount === null || t.amount >= filters.minAmount) &&
      (filters.maxAmount === null || t.amount <= filters.maxAmount) &&
      (!search || t.description.toLowerCase().includes(search) || t.category.name.toLowerCase().includes(search)),
  );
}

const byNewest = (a: TransactionView, b: TransactionView) =>
  b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

/** Returns a new sorted array. Ties fall back to newest first so the order is stable. */
export function sortTransactions(items: readonly TransactionView[], sort: TransactionSort): TransactionView[] {
  const sorted = [...items];
  switch (sort) {
    case 'oldest':
      return sorted.sort((a, b) => -byNewest(a, b));
    case 'highest':
      return sorted.sort((a, b) => b.amount - a.amount || byNewest(a, b));
    case 'lowest':
      return sorted.sort((a, b) => a.amount - b.amount || byNewest(a, b));
    case 'newest':
    default:
      return sorted.sort(byNewest);
  }
}

/** Slices one page out of a list and returns the same metadata a paginated API would. */
export function paginate<T>(items: readonly T[], page: number, limit: number): Page<T> {
  const total = items.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  return { data: items.slice(start, start + limit), page, limit, total, totalPages };
}
