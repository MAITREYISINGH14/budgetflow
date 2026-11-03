import { normalizeList, ruleToRow, toBudget, toRecurringRule, toTransaction } from './normalize';

describe('toTransaction', () => {
  const valid = {
    id: '7',
    type: 'EXPENSE',
    amount: '250.50',
    categoryId: 'food',
    description: 'Lunch',
    date: '2026-09-01T00:00:00Z',
    createdAt: 'x',
    updatedAt: 'y',
  };

  it('accepts a valid record and coerces types', () => {
    expect(toTransaction(valid)).toEqual({
      id: '7',
      type: 'EXPENSE',
      amount: 250.5,
      categoryId: 'food',
      description: 'Lunch',
      date: '2026-09-01',
      createdAt: 'x',
      updatedAt: 'y',
    });
  });

  it.each([
    ['a missing id', { id: undefined }],
    ['an empty id', { id: '  ' }],
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
    expect(toBudget({ id: '1', categoryId: 'food', month: '9', year: 2026, limit: 0 })).toMatchObject({
      month: 9,
      limit: 0,
    });
  });

  it('rejects income categories and invalid months', () => {
    expect(toBudget({ id: '1', categoryId: 'salary', month: 9, year: 2026, limit: 100 })).toBeNull();
    expect(toBudget({ id: '1', categoryId: 'food', month: 13, year: 2026, limit: 100 })).toBeNull();
  });
});

describe('normalizeList', () => {
  it('skips rows that are not BudgetFlow records, such as MockAPI sample data', () => {
    const rows = [
      { id: '1', name: 'Sample', avatar: 'x' },
      { id: '2', type: 'INCOME', amount: 100, categoryId: 'salary', date: '2026-09-01' },
    ];
    expect(normalizeList(rows, toTransaction).map((t) => t.id)).toEqual(['2']);
  });

  it('returns an empty list for a non-array body', () => {
    expect(normalizeList({ message: 'Not found' }, toTransaction)).toEqual([]);
  });
});

describe('recurring rule rows', () => {
  const row = {
    id: '50',
    kind: 'RULE',
    type: 'EXPENSE',
    amount: '649',
    categoryId: 'subscriptions',
    description: 'Netflix',
    date: '2026-09-05',
    repeatDay: '5',
    repeatUntil: '',
    repeatSkip: '2026-10, nonsense ,2026-12',
    createdAt: 'x',
    updatedAt: 'y',
  };

  it('is a rule, never a transaction', () => {
    expect(toTransaction(row)).toBeNull();
    expect(toRecurringRule(row)).toEqual({
      id: '50',
      type: 'EXPENSE',
      amount: 649,
      categoryId: 'subscriptions',
      description: 'Netflix',
      startDate: '2026-09-05',
      day: 5,
      until: null,
      skip: ['2026-10', '2026-12'],
      createdAt: 'x',
      updatedAt: 'y',
    });
  });

  it('rejects a rule with an impossible day', () => {
    expect(toRecurringRule({ ...row, repeatDay: 32 })).toBeNull();
    expect(toRecurringRule({ ...row, repeatDay: 0 })).toBeNull();
  });

  it('round-trips through the stored row shape', () => {
    const rule = toRecurringRule({ ...row, repeatUntil: '2027-03' })!;
    expect(toRecurringRule({ ...ruleToRow(rule), id: '50', createdAt: 'x', updatedAt: 'y' })).toEqual(rule);
  });

  it('keeps the rule link on transactions it created', () => {
    const t = toTransaction({
      id: '61',
      type: 'EXPENSE',
      amount: 649,
      categoryId: 'subscriptions',
      date: '2026-10-05',
      ruleId: '50',
    });
    expect(t?.ruleId).toBe('50');
  });
});
