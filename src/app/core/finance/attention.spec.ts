import { BudgetView, Insight } from '../models';
import { attentionItems, MAX_ATTENTION_ITEMS } from './attention';

function budget(overrides: Partial<BudgetView>): BudgetView {
  return {
    id: '1',
    categoryId: 'food',
    category: { id: 'food', name: 'Food', type: 'EXPENSE' },
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

const format = (value: number) => `₹${value.toLocaleString('en-IN')}`;
const shopping = { id: 'shopping', name: 'Shopping', type: 'EXPENSE' as const };
const bills = { id: 'bills', name: 'Bills', type: 'EXPENSE' as const };

describe('attentionItems', () => {
  it('ranks over-budget first, then near-limit by usage, then insights', () => {
    const items = attentionItems(
      [
        budget({ id: '1', status: 'NEAR_LIMIT', percentageUsed: 82 }),
        budget({ id: '2', status: 'HEALTHY', percentageUsed: 40 }),
        budget({ id: '3', categoryId: 'shopping', category: shopping, status: 'EXCEEDED', remaining: -2400 }),
        budget({ id: '4', categoryId: 'bills', category: bills, status: 'NEAR_LIMIT', percentageUsed: 99.3 }),
      ],
      [{ kind: 'SPENDING_INCREASE', severity: 'WARNING', category: 'Food', percentage: 24 }],
      format,
    );

    expect(items.map((i) => i.message)).toEqual([
      'Shopping is ₹2,400 over budget.',
      'Bills has used 99% of its budget.',
      'Food has used 82% of its budget.',
    ]);
    expect(items.map((i) => i.tone)).toEqual(['danger', 'warn', 'warn']);
  });

  it(`shows at most ${MAX_ATTENTION_ITEMS} items`, () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((id) => budget({ id, status: 'EXCEEDED', remaining: -100 }));
    expect(attentionItems(many, [], format)).toHaveLength(MAX_ATTENTION_ITEMS);
  });

  it('links budget items to that category’s transactions this month', () => {
    const [item] = attentionItems(
      [budget({ id: '3', categoryId: 'shopping', category: shopping, status: 'EXCEEDED', remaining: -2400 })],
      [],
      format,
    );
    expect(item.action).toEqual({
      label: 'View',
      path: '/transactions',
      queryParams: { type: 'EXPENSE', category: 'shopping', range: 'this-month' },
    });
  });

  it('does not repeat an exceeded budget that is also an insight, and skips good news', () => {
    const insights: Insight[] = [
      { kind: 'BUDGET_EXCEEDED', severity: 'WARNING', category: 'Shopping', amount: 2400 },
      { kind: 'HIGH_SAVINGS', severity: 'POSITIVE', percentage: 70 },
      { kind: 'SPENDING_DECREASE', severity: 'POSITIVE', category: 'Transport', percentage: 45 },
    ];
    const items = attentionItems(
      [budget({ id: '3', categoryId: 'shopping', category: shopping, status: 'EXCEEDED', remaining: -2400 })],
      insights,
      format,
    );
    expect(items).toHaveLength(1);
  });

  it('words overspending with the period and orders increases by size', () => {
    const items = attentionItems(
      [],
      [
        { kind: 'SPENDING_INCREASE', severity: 'WARNING', category: 'Food', percentage: 24 },
        { kind: 'SPENDING_INCREASE', severity: 'WARNING', category: 'Shopping', percentage: 61 },
        { kind: 'OVERSPENT_INCOME', severity: 'WARNING', amount: 1500 },
      ],
      format,
      'this month',
    );
    expect(items.map((i) => i.message)).toEqual([
      'You spent ₹1,500 more than you earned this month.',
      'Shopping spending increased by 61% compared with the previous month.',
      'Food spending increased by 24% compared with the previous month.',
    ]);
    expect(items[1].action.path).toBe('/analytics');
    expect(items[1].key).toBe('up-shopping');
  });

  it('shows the amounts behind budget items, and nothing extra for the rest', () => {
    const items = attentionItems(
      [
        budget({
          id: '3',
          categoryId: 'shopping',
          category: shopping,
          status: 'EXCEEDED',
          limit: 6000,
          spent: 8400,
          remaining: -2400,
        }),
        budget({
          id: '4',
          categoryId: 'bills',
          category: bills,
          status: 'NEAR_LIMIT',
          limit: 7000,
          spent: 6950,
          remaining: 50,
          percentageUsed: 99.2,
        }),
      ],
      [{ kind: 'OVERSPENT_INCOME', severity: 'WARNING', amount: 1500 }],
      format,
    );
    expect(items.map((i) => i.detail)).toEqual(['₹8,400 of ₹6,000', '₹6,950 of ₹7,000', undefined]);
  });

  it('is empty when nothing needs attention', () => {
    expect(attentionItems([budget({}), budget({ id: '2', status: 'NO_LIMIT' })], [], format)).toEqual([]);
  });
});
