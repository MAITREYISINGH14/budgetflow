import { Transaction } from '../models';
import {
  guessCategory,
  ImportRow,
  markDuplicates,
  resolveDate,
  rowProblem,
  rowsToPayloads,
  stripPersonalInfo,
  toImportRows,
} from './screenshot-import';

const TODAY = '2026-11-12';

function parsed(overrides: Record<string, unknown> = {}) {
  return {
    image: 0,
    name: 'Swiggy',
    amount: 452,
    direction: 'debit',
    status: 'success',
    dateText: 'Yesterday',
    date: '2026-11-11',
    partial: false,
    categoryHint: 'food',
    ...overrides,
  };
}

describe('toImportRows', () => {
  it('turns a clean row into a ticked expense', () => {
    expect(toImportRows([parsed()], TODAY)).toEqual([
      {
        key: 'row-0',
        include: true,
        reason: null,
        valid: true,
        type: 'EXPENSE',
        amount: 452,
        date: '2026-11-11',
        description: 'Swiggy',
        categoryId: 'food',
        status: 'success',
      },
    ]);
  });

  it('reads credits as income with an income category', () => {
    const [row] = toImportRows([parsed({ name: 'Rahul', direction: 'credit', categoryHint: 'food' })], TODAY);
    expect(row.type).toBe('INCOME');
    expect(row.categoryId).toBe('other-income');
  });

  it('unticks failed, pending, refunded and cut-off rows with a reason', () => {
    const rows = toImportRows(
      [
        parsed({ status: 'failed' }),
        parsed({ status: 'pending' }),
        parsed({ status: 'refunded' }),
        parsed({ partial: true }),
      ],
      TODAY,
    );
    expect(rows.map((r) => [r.include, r.reason])).toEqual([
      [false, 'Failed payment'],
      [false, 'Still pending'],
      [false, 'Refunded'],
      [false, 'Cut off in the screenshot'],
    ]);
  });

  it('asks for a date when the model could not read one', () => {
    const [row] = toImportRows([parsed({ date: null })], TODAY);
    expect(row).toMatchObject({ include: false, valid: false, reason: 'Date unclear: pick one', date: TODAY });
  });

  it('drops rows without a usable amount and coerces numbers', () => {
    const rows = toImportRows([parsed({ amount: 0 }), parsed({ amount: 'abc' }), parsed({ amount: '99.999' })], TODAY);
    expect(rows.map((r) => r.amount)).toEqual([100]);
  });

  it('ignores anything that is not a list', () => {
    expect(toImportRows({ rows: 'nope' }, TODAY)).toEqual([]);
    expect(toImportRows(null, TODAY)).toEqual([]);
  });
});

describe('resolveDate', () => {
  it('keeps real past dates', () => {
    expect(resolveDate('2026-11-12', TODAY)).toBe('2026-11-12');
  });

  it('moves a date after today back a year (a heading like "12 Dec" seen in November)', () => {
    expect(resolveDate('2026-12-12', TODAY)).toBe('2025-12-12');
    expect(resolveDate('2028-02-29', '2028-01-10')).toBe('2027-02-28');
  });

  it('rejects impossible or implausibly old dates', () => {
    expect(resolveDate('2026-02-30', TODAY)).toBeNull();
    expect(resolveDate('2020-01-01', TODAY)).toBeNull();
    expect(resolveDate('Yesterday', TODAY)).toBeNull();
  });
});

describe('stripPersonalInfo', () => {
  it('removes UPI IDs, phone numbers and masked account numbers', () => {
    expect(stripPersonalInfo('Rahul Sharma rahul.s@okaxis')).toBe('Rahul Sharma');
    expect(stripPersonalInfo('Paid to +91 98765 43210')).toBe('Paid to');
    expect(stripPersonalInfo('HDFC XXXX1234 transfer')).toBe('HDFC transfer');
    expect(stripPersonalInfo('Amazon Pay')).toBe('Amazon Pay');
  });
});

describe('guessCategory', () => {
  it('prefers known merchants over the model hint', () => {
    expect(guessCategory('Zomato Ltd', 'EXPENSE', 'shopping')).toBe('food');
    expect(guessCategory('Swiggy Instamart', 'EXPENSE', 'other-expense')).toBe('food');
    expect(guessCategory('Uber India', 'EXPENSE', 'other-expense')).toBe('transport');
    expect(guessCategory('Airtel Prepaid', 'EXPENSE', 'other-expense')).toBe('bills');
    expect(guessCategory('Netflix', 'EXPENSE', 'entertainment')).toBe('subscriptions');
  });

  it('falls back to a hint of the right type, then Other', () => {
    expect(guessCategory('Sharma General', 'EXPENSE', 'healthcare')).toBe('healthcare');
    expect(guessCategory('Sharma General', 'EXPENSE', 'salary')).toBe('other-expense');
    expect(guessCategory('ACME PAYROLL', 'INCOME', 'other-income')).toBe('salary');
  });
});

describe('markDuplicates', () => {
  const row = (overrides: Partial<ImportRow> = {}): ImportRow => ({
    key: 'row-0',
    include: true,
    reason: null,
    valid: true,
    type: 'EXPENSE',
    amount: 452,
    date: '2026-11-11',
    description: 'Swiggy',
    categoryId: 'food',
    status: 'success',
    ...overrides,
  });

  it('unticks the second copy from overlapping screenshots', () => {
    const result = markDuplicates([row(), row({ key: 'row-1', description: 'SWIGGY' })], []);
    expect(result.map((r) => [r.include, r.reason])).toEqual([
      [true, null],
      [false, 'Appears twice in these screenshots'],
    ]);
  });

  it('unticks rows that match a saved transaction on date, type and amount', () => {
    const saved: Transaction = {
      id: '1',
      type: 'EXPENSE',
      amount: 452,
      categoryId: 'food',
      description: 'Dinner',
      date: '2026-11-11',
      createdAt: '',
      updatedAt: '',
    };
    expect(markDuplicates([row()], [saved])[0]).toMatchObject({ include: false, reason: 'Already added' });
  });

  it('keeps different payments that happen to share an amount on other days', () => {
    expect(markDuplicates([row(), row({ key: 'row-1', date: '2026-11-10' })], []).every((r) => r.include)).toBe(true);
  });
});

describe('rowProblem and rowsToPayloads', () => {
  const good = { amount: 452, date: '2026-11-11', type: 'EXPENSE' as const, categoryId: 'food' };

  it('checks amount, date and category like the transaction form', () => {
    expect(rowProblem(good, TODAY)).toBeNull();
    expect(rowProblem({ ...good, amount: 0 }, TODAY)).toBe('Enter an amount above 0');
    expect(rowProblem({ ...good, amount: 1.234 }, TODAY)).toBe('Use at most 2 decimal places');
    expect(rowProblem({ ...good, date: '2026-11-13' }, TODAY)).toBe('Pick a date up to today');
    expect(rowProblem({ ...good, categoryId: 'salary' }, TODAY)).toBe('Pick a category');
  });

  it('saves only ticked rows that pass the checks', () => {
    const rows = toImportRows([parsed(), parsed({ name: 'Uber', amount: 230 }), parsed({ status: 'failed' })], TODAY);
    rows[1] = { ...rows[1], date: '2026-12-01' };
    expect(rowsToPayloads(rows, TODAY)).toEqual([
      { type: 'EXPENSE', amount: 452, categoryId: 'food', description: 'Swiggy', date: '2026-11-11' },
    ]);
  });
});
