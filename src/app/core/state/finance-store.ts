import { computed, inject, Injectable, signal } from '@angular/core';
import {
  concatMap,
  defer,
  finalize,
  forkJoin,
  from,
  map,
  mergeMap,
  Observable,
  of,
  reduce,
  scan,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import { findCategory } from '../categories';
import { MOCKAPI_RECORD_LIMIT } from '../config';
import { BudgetApi } from '../data/budget-api';
import { TransactionApi } from '../data/transaction-api';
import { budgetsToCopy } from '../finance/budget-copy';
import { calculateBudgetUsage } from '../finance/budget-usage';
import { buildDemoData } from '../finance/demo-data';
import { backfillCount, dueOccurrences } from '../finance/recurring';
import { ApiError, errorMessage } from '../interceptors/api-error.interceptor';
import {
  Budget,
  BudgetPayload,
  BudgetView,
  RecurringRule,
  RecurringRulePayload,
  RecurringScope,
  Transaction,
  TransactionPayload,
  TransactionView,
  YearMonth,
} from '../models';
import { formatMonth, shiftYearMonth, todayIso, toIsoMonth, yearMonthOf } from '../utils/dates';
import { toPaise } from '../utils/money';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Requests in flight at once during bulk operations; keeps us polite to MockAPI. */
const BULK_CONCURRENCY = 1;

/**
 * The single source of truth for financial data in the app.
 *
 * Transactions, recurring rules and budgets are loaded once from MockAPI and held in signals.
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
  private readonly ruleList = signal<RecurringRule[]>([]);
  private readonly budgetList = signal<Budget[]>([]);
  private generating = false;

  readonly status = signal<LoadStatus>('idle');
  readonly error = signal<string | null>(null);

  readonly transactions = this.transactionList.asReadonly();
  readonly rules = this.ruleList.asReadonly();
  readonly budgets = this.budgetList.asReadonly();

  /** Rows in the MockAPI transactions resource: rules live there too and count towards its limit. */
  readonly transactionRecordCount = computed(() => this.transactionList().length + this.ruleList().length);

  /** Transactions joined with their category, newest first. */
  readonly transactionViews = computed<TransactionView[]>(() => {
    const ruleIds = new Set(this.ruleList().map((r) => r.id));
    return this.transactionList()
      .flatMap((t) => {
        const category = findCategory(t.categoryId);
        return category ? [{ ...t, category, recurring: !!t.ruleId && ruleIds.has(t.ruleId) }] : [];
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  });

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

    forkJoin({ rows: this.transactionApi.list(), budgets: this.budgetApi.list() }).subscribe({
      next: ({ rows, budgets }) => {
        this.transactionList.set(rows.transactions);
        this.ruleList.set(rows.rules);
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
    if (this.transactionRecordCount() >= MOCKAPI_RECORD_LIMIT) {
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
    if (this.budgetList().length >= MOCKAPI_RECORD_LIMIT) {
      return throwError(
        () =>
          new ApiError(
            422,
            `The free MockAPI plan stores up to ${MOCKAPI_RECORD_LIMIT} budgets. Delete some to add more.`,
          ),
      );
    }
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

  /** Budgets `copyBudgets(from, to)` would create; empty when there is nothing to copy. */
  budgetsToCopy(from: YearMonth, to: YearMonth): BudgetPayload[] {
    return budgetsToCopy(this.budgetList(), from, to);
  }

  /**
   * Copies `from`'s budgets into `to`, skipping categories `to` already has.
   * Emits the number of budgets created so far, like the other bulk operations.
   */
  copyBudgets(from: YearMonth, to: YearMonth): Observable<number> {
    const payloads = this.budgetsToCopy(from, to);
    if (this.budgetList().length + payloads.length > MOCKAPI_RECORD_LIMIT) {
      return throwError(
        () =>
          new ApiError(
            422,
            `Copying would pass MockAPI's limit of ${MOCKAPI_RECORD_LIMIT} budgets. Delete some old budgets first.`,
          ),
      );
    }
    return this.runBulk(
      payloads.map((payload) =>
        this.budgetApi.create(payload).pipe(tap((b) => this.budgetList.update((list) => [...list, b]))),
      ),
    );
  }

  // ---------- Recurring transactions ----------

  /**
   * Creates the transactions recurring rules owe up to `today`, one request at a time.
   * Safe to call repeatedly (on every load and when the date changes): months that
   * already have their transaction are never created twice. Emits once, the number added.
   */
  generateDue(today = todayIso()): Observable<number> {
    return defer(() => {
      if (this.generating || this.status() !== 'ready') return of(0);
      const due = dueOccurrences(this.ruleList(), this.transactionList(), today);
      if (due.length === 0) return of(0);
      if (this.transactionRecordCount() + due.length > MOCKAPI_RECORD_LIMIT) {
        return throwError(
          () =>
            new ApiError(
              422,
              `Recurring transactions could not be added: MockAPI's free plan stores up to ${MOCKAPI_RECORD_LIMIT} transactions.`,
            ),
        );
      }
      this.generating = true;
      return from(due).pipe(
        concatMap((payload) =>
          this.transactionApi.create(payload).pipe(tap((t) => this.transactionList.update((list) => [...list, t]))),
        ),
        reduce((count) => count + 1, 0),
        finalize(() => (this.generating = false)),
      );
    });
  }

  /**
   * Makes a transaction repeat every month on its date's day. Months from its date up to
   * today are added straight away, so a rule that started in August fills in Aug-Nov.
   */
  createRecurring(payload: TransactionPayload, today = todayIso()): Observable<RecurringRule> {
    const added = backfillCount(payload.date, today);
    if (this.transactionRecordCount() + 1 + added > MOCKAPI_RECORD_LIMIT) {
      return throwError(
        () =>
          new ApiError(
            422,
            `That would add ${added + 1} records and pass MockAPI's limit of ${MOCKAPI_RECORD_LIMIT}. Choose a later start date or delete old transactions.`,
          ),
      );
    }
    const rule: RecurringRulePayload = {
      type: payload.type,
      amount: payload.amount,
      categoryId: payload.categoryId,
      description: payload.description,
      startDate: payload.date,
      day: Number(payload.date.slice(8, 10)),
      until: null,
      skip: [],
    };
    return this.transactionApi.createRule(rule).pipe(
      tap((created) => this.ruleList.update((list) => [...list, created])),
      switchMap((created) => this.generateDue(today).pipe(map(() => created))),
    );
  }

  /** Changes what a rule adds from now on. Transactions it already added stay as they are. */
  updateRule(id: string, changes: Partial<RecurringRulePayload>): Observable<RecurringRule> {
    const existing = this.ruleList().find((r) => r.id === id);
    if (!existing) return throwError(() => new ApiError(404, 'This recurring transaction no longer exists.'));
    const current: RecurringRulePayload = {
      type: existing.type,
      amount: existing.amount,
      categoryId: existing.categoryId,
      description: existing.description,
      startDate: existing.startDate,
      day: existing.day,
      until: existing.until,
      skip: existing.skip,
    };
    return this.transactionApi
      .updateRule(existing, { ...current, ...changes })
      .pipe(tap((updated) => this.ruleList.update((list) => list.map((r) => (r.id === id ? updated : r)))));
  }

  /** Stops a rule. Transactions it already added are kept as ordinary transactions. */
  deleteRule(id: string): Observable<void> {
    return this.transactionApi
      .deleteRule(id)
      .pipe(tap(() => this.ruleList.update((list) => list.filter((r) => r.id !== id))));
  }

  /** The rule that created a transaction, if it still exists. */
  ruleFor(transaction: Pick<Transaction, 'ruleId'>): RecurringRule | undefined {
    return transaction.ruleId ? this.ruleList().find((r) => r.id === transaction.ruleId) : undefined;
  }

  /**
   * Edits a transaction a rule created.
   * one     only this transaction
   * future  this one, the rule (so later months use the new values and day), and the
   *         rule's transactions already added for later months (their dates are kept)
   */
  updateOccurrence(id: string, payload: TransactionPayload, scope: RecurringScope): Observable<Transaction> {
    const existing = this.transactionList().find((t) => t.id === id);
    const rule = existing && this.ruleFor(existing);
    if (!existing || !rule || scope === 'one') return this.updateTransaction(id, payload);

    const month = existing.date.slice(0, 7);
    const values = {
      type: payload.type,
      amount: payload.amount,
      categoryId: payload.categoryId,
      description: payload.description,
    };
    const later = this.transactionList().filter((t) => t.ruleId === rule.id && t.date.slice(0, 7) > month);
    return this.updateRule(rule.id, { ...values, day: Number(payload.date.slice(8, 10)) }).pipe(
      switchMap(() =>
        from(later).pipe(
          concatMap((t) => this.updateTransaction(t.id, { ...values, date: t.date, ruleId: rule.id })),
          reduce((count) => count + 1, 0),
        ),
      ),
      switchMap(() => this.updateTransaction(id, { ...payload, ruleId: rule.id })),
    );
  }

  /**
   * Deletes a transaction a rule created. Emits once, the number of transactions deleted.
   * one     only this month: the month is remembered on the rule so it is not added again
   * future  this month and every later one: the rule ends the month before (or is
   *         removed if this was its first month) and later transactions are deleted
   */
  deleteOccurrence(id: string, scope: RecurringScope): Observable<number> {
    const existing = this.transactionList().find((t) => t.id === id);
    const rule = existing && this.ruleFor(existing);
    if (!existing || !rule) return this.deleteTransaction(id).pipe(map(() => 1));

    const month = existing.date.slice(0, 7);
    if (scope === 'one') {
      const skip = rule.skip.includes(month) ? rule.skip : [...rule.skip, month].sort();
      return this.updateRule(rule.id, { skip }).pipe(
        switchMap(() => this.deleteTransaction(id)),
        map(() => 1),
      );
    }

    const endRule$ =
      month <= rule.startDate.slice(0, 7)
        ? this.deleteRule(rule.id)
        : this.updateRule(rule.id, { until: toIsoMonth(shiftYearMonth(yearMonthOf(existing.date), -1)) }).pipe(
            map(() => undefined),
          );
    const doomed = this.transactionList().filter((t) => t.ruleId === rule.id && t.date.slice(0, 7) >= month);
    return endRule$.pipe(
      switchMap(() =>
        from(doomed).pipe(
          concatMap((t) => this.deleteTransaction(t.id)),
          reduce((count) => count + 1, 0),
        ),
      ),
    );
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
    const newBudgets = this.newDemoBudgets(demo.budgets);
    if (
      this.transactionRecordCount() + demo.transactions.length > MOCKAPI_RECORD_LIMIT ||
      this.budgetList().length + newBudgets.length > MOCKAPI_RECORD_LIMIT
    ) {
      return throwError(
        () =>
          new ApiError(
            422,
            `Demo data would pass MockAPI's limit of ${MOCKAPI_RECORD_LIMIT} records per list. Delete existing data first.`,
          ),
      );
    }

    const jobs: Observable<unknown>[] = [
      ...demo.transactions.map((payload) =>
        this.transactionApi.create(payload).pipe(tap((t) => this.transactionList.update((list) => [...list, t]))),
      ),
      ...newBudgets.map((payload) =>
        this.budgetApi.create(payload).pipe(tap((b) => this.budgetList.update((list) => [...list, b]))),
      ),
    ];
    return this.runBulk(jobs);
  }

  /** Deletes every transaction, recurring rule and budget. Emits the number of records deleted so far. */
  deleteAllData(): Observable<number> {
    const jobs: Observable<unknown>[] = [
      ...this.transactionList().map((t) => this.deleteTransaction(t.id)),
      ...this.ruleList().map((r) => this.deleteRule(r.id)),
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
