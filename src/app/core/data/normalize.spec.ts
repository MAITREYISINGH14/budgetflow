import { normalizeList, toBudget, toTransaction } from './normalize';

describe('toTransaction', () => {
  const valid = { id: '7', type: 'EXPENSE', amount: '250.50', categoryId: 'food', description: 'Lunch', date: '2026-09-01T00:00:00Z', createdAt: 'x', updatedAt: 'y' };

  it('accepts a valid record and coerces types', () => {
    expect(toTransaction(valid)).toEqual({
      id: '7', type: 'EXPENSE', amount: 250.5, categoryId: 'food', description: 'Lunch', date: '2026-09-01', createdAt: 'x', updatedAt: 'y',
    });
  });

  it.each([
    ['an unknown type', { type: 'TRANSFER' }],
    ['a category of the other type', { categoryId: 'salary' }],
    ['an unknown category', { categoryId: 'rent' }],
    ['a zero amount', { amount: 0 }],
    ['a non-numeric amount', { amount: 'abc' }],
    ['an impossible date', { date: '2026-02-30' }],
  ])('rejects %s', (_label, change) => {
    expect(toTransaction({ ...valid, ...change })).toBeNull();
  });
});

describe('toBudget', () => {
  it('accepts a valid budget, including a zero limit', () => {
    expect(toBudget({ id: '1', categoryId: 'food', month: '9', year: 2026, limit: 0 })).toMatchObject({ month: 9, limit: 0 });
  });

  it('rejects income categories and invalid months', () => {
    expect(toBudget({ id: '1', categoryId: 'salary', month: 9, year: 2026, limit: 100 })).toBeNull();
    expect(toBudget({ id: '1', categoryId: 'food', month: 13, year: 2026, limit: 100 })).toBeNull();
  });
});

describe('normalizeList', () => {
  it('skips rows that are not BudgetFlow records, such as MockAPI sample data', () => {
    const rows = [{ id: '1', name: 'Sample', avatar: 'x' }, { id: '2', type: 'INCOME', amount: 100, categoryId: 'salary', date: '2026-09-01' }];
    expect(normalizeList(rows, toTransaction).map((t) => t.id)).toEqual(['2']);
  });

  it('returns an empty list for a non-array body', () => {
    expect(normalizeList({ message: 'Not found' }, toTransaction)).toEqual([]);
  });
});
