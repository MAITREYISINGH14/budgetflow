import { Budget } from '../models';
import { budgetsToCopy } from './budget-copy';

function budget(categoryId: string, month: number, year: number, limit: number): Budget {
  return { id: `${categoryId}-${month}`, categoryId, month, year, limit, createdAt: '', updatedAt: '' };
}

describe('budgetsToCopy', () => {
  const october = { year: 2026, month: 10 };
  const november = { year: 2026, month: 11 };

  it('copies every budget from the source month into the target month', () => {
    const result = budgetsToCopy(
      [budget('food', 10, 2026, 10000), budget('travel', 10, 2026, 10000)],
      october,
      november,
    );
    expect(result).toEqual([
      { categoryId: 'food', limit: 10000, year: 2026, month: 11 },
      { categoryId: 'travel', limit: 10000, year: 2026, month: 11 },
    ]);
  });

  it('keeps limits already set in the target month', () => {
    const result = budgetsToCopy(
      [budget('food', 10, 2026, 10000), budget('travel', 10, 2026, 10000), budget('food', 11, 2026, 12000)],
      october,
      november,
    );
    expect(result).toEqual([{ categoryId: 'travel', limit: 10000, year: 2026, month: 11 }]);
  });

  it('crosses the year boundary', () => {
    const result = budgetsToCopy(
      [budget('bills', 12, 2026, 7000)],
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
    );
    expect(result).toEqual([{ categoryId: 'bills', limit: 7000, year: 2027, month: 1 }]);
  });

  it('copies nothing when the source month is empty', () => {
    expect(budgetsToCopy([budget('food', 11, 2026, 10000)], october, november)).toEqual([]);
  });
});
