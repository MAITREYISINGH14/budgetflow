import { TransactionView } from '../models';
import { findCategory } from '../categories';
import { DEFAULT_FILTERS } from '../utils/transaction-filters';
import { filterTransactions, paginate, sortTransactions } from './transaction-query';

function view(id: string, type: TransactionView['type'], amount: number, categoryId: string, date: string, description = ''): TransactionView {
  return { id, type, amount, categoryId, category: findCategory(categoryId)!, description, date, createdAt: `${date}T10:00:00Z`, updatedAt: '' };
}

const items = [
  view('1', 'EXPENSE', 250, 'food', '2026-10-02', 'Swiggy dinner'),
  view('2', 'INCOME', 80000, 'salary', '2026-10-01', 'Monthly salary'),
  view('3', 'EXPENSE', 1800, 'transport', '2026-09-15', 'Uber to office'),
  view('4', 'EXPENSE', 4200, 'food', '2026-08-20', 'Groceries'),
  view('5', 'EXPENSE', 250, 'shopping', '2026-10-02', ''),
];
const today = '2026-10-05';

describe('filterTransactions', () => {
  it('returns everything with default filters', () => {
    expect(filterTransactions(items, DEFAULT_FILTERS, today)).toHaveLength(5);
  });

  it('combines filters with AND', () => {
    const result = filterTransactions(items, { ...DEFAULT_FILTERS, type: 'EXPENSE', categoryId: 'food', minAmount: 1000 }, today);
    expect(result.map((t) => t.id)).toEqual(['4']);
  });

  it('searches description and category name, ignoring case', () => {
    expect(filterTransactions(items, { ...DEFAULT_FILTERS, search: 'SWIGGY' }, today).map((t) => t.id)).toEqual(['1']);
    expect(filterTransactions(items, { ...DEFAULT_FILTERS, search: 'food' }, today).map((t) => t.id)).toEqual(['1', '4']);
  });

  it('applies date presets relative to today', () => {
    expect(filterTransactions(items, { ...DEFAULT_FILTERS, range: 'this-month' }, today).map((t) => t.id)).toEqual(['1', '2', '5']);
    expect(filterTransactions(items, { ...DEFAULT_FILTERS, range: 'last-month' }, today).map((t) => t.id)).toEqual(['3']);
  });

  it('treats the amount range as inclusive', () => {
    const result = filterTransactions(items, { ...DEFAULT_FILTERS, minAmount: 250, maxAmount: 250 }, today);
    expect(result.map((t) => t.id)).toEqual(['1', '5']);
  });

  it('returns an empty list when combined filters match nothing', () => {
    expect(filterTransactions(items, { ...DEFAULT_FILTERS, type: 'INCOME', categoryId: 'food' }, today)).toEqual([]);
  });
});

describe('sortTransactions', () => {
  it('sorts newest first by default without mutating the input', () => {
    const copy = [...items];
    expect(sortTransactions(items, 'newest').map((t) => t.date)).toEqual(['2026-10-02', '2026-10-02', '2026-10-01', '2026-09-15', '2026-08-20']);
    expect(items).toEqual(copy);
  });

  it('sorts by amount and breaks ties consistently', () => {
    expect(sortTransactions(items, 'highest').map((t) => t.id)).toEqual(['2', '4', '3', '5', '1']);
    expect(sortTransactions(items, 'lowest').map((t) => t.amount)).toEqual([250, 250, 1800, 4200, 80000]);
  });

  it('sorts oldest first', () => {
    expect(sortTransactions(items, 'oldest')[0].id).toBe('4');
  });
});

describe('paginate', () => {
  it('returns one page with metadata', () => {
    expect(paginate([1, 2, 3, 4, 5], 2, 2)).toEqual({ data: [3, 4], page: 2, limit: 2, total: 5, totalPages: 3 });
  });

  it('handles an empty list', () => {
    expect(paginate([], 1, 15)).toEqual({ data: [], page: 1, limit: 15, total: 0, totalPages: 0 });
  });
});
