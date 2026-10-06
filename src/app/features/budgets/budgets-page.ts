import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { filter, map, switchMap } from 'rxjs';
import { EXPENSE_CATEGORIES } from '../../core/categories';
import { errorMessage } from '../../core/interceptors/api-error.interceptor';
import { Budget, BudgetView } from '../../core/models';
import { CurrencyService } from '../../core/services/currency.service';
import { ToastService } from '../../core/services/toast.service';
import { FinanceStore } from '../../core/state/finance-store';
import { BUDGET_STATUS_META, buildBudgetAlerts } from '../../core/utils/budget-display';
import {
  compareYearMonth,
  currentYearMonth,
  formatMonth,
  parseIsoMonth,
  shiftYearMonth,
  toIsoMonth,
} from '../../core/utils/dates';
import { sumAmounts } from '../../core/utils/money';
import { BudgetMeter } from '../../shared/components/budget-meter';
import { confirmAction } from '../../shared/components/confirm-dialog';
import { CountUp } from '../../shared/components/count-up';
import { StateMessage } from '../../shared/components/state-message';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { BudgetDialogData, BudgetFormDialog } from './budget-form-dialog';

/** Furthest month ahead that budgets can be planned for. */
const PLANNING_HORIZON_MONTHS = 12;

@Component({
  selector: 'bf-budgets-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BudgetMeter, StateMessage, MoneyPipe, CountUp],
  templateUrl: './budgets-page.html',
  styleUrl: './budgets-page.scss',
})
export class BudgetsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly currency = inject(CurrencyService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  protected readonly store = inject(FinanceStore);

  // The selected month lives in the URL (?month=2026-09) so it survives refresh and can be shared.
  protected readonly period = toSignal(
    this.route.queryParamMap.pipe(map((params) => parseIsoMonth(params.get('month')) ?? currentYearMonth())),
    { initialValue: currentYearMonth() },
  );

  protected readonly monthLabel = computed(() => formatMonth(toIsoMonth(this.period())));
  protected readonly canGoForward = computed(
    () => compareYearMonth(this.period(), shiftYearMonth(currentYearMonth(), PLANNING_HORIZON_MONTHS)) < 0,
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
    })),
  );

  protected readonly totals = computed(() => {
    const budgets = this.budgets();
    const limit = sumAmounts(budgets.map((b) => b.limit));
    const spent = sumAmounts(budgets.map((b) => b.spent));
    const left = sumAmounts([limit, -spent]);
    return { limit, spent, isOver: left < 0, leftAmount: Math.abs(left) };
  });

  protected readonly alerts = computed(() => buildBudgetAlerts(this.budgets(), (v) => this.currency.format(v)));

  protected readonly availableCategories = computed(() => {
    const taken = new Set(this.budgets().map((b) => b.categoryId));
    return EXPENSE_CATEGORIES.filter((c) => !taken.has(c.id));
  });

  protected changeMonth(delta: number): void {
    const next = shiftYearMonth(this.period(), delta);
    const isCurrent = compareYearMonth(next, currentYearMonth()) === 0;
    this.router.navigate([], { relativeTo: this.route, queryParams: { month: isCurrent ? null : toIsoMonth(next) } });
  }

  protected openForm(budget?: BudgetView): void {
    this.dialog
      .open<Budget, BudgetDialogData>(BudgetFormDialog, {
        data: { period: this.period(), budget, availableCategories: this.availableCategories() },
        panelClass: 'bf-dialog',
        width: '440px',
        maxWidth: 'calc(100vw - 2rem)',
        ariaLabelledBy: 'budget-dialog-title',
      })
      .closed.pipe(filter((saved): saved is Budget => !!saved))
      .subscribe(() => this.toast.success(budget ? 'Budget updated' : 'Budget added'));
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

  private remainingText(budget: BudgetView): string {
    const format = (value: number) => this.currency.format(value);
    if (budget.status === 'NO_LIMIT') return `${format(budget.spent)} spent`;
    if (budget.remaining < 0) return `${format(-budget.remaining)} over budget`;
    return `${format(budget.remaining)} remaining`;
  }
}
