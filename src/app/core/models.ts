export type TransactionType = 'INCOME' | 'EXPENSE';

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
}

/** A transaction as stored in MockAPI. Amounts are always positive and in INR. */
export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  description: string;
  /** YYYY-MM-DD */
  date: string;
  createdAt: string;
  updatedAt: string;
}

/** A transaction joined with its category, ready for display. */
export interface TransactionView extends Transaction {
  category: Category;
}

export interface TransactionPayload {
  type: TransactionType;
  amount: number;
  categoryId: string;
  description: string;
  date: string;
}

export type TransactionSort = 'newest' | 'oldest' | 'highest' | 'lowest';

export interface Page<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** A budget as stored in MockAPI. */
export interface Budget {
  id: string;
  categoryId: string;
  month: number;
  year: number;
  limit: number;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetPayload {
  categoryId: string;
  month: number;
  year: number;
  limit: number;
}

export type BudgetStatus = 'HEALTHY' | 'NEAR_LIMIT' | 'EXCEEDED' | 'NO_LIMIT';

export interface BudgetUsage {
  spent: number;
  /** Negative when overspent. */
  remaining: number;
  percentageUsed: number;
  status: BudgetStatus;
}

/** A budget with its category and usage for its month. */
export interface BudgetView extends Budget, BudgetUsage {
  category: Category;
}

export interface DateRange {
  /** Inclusive, YYYY-MM-DD */
  startDate: string;
  /** Inclusive, YYYY-MM-DD */
  endDate: string;
}

export interface FinancialSummary {
  income: number;
  expenses: number;
  balance: number;
  savingsRate: number;
  transactionCount: number;
}

export interface CategorySpending {
  categoryId: string;
  name: string;
  total: number;
  percentage: number;
}

export interface MonthlyTrendPoint {
  /** YYYY-MM */
  month: string;
  income: number;
  expenses: number;
  net: number;
}

export type InsightKind =
  | 'BUDGET_EXCEEDED'
  | 'OVERSPENT_INCOME'
  | 'SPENDING_INCREASE'
  | 'SPENDING_DECREASE'
  | 'HIGH_SAVINGS';

export interface Insight {
  kind: InsightKind;
  severity: 'WARNING' | 'POSITIVE';
  category?: string;
  amount?: number;
  percentage?: number;
}

export interface YearMonth {
  year: number;
  /** 1-12 */
  month: number;
}
