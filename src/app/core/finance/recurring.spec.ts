import { RecurringRule, Transaction } from '../models';
import {
  backfillCount,
  dueOccurrences,
  isRuleActive,
  nextOccurrence,
  occurrenceDate,
  ordinal,
  upcomingThisMonth,
} from './recurring';

function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'r1',
    type: 'EXPENSE',
    amount: 649,
    categoryId: 'subscriptions',
    description: 'Netflix',
    startDate: '2026-09-05',
    day: 5,
    until: null,
    skip: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function occurrence(date: string, ruleId = 'r1'): Transaction {
  return {
    id: `t-${date}`,
    type: 'EXPENSE',
    amount: 649,
    categoryId: 'subscriptions',
    description: 'Netflix',
    date,
    createdAt: '',
    updatedAt: '',
    ruleId,
  };
}

describe('occurrenceDate', () => {
  it('uses the last day of shorter months', () => {
    expect(occurrenceDate({ day: 31 }, { year: 2026, month: 11 })).toBe('2026-11-30');
    expect(occurrenceDate({ day: 31 }, { year: 2026, month: 2 })).toBe('2026-02-28');
    expect(occurrenceDate({ day: 30 }, { year: 2028, month: 2 })).toBe('2028-02-29');
    expect(occurrenceDate({ day: 31 }, { year: 2026, month: 12 })).toBe('2026-12-31');
  });
});

describe('dueOccurrences', () => {
  it('fills in every month from the start date up to today', () => {
    const due = dueOccurrences([rule()], [], '2026-11-12');
    expect(due.map((d) => d.date)).toEqual(['2026-09-05', '2026-10-05', '2026-11-05']);
    expect(due[0]).toEqual({
      type: 'EXPENSE',
      amount: 649,
      categoryId: 'subscriptions',
      description: 'Netflix',
      date: '2026-09-05',
      ruleId: 'r1',
    });
  });

  it('waits until the day arrives', () => {
    expect(dueOccurrences([rule({ day: 20, startDate: '2026-10-20' })], [], '2026-11-12').map((d) => d.date)).toEqual([
      '2026-10-20',
    ]);
  });

  it('adds nothing for months that already have their transaction, so it is safe to run again', () => {
    const existing = [occurrence('2026-09-05'), occurrence('2026-10-07'), occurrence('2026-11-05')];
    expect(dueOccurrences([rule()], existing, '2026-11-12')).toEqual([]);
  });

  it('does not bring back a month that was deleted on purpose', () => {
    const due = dueOccurrences([rule({ skip: ['2026-10'] })], [], '2026-11-12');
    expect(due.map((d) => d.date)).toEqual(['2026-09-05', '2026-11-05']);
  });

  it('stops after the until month', () => {
    const due = dueOccurrences([rule({ until: '2026-10' })], [], '2026-12-25');
    expect(due.map((d) => d.date)).toEqual(['2026-09-05', '2026-10-05']);
  });

  it('keeps the exact start date for the first month and the rule day after that', () => {
    const due = dueOccurrences([rule({ startDate: '2026-01-31', day: 31 })], [], '2026-03-31');
    expect(due.map((d) => d.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('only counts transactions that belong to the same rule', () => {
    const due = dueOccurrences([rule()], [occurrence('2026-11-05', 'other')], '2026-11-12');
    expect(due).toHaveLength(3);
  });

  it('crosses the year boundary', () => {
    const due = dueOccurrences([rule({ startDate: '2026-12-01', day: 1 })], [], '2027-02-01');
    expect(due.map((d) => d.date)).toEqual(['2026-12-01', '2027-01-01', '2027-02-01']);
  });
});

describe('backfillCount', () => {
  it('counts the transactions a new rule adds straight away', () => {
    expect(backfillCount('2026-11-12', '2026-11-12')).toBe(1);
    expect(backfillCount('2026-08-15', '2026-11-12')).toBe(3);
  });
});

describe('nextOccurrence', () => {
  it('returns the next date after today', () => {
    expect(nextOccurrence(rule(), '2026-11-12')).toBe('2026-12-05');
    expect(nextOccurrence(rule(), '2026-11-04')).toBe('2026-11-05');
  });

  it('skips skipped months and returns null once the rule has ended', () => {
    expect(nextOccurrence(rule({ skip: ['2026-12'] }), '2026-11-12')).toBe('2027-01-05');
    expect(nextOccurrence(rule({ until: '2026-11' }), '2026-11-12')).toBeNull();
  });

  it('returns the start date for a rule that has not started', () => {
    expect(nextOccurrence(rule({ startDate: '2027-01-05' }), '2026-11-12')).toBe('2027-01-05');
  });
});

describe('upcomingThisMonth', () => {
  it('lists rules that still add a transaction later this month, soonest first', () => {
    const rules = [
      rule({ id: 'rent', day: 28, startDate: '2026-09-28', description: 'Rent' }),
      rule({ id: 'net', day: 20, startDate: '2026-09-20' }),
      rule({ id: 'done', day: 5 }),
    ];
    expect(upcomingThisMonth(rules, [], '2026-11-12').map((u) => [u.rule.id, u.date])).toEqual([
      ['net', '2026-11-20'],
      ['rent', '2026-11-28'],
    ]);
  });
});

describe('isRuleActive', () => {
  it('is active with no end or an end this month or later', () => {
    expect(isRuleActive({ until: null }, '2026-11-12')).toBe(true);
    expect(isRuleActive({ until: '2026-11' }, '2026-11-12')).toBe(true);
    expect(isRuleActive({ until: '2026-10' }, '2026-11-12')).toBe(false);
  });
});

describe('ordinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [31, '31st'],
  ])('%s → %s', (day, text) => {
    expect(ordinal(day as number)).toBe(text);
  });
});
