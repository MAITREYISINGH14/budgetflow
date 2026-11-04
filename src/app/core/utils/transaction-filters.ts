import { findCategory } from '../categories';
import { TransactionSort, TransactionType } from '../models';
import { DateRangePreset, formatDisplayDate, isValidIsoDate } from './dates';
import { formatMoney } from './money';

/**
 * The transactions page treats the URL as the single source of truth for filters:
 *
 *   form change -> router.navigate(queryParams) -> queryParamMap -> parse -> filtered list
 *
 * Refresh, back/forward and shared links all go through the same path.
 */
export interface TransactionFilters {
  search: string;
  type: TransactionType | null;
  categoryId: string | null;
  range: DateRangePreset;
  from: string | null;
  to: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  sort: TransactionSort;
  page: number;
}

export const PAGE_SIZE = 15;

/** Query params for one expense category's transactions this month: the target of every "View" link. */
export function categoryThisMonth(categoryId: string): Record<string, string> {
  return { type: 'EXPENSE', category: categoryId, range: 'this-month' };
}

export const DEFAULT_FILTERS: TransactionFilters = {
  search: '',
  type: null,
  categoryId: null,
  range: 'all',
  from: null,
  to: null,
  minAmount: null,
  maxAmount: null,
  sort: 'newest',
  page: 1,
};

const SORTS: TransactionSort[] = ['newest', 'oldest', 'highest', 'lowest'];
const RANGES: DateRangePreset[] = ['all', 'this-month', 'last-month', 'last-3-months', 'last-6-months', 'custom'];

interface ParamReader {
  get(name: string): string | null;
}

function knownCategory(value: string | null): string | null {
  return findCategory(value) ? value : null;
}

function positiveInt(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n > 0 && Number.isSafeInteger(n) ? n : null;
}

function nonNegativeAmount(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Hand-edited or stale URLs never break the page: unknown values fall back to defaults. */
export function parseTransactionFilters(params: ParamReader): TransactionFilters {
  const type = params.get('type');
  const sort = params.get('sort') as TransactionSort | null;
  const range = params.get('range') as DateRangePreset | null;
  const from = params.get('from');
  const to = params.get('to');

  return {
    search: (params.get('search') ?? '').slice(0, 100),
    type: type === 'INCOME' || type === 'EXPENSE' ? type : null,
    categoryId: knownCategory(params.get('category')),
    range: range && RANGES.includes(range) ? range : 'all',
    from: isValidIsoDate(from) ? from : null,
    to: isValidIsoDate(to) ? to : null,
    minAmount: nonNegativeAmount(params.get('min')),
    maxAmount: nonNegativeAmount(params.get('max')),
    sort: sort && SORTS.includes(sort) ? sort : 'newest',
    page: positiveInt(params.get('page')) ?? 1,
  };
}

/** Only non-default values go into the URL, so links stay short and readable. */
export function toQueryParams(filters: TransactionFilters): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (filters.search.trim()) params['search'] = filters.search.trim();
  if (filters.type) params['type'] = filters.type;
  if (filters.categoryId) params['category'] = filters.categoryId;
  if (filters.range !== 'all') params['range'] = filters.range;
  if (filters.range === 'custom') {
    if (filters.from) params['from'] = filters.from;
    if (filters.to) params['to'] = filters.to;
  }
  if (filters.minAmount !== null) params['min'] = filters.minAmount;
  if (filters.maxAmount !== null) params['max'] = filters.maxAmount;
  if (filters.sort !== 'newest') params['sort'] = filters.sort;
  if (filters.page > 1) params['page'] = filters.page;
  return params;
}

/** Problems that make a filter combination impossible; shown inline instead of sent to the API. */
export function findFilterProblem(
  filters: Pick<TransactionFilters, 'minAmount' | 'maxAmount' | 'range' | 'from' | 'to'>,
): string | null {
  if ((filters.minAmount ?? 0) < 0 || (filters.maxAmount ?? 0) < 0) {
    return 'Amounts cannot be negative.';
  }
  if (filters.minAmount !== null && filters.maxAmount !== null && filters.minAmount > filters.maxAmount) {
    return 'Minimum amount must be less than or equal to the maximum.';
  }
  if (filters.range === 'custom' && filters.from && filters.to && filters.from > filters.to) {
    return 'The start date must be on or before the end date.';
  }
  return null;
}

export function countActiveFilters(filters: TransactionFilters): number {
  return [
    filters.search.trim() !== '',
    filters.type !== null,
    filters.categoryId !== null,
    filters.range !== 'all',
    filters.minAmount !== null || filters.maxAmount !== null,
  ].filter(Boolean).length;
}

export type FilterKey = 'search' | 'type' | 'category' | 'range' | 'amount';

export interface FilterChip {
  key: FilterKey;
  label: string;
}

const RANGE_LABELS: Record<Exclude<DateRangePreset, 'all' | 'custom'>, string> = {
  'this-month': 'This month',
  'last-month': 'Last month',
  'last-3-months': 'Last 3 months',
  'last-6-months': 'Last 6 months',
};

function customRangeLabel(from: string | null, to: string | null): string {
  if (from && to) return `${formatDisplayDate(from)} – ${formatDisplayDate(to)}`;
  if (from) return `From ${formatDisplayDate(from)}`;
  if (to) return `Until ${formatDisplayDate(to)}`;
  return 'Custom dates';
}

/**
 * One removable chip per active filter, in the order of the filter form. Shows at a
 * glance what a link (for example from the dashboard) has filtered the list to.
 * Amounts are labelled in rupees because that is what the filter compares.
 */
export function activeFilterChips(filters: TransactionFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  const search = filters.search.trim();
  if (search) chips.push({ key: 'search', label: `“${search}”` });
  if (filters.type) chips.push({ key: 'type', label: filters.type === 'INCOME' ? 'Income' : 'Expense' });
  const category = findCategory(filters.categoryId);
  if (category) chips.push({ key: 'category', label: category.name });
  if (filters.range === 'custom') chips.push({ key: 'range', label: customRangeLabel(filters.from, filters.to) });
  else if (filters.range !== 'all') chips.push({ key: 'range', label: RANGE_LABELS[filters.range] });

  const { minAmount: min, maxAmount: max } = filters;
  const money = (value: number) => formatMoney(value, 'INR');
  if (min !== null && max !== null) chips.push({ key: 'amount', label: `${money(min)} – ${money(max)}` });
  else if (min !== null) chips.push({ key: 'amount', label: `${money(min)} or more` });
  else if (max !== null) chips.push({ key: 'amount', label: `Up to ${money(max)}` });
  return chips;
}

/** The same filters with one chip's filter cleared, back on the first page. */
export function withoutFilter(filters: TransactionFilters, key: FilterKey): TransactionFilters {
  const next = { ...filters, page: 1 };
  switch (key) {
    case 'search':
      return { ...next, search: '' };
    case 'type':
      // A category belongs to one type, so clearing the type keeps it valid.
      return { ...next, type: null };
    case 'category':
      return { ...next, categoryId: null };
    case 'range':
      return { ...next, range: 'all', from: null, to: null };
    case 'amount':
      return { ...next, minAmount: null, maxAmount: null };
  }
}
