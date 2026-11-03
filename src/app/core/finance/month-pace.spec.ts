import { monthPace } from './month-pace';

const demoBudgets = [
  { categoryId: 'food', limit: 10000, spent: 8200 },
  { categoryId: 'transport', limit: 5000, spent: 2100 },
  { categoryId: 'shopping', limit: 6000, spent: 8400 },
  { categoryId: 'entertainment', limit: 3000, spent: 1500 },
  { categoryId: 'bills', limit: 7000, spent: 6950 },
  { categoryId: 'subscriptions', limit: 2000, spent: 1497 },
  { categoryId: 'healthcare', limit: 2000, spent: 0 },
];

describe('monthPace', () => {
  it('measures against budgets when any budget has a limit', () => {
    const pace = monthPace({ today: '2026-11-12', budgets: demoBudgets, income: 95000, expenses: 28647 });
    expect(pace).toEqual({
      basis: 'BUDGET',
      planned: 35000,
      spent: 28647,
      left: 6353,
      daysLeft: 19,
      dayOfMonth: 12,
      daysInMonth: 30,
      stillDue: 0,
      perDay: 334,
      usedPercent: 81.8,
      elapsedPercent: 40,
      status: 'AHEAD',
    });
  });

  it('ignores zero-limit budgets and spending outside budgeted categories', () => {
    const pace = monthPace({
      today: '2026-11-15',
      budgets: [
        { categoryId: 'food', limit: 10000, spent: 4000 },
        { categoryId: 'food', limit: 0, spent: 9999 },
      ],
      income: 0,
      expenses: 20000,
    });
    expect(pace.basis).toBe('BUDGET');
    expect(pace.planned).toBe(10000);
    expect(pace.spent).toBe(4000);
    expect(pace.status).toBe('ON_PACE');
  });

  it('falls back to income when no budget has a limit', () => {
    const pace = monthPace({
      today: '2026-02-28',
      budgets: [{ categoryId: 'food', limit: 0, spent: 500 }],
      income: 50000,
      expenses: 20000,
    });
    expect(pace.basis).toBe('INCOME');
    expect(pace.left).toBe(30000);
    expect(pace.daysLeft).toBe(1);
    expect(pace.perDay).toBe(30000);
    expect(pace.elapsedPercent).toBe(100);
  });

  it('reports NONE with no budgets and no income', () => {
    const pace = monthPace({ today: '2026-11-01', budgets: [], income: 0, expenses: 1200 });
    expect(pace.basis).toBe('NONE');
    expect(pace.status).toBe('NONE');
    expect(pace.perDay).toBeNull();
    expect(pace.spent).toBe(1200);
  });

  it('is OVER once spending reaches the plan, with nothing left per day', () => {
    const pace = monthPace({
      today: '2026-11-20',
      budgets: [{ categoryId: 'food', limit: 5000, spent: 5000.01 }],
      income: 0,
      expenses: 0,
    });
    expect(pace.status).toBe('OVER');
    expect(pace.left).toBe(-0.01);
    expect(pace.perDay).toBe(0);
  });

  it('allows a small lead before calling it ahead of pace', () => {
    // Day 15 of 30 is 50%; 55% used is within the tolerance, 55.1% is not.
    const within = monthPace({
      today: '2026-11-15',
      budgets: [{ categoryId: 'food', limit: 1000, spent: 550 }],
      income: 0,
      expenses: 0,
    });
    const ahead = monthPace({
      today: '2026-11-15',
      budgets: [{ categoryId: 'food', limit: 1000, spent: 551 }],
      income: 0,
      expenses: 0,
    });
    expect(within.status).toBe('ON_PACE');
    expect(ahead.status).toBe('AHEAD');
  });

  it('sums in paise', () => {
    const pace = monthPace({
      today: '2026-11-10',
      budgets: [
        { categoryId: 'food', limit: 0.1, spent: 0.1 },
        { categoryId: 'food', limit: 0.2, spent: 0.1 },
      ],
      income: 0,
      expenses: 0,
    });
    expect(pace.planned).toBe(0.3);
    expect(pace.left).toBe(0.1);
  });

  it('keeps room for recurring bills still due this month in the daily allowance', () => {
    const pace = monthPace({
      today: '2026-11-21',
      budgets: [{ categoryId: 'bills', limit: 10000, spent: 4000 }],
      income: 0,
      expenses: 0,
      upcoming: [
        { categoryId: 'bills', amount: 2000 },
        // Not budgeted, so it does not come out of the budgets' money.
        { categoryId: 'travel', amount: 5000 },
      ],
    });
    expect(pace.left).toBe(6000);
    expect(pace.stillDue).toBe(2000);
    expect(pace.perDay).toBe(400); // (6000 - 2000) / 10 days
  });

  it('counts every upcoming expense against income', () => {
    const pace = monthPace({
      today: '2026-11-21',
      budgets: [],
      income: 50000,
      expenses: 30000,
      upcoming: [{ categoryId: 'travel', amount: 5000 }],
    });
    expect(pace.stillDue).toBe(5000);
    expect(pace.perDay).toBe(1500);
  });
});
