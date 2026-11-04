import { findCategory } from '../categories';
import { BudgetView, RecurringRule, Transaction } from '../models';
import { buildNotifications, NotificationInput, NotificationKind } from './notifications';

const ALL_ON: Record<NotificationKind, boolean> = {
  BILL_DUE: true,
  BUDGET_OVER: true,
  BUDGET_NEAR: true,
  NEW_MONTH: true,
  RECURRING_ADDED: true,
  UNUSUAL_SPEND: true,
  MONTH_RECAP: true,
  LOGGING_NUDGE: true,
};
const format = (v: number) => `₹${v.toLocaleString('en-IN')}`;

let nextId = 1;
function tx(date: string, amount: number, categoryId = 'shopping', extra: Partial<Transaction> = {}): Transaction {
  const type = findCategory(categoryId)?.type ?? 'EXPENSE';
  return {
    id: String(nextId++),
    type,
    amount,
    categoryId,
    description: '',
    date,
    createdAt: '',
    updatedAt: '',
    ...extra,
  };
}

function budget(overrides: Partial<BudgetView>): BudgetView {
  return {
    id: 'b1',
    categoryId: 'food',
    category: findCategory('food')!,
    month: 11,
    year: 2026,
    limit: 10000,
    spent: 0,
    remaining: 10000,
    percentageUsed: 0,
    status: 'HEALTHY',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

const netflix: RecurringRule = {
  id: 'r1',
  type: 'EXPENSE',
  amount: 649,
  categoryId: 'subscriptions',
  description: 'Netflix',
  startDate: '2026-09-15',
  day: 15,
  until: null,
  skip: [],
  createdAt: '',
  updatedAt: '',
};

function build(overrides: Partial<NotificationInput>) {
  return buildNotifications({
    today: '2026-11-12',
    rules: [],
    transactions: [tx('2026-11-11', 100, 'food')],
    budgets: [],
    format,
    enabled: ALL_ON,
    ...overrides,
  });
}

const kinds = (list: { kind: string }[]) => list.map((n) => n.kind);

describe('buildNotifications', () => {
  it('reminds about a recurring bill a few days before it is due, with a stable id', () => {
    const [bill] = build({ rules: [netflix] });
    expect(bill).toMatchObject({
      id: 'bill:r1:2026-11-15',
      kind: 'BILL_DUE',
      title: 'Netflix ₹649 is due in 3 days',
      date: '2026-11-15',
    });
    expect(build({ rules: [netflix], today: '2026-11-14' })[0].title).toBe('Netflix ₹649 is due tomorrow');
    expect(kinds(build({ rules: [netflix], today: '2026-11-10' }))).not.toContain('BILL_DUE');
    expect(kinds(build({ rules: [{ ...netflix, type: 'INCOME', categoryId: 'salary' }] }))).not.toContain('BILL_DUE');
  });

  it('flags this month’s budgets that are over or near their limit, and only one per budget', () => {
    const list = build({
      budgets: [
        budget({
          id: 'b1',
          status: 'EXCEEDED',
          remaining: -2400,
          categoryId: 'shopping',
          category: findCategory('shopping')!,
        }),
        budget({ id: 'b2', status: 'NEAR_LIMIT', percentageUsed: 82.4, remaining: 1760 }),
        budget({ id: 'b3', status: 'EXCEEDED', remaining: -100, month: 10 }),
      ],
    });
    expect(list.filter((n) => n.kind.startsWith('BUDGET')).map((n) => [n.id, n.title])).toEqual([
      ['budget-over:b1', 'Shopping is ₹2,400 over budget'],
      ['budget-near:b2', 'Food has used 82% of its budget'],
    ]);
    expect(list[0].action?.queryParams).toEqual({ type: 'EXPENSE', category: 'shopping', range: 'this-month' });
  });

  it('offers to set up a new month and recaps the last one during the first week', () => {
    const october = [
      budget({
        id: 'o1',
        month: 10,
        status: 'EXCEEDED',
        remaining: -2000,
        categoryId: 'travel',
        category: findCategory('travel')!,
      }),
    ];
    const transactions = [tx('2026-10-01', 80000, 'salary'), tx('2026-10-10', 40000, 'travel')];
    const list = build({ today: '2026-11-03', budgets: october, transactions });
    const recap = list.find((n) => n.kind === 'MONTH_RECAP');
    expect(list.find((n) => n.kind === 'NEW_MONTH')).toMatchObject({
      id: 'new-month:2026-11',
      title: 'November has no budgets yet',
    });
    expect(recap).toMatchObject({
      id: 'recap:2026-10',
      title: 'October recap: you saved 50% of your income',
      body: 'Travel went ₹2,000 over budget.',
      tone: 'warn',
    });
    // After the first week both are gone (the nudge is off here; the fixture's last entry is old).
    const later = build({
      today: '2026-11-08',
      budgets: october,
      transactions,
      enabled: { ...ALL_ON, LOGGING_NUDGE: false },
    });
    expect(kinds(later)).toEqual([]);
  });

  it('confirms recurring transactions added in the last two days', () => {
    const added = tx('2026-11-11', 649, 'subscriptions', { ruleId: 'r1', description: 'Netflix' });
    const old = tx('2026-11-05', 649, 'subscriptions', { ruleId: 'r1', description: 'Netflix' });
    const list = build({ rules: [{ ...netflix, day: 30 }], transactions: [added, old] });
    expect(list.filter((n) => n.kind === 'RECURRING_ADDED').map((n) => n.title)).toEqual(['Netflix ₹649 was added']);
  });

  it('spots a payment far above the category’s usual amount', () => {
    const history = [tx('2026-09-01', 1500), tx('2026-09-20', 2500), tx('2026-10-05', 2000)];
    const big = tx('2026-11-10', 12000, 'shopping', { description: 'Croma' });
    const [unusual] = build({ transactions: [...history, big] });
    expect(unusual).toMatchObject({
      kind: 'UNUSUAL_SPEND',
      title: '₹12,000 on Croma is 6× your usual Shopping payment',
    });
  });

  it('needs enough history and a meaningful amount before calling anything unusual', () => {
    expect(kinds(build({ transactions: [tx('2026-09-01', 100), tx('2026-11-10', 5000)] }))).toEqual([]);
    const small = [tx('2026-09-01', 100), tx('2026-09-02', 100), tx('2026-09-03', 100), tx('2026-11-10', 900)];
    expect(kinds(build({ transactions: small }))).toEqual([]);
  });

  it('nudges after a quiet spell, ignoring automatic transactions', () => {
    const list = build({
      transactions: [tx('2026-11-07', 100, 'food'), tx('2026-11-11', 649, 'subscriptions', { ruleId: 'gone' })],
    });
    expect(list.find((n) => n.kind === 'LOGGING_NUDGE')).toMatchObject({
      id: 'nudge:2026-11-12',
      title: 'Nothing logged for 5 days',
    });
    expect(kinds(build({ transactions: [tx('2026-11-10', 100, 'food')] }))).toEqual([]);
  });

  it('leaves out kinds the person switched off', () => {
    const list = build({
      rules: [netflix],
      budgets: [budget({ status: 'EXCEEDED', remaining: -10 })],
      enabled: { ...ALL_ON, BILL_DUE: false },
    });
    expect(kinds(list)).toEqual(['BUDGET_OVER']);
  });

  it('shows upcoming and serious items first', () => {
    const list = build({
      rules: [netflix],
      budgets: [
        budget({ id: 'n', status: 'NEAR_LIMIT', percentageUsed: 80 }),
        budget({ id: 'o', status: 'EXCEEDED', remaining: -5 }),
      ],
    });
    expect(kinds(list)).toEqual(['BILL_DUE', 'BUDGET_OVER', 'BUDGET_NEAR']);
  });
});
