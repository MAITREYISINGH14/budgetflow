import { BudgetView } from '../models';
import { buildBudgetAlerts, progressWidth } from './budget-display';

function budget(overrides: Partial<BudgetView>): BudgetView {
  return {
    id: '1',
    categoryId: 'food',
    category: { id: 'food', name: 'Food', type: 'EXPENSE' },
    month: 10,
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

describe('progressWidth', () => {
  it('clamps the bar to 0-100', () => {
    expect(progressWidth(82)).toBe(82);
    expect(progressWidth(140)).toBe(100);
    expect(progressWidth(-5)).toBe(0);
    expect(progressWidth(Number.NaN)).toBe(0);
  });
});

describe('buildBudgetAlerts', () => {
  it('lists exceeded budgets first, then near-limit ones by usage', () => {
    const alerts = buildBudgetAlerts(
      [
        budget({ id: '1', status: 'NEAR_LIMIT', percentageUsed: 82 }),
        budget({ id: '2', status: 'HEALTHY', percentageUsed: 40 }),
        budget({ id: '3', status: 'EXCEEDED', remaining: -2300, category: { id: 'shopping', name: 'Shopping', type: 'EXPENSE' } }),
        budget({ id: '4', status: 'NEAR_LIMIT', percentageUsed: 99.3, category: { id: 'bills', name: 'Bills', type: 'EXPENSE' } }),
      ],
      format,
    );

    expect(alerts.map((a) => a.message)).toEqual([
      'Shopping budget has been exceeded by ₹2,300.',
      'Bills spending has reached 99% of your monthly budget.',
      'Food spending has reached 82% of your monthly budget.',
    ]);
    expect(alerts[0].tone).toBe('danger');
  });

  it('returns nothing when every budget is healthy', () => {
    expect(buildBudgetAlerts([budget({}), budget({ id: '2', status: 'NO_LIMIT' })], format)).toEqual([]);
  });
});
