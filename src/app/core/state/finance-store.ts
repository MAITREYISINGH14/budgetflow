import { computed, inject, Injectable, signal } from '@angular/core';
import { finalize, forkJoin, from, mergeMap, Observable, scan, tap, throwError } from 'rxjs';
import { findCategory } from '../categories';
import { MOCKAPI_RECORD_LIMIT } from '../config';
import { BudgetApi } from '../data/budget-api';
import { TransactionApi } from '../data/transaction-api';
import { calculateBudgetUsage } from '../finance/budget-usage';
import { buildDemoData } from '../finance/demo-data';
import { ApiError, errorMessage } from '../interceptors/api-error.interceptor';
import { Budget, BudgetPayload, BudgetView, Transaction, TransactionPayload, TransactionView } from '../models';
import { formatMonth, todayIso, toIsoMonth } from '../utils/dates';
import { toPaise } from '../utils/money';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Requests in flight at once during bulk operations; keeps us polite to MockAPI. */
const BULK_CONCURRENCY = 1;

/**
 * The single source of truth for financial data in the app.
 *
 * Transactions and budgets are loaded once from MockAPI and held in signals.
 * Every number the UI shows (summaries, budget usage, charts, insights) is derived
 * from these two lists with computed() and pure functions in core/finance, so all
 * pages always agree. Writes go to the API first and update the signals only after
 * the server confirms (no optimistic updates), so the UI never shows data that
 * failed to save.
 */
@Injectable({ providedIn: 'root' })
export class FinanceStore {
  private readonly transactionApi = inject(TransactionApi);
  private readonly budgetApi = inject(BudgetApi);

  private readonly transactionList = signal<Transaction[]>([]);
  private readonly budgetList = signal<Budget[]>([]);

  readonly status = signal<LoadStatus>('idle');
  readonly error = signal<string | null>(null);

  readonly transactions = this.transactionList.asReadonly();
  readonly budgets = this.budgetList.asReadonly();

  /** Transactions joined with their category, newest first. */
  readonly transactionViews = computed<TransactionView[]>(() =>
    this.transactionList()
      .flatMap((t) => {
        const category = findCategory(t.categoryId);
        return category ? [{ ...t, category }] : [];
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
  );

  /** Expense totals in paise keyed by "categoryId|YYYY-MM"; rebuilt only when transactions change. */
  private readonly monthlyExpenseIndex = computed(() => {
    const index = new Map<string, number>();
    for (const t of this.transactionList()) {
      if (t.type !== 'EXPENSE') continue;
      const key = `${t.categoryId}|${t.date.slice(0, 7)}`;
      index.set(key, (index.get(key) ?? 0) + toPaise(t.amount));
    }
    return index;
  });

  /** Every budget with its usage. "Spent" is always derived, never stored. */
  readonly budgetViews = computed<BudgetView[]>(() => {
    const index = this.monthlyExpenseIndex();
    return this.budgetList().flatMap((budget) => {
      const category = findCategory(budget.categoryId);
      if (!category) return [];
      const key = `${budget.categoryId}|${toIsoMonth(budget)}`;
      const spent = (index.get(key) ?? 0) / 100;
      return [{ ...budget, category, ...calculateBudgetUsage(budget.limit, spent) }];
    });
  });

  /** Loads both resources. Safe to call repeatedly; pass `force` to refetch. */
  load(force = false): void {
    if (this.status() === 'loading' || (this.status() === 'ready' && !force)) return;
    this.status.set('loading');
    this.error.set(null);

    forkJoin({ transactions: this.transactionApi.list(), budgets: this.budgetApi.list() }).subscribe({
      next: ({ transactions, budgets }) => {
        this.transactionList.set(transactions);
        this.budgetList.set(budgets);
        this.status.set('ready');
      },
      error: (error: unknown) => {
        this.error.set(errorMessage(error, 'Unable to load your data.'));
        this.status.set('error');
      },
    });
  }

  // ---------- Transactions ----------

  createTransaction(payload: TransactionPayload): Observable<Transaction> {
    if (this.transactionList().length >= MOCKAPI_RECORD_LIMIT) {
      return throwError(
        () =>
          new ApiError(
            422,
            `The free MockAPI plan stores up to ${MOCKAPI_RECORD_LIMIT} transactions. Delete some to add more.`,
          ),
      );
    }
    return this.transactionApi
      .create(payload)
      .pipe(tap((created) => this.transactionList.update((list) => [...list, created])));
  }

  updateTransaction(id: string, payload: TransactionPayload): Observable<Transaction> {
    const existing = this.transactionList().find((t) => t.id === id);
    if (!existing) return throwError(() => new ApiError(404, 'This transaction no longer exists.'));
    return this.transactionApi
      .update(existing, payload)
      .pipe(tap((updated) => this.transactionList.update((list) => list.map((t) => (t.id === id ? updated : t)))));
  }

  deleteTransaction(id: string): Observable<void> {
    return this.transactionApi
      .delete(id)
      .pipe(tap(() => this.transactionList.update((list) => list.filter((t) => t.id !== id))));
  }

  // ---------- Budgets ----------

  /** MockAPI has no unique constraints, so "one budget per category per month" is enforced here. */
  createBudget(payload: BudgetPayload): Observable<Budget> {
    const duplicate = this.budgetList().some(
      (b) => b.categoryId === payload.categoryId && b.month === payload.month && b.year === payload.year,
    );
    if (duplicate) {
      const name = findCategory(payload.categoryId)?.name ?? 'This';
      return throwError(
        () => new ApiError(409, `A ${name} budget for ${formatMonth(toIsoMonth(payload))} already exists.`),
      );
    }
    if (findCategory(payload.categoryId)?.type !== 'EXPENSE') {
      return throwError(() => new ApiError(400, 'Budgets can only be set for expense categories.'));
    }
    return this.budgetApi.create(payload).pipe(tap((created) => this.budgetList.update((list) => [...list, created])));
  }

  updateBudgetLimit(id: string, limit: number): Observable<Budget> {
    const existing = this.budgetList().find((b) => b.id === id);
    if (!existing) return throwError(() => new ApiError(404, 'This budget no longer exists.'));
    return this.budgetApi
      .updateLimit(existing, limit)
      .pipe(tap((updated) => this.budgetList.update((list) => list.map((b) => (b.id === id ? updated : b)))));
  }

  deleteBudget(id: string): Observable<void> {
    return this.budgetApi.delete(id).pipe(tap(() => this.budgetList.update((list) => list.filter((b) => b.id !== id))));
  }

  // ---------- Bulk operations (Settings page) ----------

  /** Demo records that would be created, for showing counts before confirming. */
  demoDataSize(today = todayIso()): { transactions: number; budgets: number } {
    const demo = buildDemoData(today);
    return { transactions: demo.transactions.length, budgets: this.newDemoBudgets(demo.budgets).length };
  }

  /** Creates the demo records. Emits the number of records written so far. */
  loadDemoData(today = todayIso()): Observable<number> {
    const demo = buildDemoData(today);
    if (this.transactionList().length + demo.transactions.length > MOCKAPI_RECORD_LIMIT) {
      return throwError(
        () =>
          new ApiError(
            422,
            `Demo data adds ${demo.transactions.length} transactions, which would pass MockAPI's limit of ${MOCKAPI_RECORD_LIMIT}. Delete existing data first.`,
          ),
      );
    }

    const jobs: Observable<unknown>[] = [
      ...demo.transactions.map((payload) =>
        this.transactionApi.create(payload).pipe(tap((t) => this.transactionList.update((list) => [...list, t]))),
      ),
      ...this.newDemoBudgets(demo.budgets).map((payload) =>
        this.budgetApi.create(payload).pipe(tap((b) => this.budgetList.update((list) => [...list, b]))),
      ),
    ];
    return this.runBulk(jobs);
  }

  /** Deletes every transaction and budget. Emits the number of records deleted so far. */
  deleteAllData(): Observable<number> {
    const jobs: Observable<unknown>[] = [
      ...this.transactionList().map((t) => this.deleteTransaction(t.id)),
      ...this.budgetList().map((b) => this.deleteBudget(b.id)),
    ];
    return this.runBulk(jobs);
  }

  private newDemoBudgets(budgets: BudgetPayload[]): BudgetPayload[] {
    const existing = new Set(this.budgetList().map((b) => `${b.categoryId}|${b.month}|${b.year}`));
    return budgets.filter((b) => !existing.has(`${b.categoryId}|${b.month}|${b.year}`));
  }

  private runBulk(jobs: Observable<unknown>[]): Observable<number> {
    return from(jobs).pipe(
      mergeMap((job) => job, BULK_CONCURRENCY),
      scan((done) => done + 1, 0),
      finalize(() => this.load(true)),
    );
  }
}
