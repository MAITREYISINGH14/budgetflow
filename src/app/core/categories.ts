import { Category, TransactionType } from './models';

/**
 * Categories are fixed in V1, so they live in code rather than in a third MockAPI
 * resource (the free plan allows two). Ids are stable slugs that are stored on
 * every transaction and budget, so never rename an id; renaming `name` is safe.
 */
export const CATEGORIES: readonly Category[] = [
  { id: 'food', name: 'Food', type: 'EXPENSE' },
  { id: 'transport', name: 'Transport', type: 'EXPENSE' },
  { id: 'shopping', name: 'Shopping', type: 'EXPENSE' },
  { id: 'bills', name: 'Bills', type: 'EXPENSE' },
  { id: 'entertainment', name: 'Entertainment', type: 'EXPENSE' },
  { id: 'healthcare', name: 'Healthcare', type: 'EXPENSE' },
  { id: 'education', name: 'Education', type: 'EXPENSE' },
  { id: 'travel', name: 'Travel', type: 'EXPENSE' },
  { id: 'subscriptions', name: 'Subscriptions', type: 'EXPENSE' },
  { id: 'other-expense', name: 'Other', type: 'EXPENSE' },
  { id: 'salary', name: 'Salary', type: 'INCOME' },
  { id: 'freelance', name: 'Freelance', type: 'INCOME' },
  { id: 'bonus', name: 'Bonus', type: 'INCOME' },
  { id: 'investment', name: 'Investment', type: 'INCOME' },
  { id: 'other-income', name: 'Other', type: 'INCOME' },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function findCategory(id: string | null | undefined): Category | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function categoriesFor(type: TransactionType | null): Category[] {
  return type ? CATEGORIES.filter((c) => c.type === type) : [...CATEGORIES];
}

export const EXPENSE_CATEGORIES = categoriesFor('EXPENSE');
