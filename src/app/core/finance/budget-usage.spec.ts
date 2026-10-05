import { calculateBudgetUsage } from './budget-usage';

describe('calculateBudgetUsage', () => {
  it('is healthy below 75%', () => {
    expect(calculateBudgetUsage(10000, 5000)).toEqual({ spent: 5000, remaining: 5000, percentageUsed: 50, status: 'HEALTHY' });
  });

  it('is near the limit from exactly 75%', () => {
    expect(calculateBudgetUsage(10000, 7500).status).toBe('NEAR_LIMIT');
    expect(calculateBudgetUsage(10000, 7499.99).status).toBe('HEALTHY');
    expect(calculateBudgetUsage(10000, 8200)).toEqual({ spent: 8200, remaining: 1800, percentageUsed: 82, status: 'NEAR_LIMIT' });
  });

  it('is exceeded at 100% and reports a negative remaining amount', () => {
    expect(calculateBudgetUsage(6000, 6000).status).toBe('EXCEEDED');
    expect(calculateBudgetUsage(6000, 8400)).toEqual({ spent: 8400, remaining: -2400, percentageUsed: 140, status: 'EXCEEDED' });
  });

  it('rounds the displayed percentage down so it never contradicts the status', () => {
    expect(calculateBudgetUsage(2000, 1999.2)).toEqual({ spent: 1999.2, remaining: 0.8, percentageUsed: 99.9, status: 'NEAR_LIMIT' });
  });

  it('reports ₹0 spent when there are no transactions', () => {
    expect(calculateBudgetUsage(2000, 0)).toEqual({ spent: 0, remaining: 2000, percentageUsed: 0, status: 'HEALTHY' });
  });

  it('never divides by a zero limit', () => {
    expect(calculateBudgetUsage(0, 300)).toEqual({ spent: 300, remaining: -300, percentageUsed: 0, status: 'NO_LIMIT' });
  });

  it('keeps paise exact', () => {
    expect(calculateBudgetUsage(0.3, 0.1).remaining).toBe(0.2);
  });
});
