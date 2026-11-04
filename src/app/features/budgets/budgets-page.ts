import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { filter, finalize, map, switchMap } from 'rxjs';
import { EXPENSE_CATEGORIES } from '../../core/categories';
import { inRange, summarize } from '../../core/finance/aggregations';
import { monthPace } from '../../core/finance/month-pace';
import { upcomingExpenses } from '../../core/finance/recurring';
import { errorMessage } from '../../core/interceptors/api-error.interceptor';
import { Budget, BudgetView, Category } from '../../core/models';
import { ClockService } from '../../core/services/clock.service';
import { CurrencyService } from '../../core/services/currency.service';
import { ToastService } from '../../core/services/toast.service';
import { FinanceStore } from '../../core/state/finance-store';
import { BUDGET_STATUS_META } from '../../core/utils/budget-display';
import {
  compareYearMonth,
  formatMonth,
  monthBounds,
  parseIsoMonth,
  shiftYearMonth,
  toIsoMonth,
  yearMonthOf,
} from '../../core/utils/dates';
import { sumAmounts } from '../../core/utils/money';
import { categoryThisMonth } from '../../core/utils/transaction-filters';
import { BudgetMeter } from '../../shared/components/budget-meter';
import { confirmAction } from '../../shared/components/confirm-dialog';
import { CountUp } from '../../shared/components/count-up';
import { StateMessage } from '../../shared/components/state-message';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { BudgetDialogData, BudgetFormDialog } from './budget-form-dialog';
import { dialogOptions } from '../../shared/components/dialog-options';

/** Furthest month ahead that budgets can be planned for. */
const PLANNING_HORIZON_MONTHS = 12;

@Component({
  selector: 'bf-budgets-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BudgetMeter, StateMessage, MoneyPipe, CountUp],
  templateUrl: './budgets-page.html',
  styleUrl: './budgets-page.scss',
})
export class BudgetsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly currency = inject(CurrencyService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly clock = inject(ClockService);
  protected readonly store = inject(FinanceStore);

  private readonly currentMonth = computed(() => yearMonthOf(this.clock.today()));

  // The selected month lives in the URL (?month=2026-09) so it survives refresh and can be shared.
  // Without it the page shows the current month, which moves on by itself at month end.
  private readonly monthParam = toSignal(this.route.queryParamMap.pipe(map((params) => params.get('month'))), {
    initialValue: null,
  });
  protected readonly period = computed(() => parseIsoMonth(this.monthParam()) ?? this.currentMonth());
  protected readonly isCurrentMonth = computed(() => compareYearMonth(this.period(), this.currentMonth()) === 0);

  protected readonly monthLabel = computed(() => formatMonth(toIsoMonth(this.period())));
  private readonly previousPeriod = computed(() => shiftYearMonth(this.period(), -1));
  protected readonly previousName = computed(() => formatMonth(toIsoMonth(this.previousPeriod()), 'name'));
  protected readonly canGoForward = computed(
    () => compareYearMonth(this.period(), shiftYearMonth(this.currentMonth(), PLANNING_HORIZON_MONTHS)) < 0,
  );

  protected readonly budgets = computed(() => {
    const { year, month } = this.period();
    return this.store
      .budgetViews()
      .filter((b) => b.year === year && b.month === month)
      .sort((a, b) => a.category.name.localeCompare(b.category.name));
  });

  protected readonly cards = computed(() =>
    this.budgets().map((budget) => ({
      budget,
      meta: BUDGET_STATUS_META[budget.status],
      usedText: budget.status === 'NO_LIMIT' ? 'No limit' : `${budget.percentageUsed}% used`,
      remainingText: this.remainingText(budget),
      // Over or close to the limit: link straight to what was spent.
      showLink: budget.status === 'EXCEEDED' || budget.status === 'NEAR_LIMIT',
      linkParams: this.transactionsLink(budget.categoryId),
    })),
  );

  protected readonly totals = computed(() => {
    const budgets = this.budgets();
    const limit = sumAmounts(budgets.map((b) => b.limit));
    const spent = sumAmounts(budgets.map((b) => b.spent));
    const left = sumAmounts([limit, -spent]);
    return { limit, spent, isOver: left < 0, leftAmount: Math.abs(left) };
  });

  /** "₹334 a day": only for the current month, and only while something is left. */
  protected readonly perDay = computed(() => {
    if (!this.isCurrentMonth()) return null;
    const summary = summarize(inRange(this.store.transactions(), monthBounds(this.period())));
    const today = this.clock.today();
    const upcoming = upcomingExpenses(this.store.rules(), this.store.transactions(), today);
    const pace = monthPace({
      today,
      budgets: this.budgets(),
      income: summary.income,
      expenses: summary.expenses,
      upcoming,
    });
    return pace.basis === 'BUDGET' && pace.left > 0 ? { amount: pace.perDay ?? 0, days: pace.daysLeft } : null;
  });

  protected readonly availableCategories = computed(() => {
    const taken = new Set(this.budgets().map((b) => b.categoryId));
    return EXPENSE_CATEGORIES.filter((c) => !taken.has(c.id));
  });

  /** Budgets the previous month has that this month does not have yet. */
  protected readonly copyCandidates = computed(() => this.store.budgetsToCopy(this.previousPeriod(), this.period()));
  protected readonly copying = signal(false);

  protected changeMonth(delta: number): void {
    const next = shiftYearMonth(this.period(), delta);
    const isCurrent = compareYearMonth(next, this.currentMonth()) === 0;
    this.router.navigate([], { relativeTo: this.route, queryParams: { month: isCurrent ? null : toIsoMonth(next) } });
  }

  protected openForm(budget?: BudgetView, category?: Category): void {
    this.dialog
      .open<Budget, BudgetDialogData>(
        BudgetFormDialog,
        dialogOptions(440, 'budget-dialog-title', {
          period: this.period(),
          budget,
          availableCategories: this.availableCategories(),
          presetCategoryId: category?.id,
        }),
      )
      .closed.pipe(filter((saved): saved is Budget => !!saved))
      .subscribe(() => this.toast.success(budget ? 'Budget updated' : 'Budget added'));
  }

  protected copyFromPreviousMonth(): void {
    if (this.copying()) return;
    const count = this.copyCandidates().length;
    const from = this.previousName();
    this.copying.set(true);
    this.store
      .copyBudgets(this.previousPeriod(), this.period())
      .pipe(finalize(() => this.copying.set(false)))
      .subscribe({
        complete: () => this.toast.success(`Copied ${count} ${count === 1 ? 'budget' : 'budgets'} from ${from}`),
        error: (error: unknown) =>
          this.toast.error(
            `${errorMessage(error, 'The budgets could not be copied.')} Budgets already copied were kept.`,
          ),
      });
  }

  protected confirmDelete(budget: BudgetView): void {
    confirmAction(this.dialog, {
      title: `Delete the ${budget.category.name} budget?`,
      message: `The limit for ${this.monthLabel()} will be removed. Your transactions are not affected.`,
      confirmLabel: 'Delete budget',
    })
      .pipe(
        filter(Boolean),
        switchMap(() => this.store.deleteBudget(budget.id)),
      )
      .subscribe({
        next: () => this.toast.success('Budget deleted'),
        error: (error: unknown) => this.toast.error(errorMessage(error, 'The budget could not be deleted.')),
      });
  }

  /** Query params for this month's expenses in one category. */
  private transactionsLink(categoryId: string): Record<string, string> {
    if (this.isCurrentMonth()) return categoryThisMonth(categoryId);
    const { startDate, endDate } = monthBounds(this.period());
    return { type: 'EXPENSE', category: categoryId, range: 'custom', from: startDate, to: endDate };
  }

  private remainingText(budget: BudgetView): string {
    const format = (value: number) => this.currency.format(value);
    if (budget.status === 'NO_LIMIT') return `${format(budget.spent)} spent`;
    if (budget.remaining < 0) return `${format(-budget.remaining)} over budget`;
    return `${format(budget.remaining)} remaining`;
  }
}
