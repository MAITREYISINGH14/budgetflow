import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { inRange, monthlyTrend, spendingByCategory, summarize } from '../../core/finance/aggregations';
import { insightsForMonth } from '../../core/finance/insights';
import { Transaction, YearMonth } from '../../core/models';
import { CurrencyService } from '../../core/services/currency.service';
import { ToastService } from '../../core/services/toast.service';
import { FinanceStore } from '../../core/state/finance-store';
import { buildBudgetAlerts } from '../../core/utils/budget-display';
import { compareYearMonth, currentYearMonth, formatMonth, monthBounds, shiftYearMonth, toIsoMonth } from '../../core/utils/dates';
import { describeInsight } from '../../core/utils/insight-text';
import { ChartComponent } from '../../shared/charts/chart';
import { categoryDoughnut, colorForIndex, incomeExpenseBars, spendingTrendLine } from '../../shared/charts/chart-configs';
import { BudgetMeter } from '../../shared/components/budget-meter';
import { StateMessage } from '../../shared/components/state-message';
import { TransactionTable } from '../../shared/components/transaction-table';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { TransactionDialogData, TransactionFormDialog } from '../transactions/transaction-form-dialog';

const TREND_MONTHS = 6;
const RECENT_COUNT = 8;

/**
 * Everything here is computed() from the store's two lists. A computed only re-runs when
 * the transactions, budgets or selected month change, so switching tabs or opening a
 * dialog never recalculates the dashboard.
 */
@Component({
  selector: 'bf-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ChartComponent, BudgetMeter, StateMessage, TransactionTable, MoneyPipe],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  private readonly currency = inject(CurrencyService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  protected readonly store = inject(FinanceStore);

  protected readonly period = signal<YearMonth>(currentYearMonth());
  protected readonly isCurrentMonth = computed(() => compareYearMonth(this.period(), currentYearMonth()) === 0);
  protected readonly monthLabel = computed(() => formatMonth(toIsoMonth(this.period())));

  private readonly format = (value: number, options?: { compact?: boolean }) => this.currency.format(value, options);

  private readonly monthTransactions = computed(() => inRange(this.store.transactions(), monthBounds(this.period())));

  protected readonly summary = computed(() => summarize(this.monthTransactions()));
  protected readonly hasIncome = computed(() => this.summary().income > 0);

  private readonly spending = computed(() => spendingByCategory(this.monthTransactions()));
  protected readonly categories = computed(() =>
    this.spending().map((item, index) => ({ ...item, color: colorForIndex(index) })),
  );
  protected readonly categoryChart = computed(() => categoryDoughnut(this.spending(), this.format));

  private readonly trend = computed(() => {
    const period = this.period();
    const range = {
      startDate: monthBounds(shiftYearMonth(period, -(TREND_MONTHS - 1))).startDate,
      endDate: monthBounds(period).endDate,
    };
    return monthlyTrend(this.store.transactions(), range);
  });
  protected readonly hasTrend = computed(() => this.trend().some((p) => p.income > 0 || p.expenses > 0));
  protected readonly trendChart = computed(() => spendingTrendLine(this.trend(), this.format));
  protected readonly incomeExpenseChart = computed(() => incomeExpenseBars(this.trend(), this.format));

  private readonly monthBudgets = computed(() => {
    const { year, month } = this.period();
    return this.store.budgetViews().filter((b) => b.year === year && b.month === month);
  });
  protected readonly budgets = computed(() =>
    [...this.monthBudgets()].sort((a, b) => b.percentageUsed - a.percentageUsed).slice(0, 5),
  );
  protected readonly alerts = computed(() => buildBudgetAlerts(this.monthBudgets(), this.format));
  protected readonly insights = computed(() => {
    const wording = this.isCurrentMonth() ? 'this month' : `in ${this.monthLabel()}`;
    return insightsForMonth(this.store.transactions(), this.store.budgetViews(), this.period()).map((insight) =>
      describeInsight(insight, this.format, wording),
    );
  });

  protected readonly recent = computed(() => this.store.transactionViews().slice(0, RECENT_COUNT));

  protected changeMonth(delta: number): void {
    const next = shiftYearMonth(this.period(), delta);
    if (compareYearMonth(next, currentYearMonth()) <= 0) this.period.set(next);
  }

  protected addTransaction(): void {
    this.dialog
      .open<Transaction, TransactionDialogData>(TransactionFormDialog, {
        data: {},
        panelClass: 'bf-dialog',
        width: '520px',
        maxWidth: 'calc(100vw - 2rem)',
        ariaLabelledBy: 'transaction-dialog-title',
      })
      .closed.pipe(filter((saved): saved is Transaction => !!saved))
      .subscribe(() => this.toast.success('Transaction added'));
  }
}
