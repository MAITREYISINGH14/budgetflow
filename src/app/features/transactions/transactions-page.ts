import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { debounceTime, filter, map, merge, switchMap } from 'rxjs';
import { categoriesFor } from '../../core/categories';
import { paginate, filterTransactions, sortTransactions } from '../../core/finance/transaction-query';
import { transactionsToCsv } from '../../core/finance/csv';
import { errorMessage } from '../../core/interceptors/api-error.interceptor';
import { Transaction, TransactionSort, TransactionType, TransactionView } from '../../core/models';
import { ToastService } from '../../core/services/toast.service';
import { FinanceStore } from '../../core/state/finance-store';
import { DateRangePreset, todayIso } from '../../core/utils/dates';
import { downloadBlob } from '../../core/utils/download';
import {
  countActiveFilters,
  DEFAULT_FILTERS,
  findFilterProblem,
  PAGE_SIZE,
  parseTransactionFilters,
  toQueryParams,
  TransactionFilters,
} from '../../core/utils/transaction-filters';
import { confirmAction } from '../../shared/components/confirm-dialog';
import { StateMessage } from '../../shared/components/state-message';
import { TransactionTable } from '../../shared/components/transaction-table';
import { TransactionDialogData, TransactionFormDialog } from './transaction-form-dialog';

@Component({
  selector: 'bf-transactions-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TransactionTable, StateMessage],
  templateUrl: './transactions-page.html',
  styleUrl: './transactions-page.scss',
})
export class TransactionsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly store = inject(FinanceStore);

  protected readonly today = todayIso();

  /** Filters as they are in the URL. The URL is the source of truth; the form mirrors it. */
  protected readonly filters = toSignal(this.route.queryParamMap.pipe(map(parseTransactionFilters)), {
    initialValue: DEFAULT_FILTERS,
  });

  protected readonly filterForm = this.fb.group({
    search: this.fb.control(''),
    type: this.fb.control<TransactionType | null>(null),
    categoryId: this.fb.control<string | null>(null),
    range: this.fb.control<DateRangePreset>('all'),
    from: this.fb.control<string | null>(null),
    to: this.fb.control<string | null>(null),
    minAmount: this.fb.control<number | null>(null),
    maxAmount: this.fb.control<number | null>(null),
    sort: this.fb.control<TransactionSort>('newest'),
  });

  /** Live form value, so the template reacts before the debounced URL update. */
  protected readonly formValue = signal(this.filterForm.getRawValue());
  protected readonly filterProblem = signal<string | null>(null);
  protected readonly filtersOpen = signal(false);

  protected readonly categoryOptions = computed(() => categoriesFor(this.formValue().type));
  protected readonly isCustomRange = computed(() => this.formValue().range === 'custom');
  protected readonly activeFilterCount = computed(() => countActiveFilters(this.filters()));

  /** Every matching row in display order. Used for the table and for CSV export. */
  protected readonly matching = computed(() =>
    sortTransactions(filterTransactions(this.store.transactionViews(), this.filters(), this.today), this.filters().sort),
  );

  /**
   * The URL page is clamped to the last page that exists, so deleting the only row on
   * the last page shows the previous page instead of an empty one.
   */
  protected readonly page = computed(() => {
    const totalPages = Math.max(1, Math.ceil(this.matching().length / PAGE_SIZE));
    return paginate(this.matching(), Math.min(this.filters().page, totalPages), PAGE_SIZE);
  });

  protected readonly showingLabel = computed(() => {
    const page = this.page();
    if (page.total === 0) return '';
    const first = (page.page - 1) * page.limit + 1;
    return `${first}–${first + page.data.length - 1} of ${page.total}`;
  });

  constructor() {
    // URL -> form (back/forward, refresh, "Clear filters")
    this.route.queryParamMap
      .pipe(map(parseTransactionFilters), takeUntilDestroyed())
      .subscribe((filters) => this.syncForm(filters));

    this.watchFormChanges();
  }

  protected goToPage(page: number): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: toQueryParams({ ...this.filters(), page }) });
  }

  protected clearFilters(): void {
    this.filterProblem.set(null);
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  protected openForm(transaction?: TransactionView): void {
    this.dialog
      .open<Transaction, TransactionDialogData>(TransactionFormDialog, {
        data: { transaction },
        panelClass: 'bf-dialog',
        width: '520px',
        maxWidth: 'calc(100vw - 2rem)',
        ariaLabelledBy: 'transaction-dialog-title',
      })
      .closed.pipe(filter((saved): saved is Transaction => !!saved))
      .subscribe(() => this.toast.success(transaction ? 'Transaction updated' : 'Transaction added'));
  }

  protected confirmDelete(transaction: TransactionView): void {
    const label = transaction.description || transaction.category.name;
    confirmAction(this.dialog, {
      title: 'Delete this transaction?',
      message: `"${label}" will be removed. Budgets and reports update straight away. This cannot be undone.`,
      confirmLabel: 'Delete transaction',
    })
      .pipe(
        filter(Boolean),
        switchMap(() => this.store.deleteTransaction(transaction.id)),
      )
      .subscribe({
        next: () => this.toast.success('Transaction deleted'),
        error: (error: unknown) => this.toast.error(errorMessage(error, 'The transaction could not be deleted.')),
      });
  }

  /** Exports every row matching the filters, not just the visible page. */
  protected exportCsv(): void {
    const csv = transactionsToCsv(this.matching());
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `budgetflow-transactions-${todayIso()}.csv`);
  }

  private watchFormChanges(): void {
    const c = this.filterForm.controls;

    // Subscribed before `picked$`, so the category reset is part of the same change.
    c.type.valueChanges.pipe(takeUntilDestroyed()).subscribe((type) => {
      const selected = c.categoryId.value;
      if (selected !== null && !categoriesFor(type).some((cat) => cat.id === selected)) c.categoryId.setValue(null);
    });

    this.filterForm.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.formValue.set(this.filterForm.getRawValue()));

    // Typed fields wait for a pause; dropdowns apply immediately.
    const typed$ = merge(
      c.search.valueChanges,
      c.minAmount.valueChanges,
      c.maxAmount.valueChanges,
      c.from.valueChanges,
      c.to.valueChanges,
    ).pipe(debounceTime(300));
    const picked$ = merge(c.type.valueChanges, c.categoryId.valueChanges, c.range.valueChanges, c.sort.valueChanges);

    merge(typed$, picked$)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.applyForm());
  }

  private applyForm(): void {
    const value = this.filterForm.getRawValue();
    const next: TransactionFilters = {
      search: value.search,
      type: value.type,
      categoryId: value.categoryId,
      range: value.range,
      from: value.range === 'custom' ? value.from || null : null,
      to: value.range === 'custom' ? value.to || null : null,
      minAmount: value.minAmount,
      maxAmount: value.maxAmount,
      sort: value.sort,
      page: 1, // any filter change starts from the first page
    };

    const problem = findFilterProblem(next);
    this.filterProblem.set(problem);
    if (problem) return;

    const current = this.filters();
    const unchanged =
      JSON.stringify(toQueryParams({ ...next, page: current.page })) === JSON.stringify(toQueryParams(current));
    if (unchanged) return;

    // replaceUrl: typing should not create one history entry per keystroke.
    this.router.navigate([], { relativeTo: this.route, queryParams: toQueryParams(next), replaceUrl: true });
  }

  private syncForm(filters: TransactionFilters): void {
    this.filterForm.setValue(
      {
        search: filters.search,
        type: filters.type,
        categoryId: filters.categoryId,
        range: filters.range,
        from: filters.from,
        to: filters.to,
        minAmount: filters.minAmount,
        maxAmount: filters.maxAmount,
        sort: filters.sort,
      },
      { emitEvent: false },
    );
    this.formValue.set(this.filterForm.getRawValue());
  }
}
