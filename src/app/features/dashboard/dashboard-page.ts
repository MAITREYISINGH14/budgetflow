import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { inRange, monthlyTrend, spendingByCategory, summarize } from '../../core/finance/aggregations';
import { insightsForMonth } from '../../core/finance/insights';
import { greetingFor, percentChange, pointChange } from '../../core/finance/month-comparison';
import { Transaction, YearMonth } from '../../core/models';
import { CurrencyService } from '../../core/services/currency.service';
import { ToastService } from '../../core/services/toast.service';
import { FinanceStore } from '../../core/state/finance-store';
import { buildBudgetAlerts } from '../../core/utils/budget-display';
import {
  compareYearMonth,
  currentYearMonth,
  formatMonth,
  monthBounds,
  shiftYearMonth,
  toIsoMonth,
} from '../../core/utils/dates';
import { describeInsight } from '../../core/utils/insight-text';
import { ChartComponent } from '../../shared/charts/chart';
import {
  categoryDoughnut,
  colorForIndex,
  incomeExpenseBars,
  spendingTrendLine,
} from '../../shared/charts/chart-configs';
import { BudgetMeter } from '../../shared/components/budget-meter';
import { CountUp } from '../../shared/components/count-up';
import { DeltaChip } from '../../shared/components/delta-chip';
import { Sparkline } from '../../shared/components/sparkline';
import { StateMessage } from '../../shared/components/state-message';
import { TransactionTable } from '../../shared/components/transaction-table';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { TransactionDialogData, TransactionFormDialog } from '../transactions/transaction-form-dialog';

const TREND_MONTHS = 6;
const RECENT_COUNT = 8;

/** One piece of the dashboard's headline sentence; emphasised parts are the numbers. */
interface StoryPart {
  text: string;
  emphasis?: 'value' | 'over';
}

/**
 * Everything here is computed() from the store's two lists. A computed only re-runs when
 * the transactions, budgets or selected month change, so switching tabs or opening a
 * dialog never recalculates the dashboard.
 */
@Component({
  selector: 'bf-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ChartComponent,
    BudgetMeter,
    CountUp,
    DeltaChip,
    Sparkline,
    StateMessage,
    TransactionTable,
    MoneyPipe,
  ],
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

  // ---------- Story header ----------

  protected readonly greeting = greetingFor(new Date().getHours());
  protected readonly periodWording = computed(() => (this.isCurrentMonth() ? 'this month' : `in ${this.monthLabel()}`));

  /** Share of income spent, as a whole percentage; null when there was no income. */
  protected readonly spentShare = computed(() => {
    const { income, expenses } = this.summary();
    return income > 0 ? Math.round((expenses / income) * 100) : null;
  });

  /** Total left (positive) or over (negative) across budgets that have a limit; null with no budgets. */
  protected readonly budgetHeadroom = computed(() => {
    const limited = this.monthBudgets().filter((b) => b.status !== 'NO_LIMIT');
    return limited.length ? limited.reduce((sum, b) => sum + b.remaining, 0) : null;
  });

  /**
   * The headline sentence as parts, so numbers can be highlighted and spacing stays exact:
   * "You’ve spent 30% of your income this month, and ₹4,353 is left across your budgets."
   */
  protected readonly story = computed(() => {
    const parts: StoryPart[] = [{ text: 'You’ve spent ' }];
    const share = this.spentShare();
    if (share !== null) {
      parts.push({ text: `${share}%`, emphasis: 'value' }, { text: ` of your income ${this.periodWording()}` });
    } else {
      parts.push(
        { text: this.format(this.summary().expenses), emphasis: 'value' },
        { text: ` ${this.periodWording()}` },
      );
    }

    const headroom = this.budgetHeadroom();
    if (headroom === null) {
      parts.push({ text: '.' });
    } else if (headroom > 0) {
      parts.push(
        { text: ', and ' },
        { text: this.format(headroom), emphasis: 'value' },
        { text: ' is left across your budgets.' },
      );
    } else if (headroom === 0) {
      parts.push({ text: ', and your budgets are fully used.' });
    } else {
      parts.push(
        { text: ', and you’re ' },
        { text: this.format(-headroom), emphasis: 'over' },
        { text: ' over budget overall.' },
      );
    }
    return parts;
  });

  // ---------- Month-over-month changes ----------

  private readonly previousPeriod = computed(() => shiftYearMonth(this.period(), -1));
  protected readonly previousLabel = computed(() => formatMonth(toIsoMonth(this.previousPeriod()), 'short'));
  private readonly previousSummary = computed(() =>
    summarize(inRange(this.store.transactions(), monthBounds(this.previousPeriod()))),
  );

  /** null when the previous month has no transactions, so no misleading "vs" chips appear. */
  protected readonly changes = computed(() => {
    const now = this.summary();
    const before = this.previousSummary();
    if (before.transactionCount === 0) return null;
    return {
      balance: percentChange(now.balance, before.balance),
      income: percentChange(now.income, before.income),
      expenses: percentChange(now.expenses, before.expenses),
      savings: before.income > 0 && now.income > 0 ? pointChange(now.savingsRate, before.savingsRate) : null,
    };
  });

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

  // Sparklines: the last six months for each tile.
  protected readonly sparks = computed(() => {
    const points = this.trend();
    return {
      net: points.map((p) => p.net),
      income: points.map((p) => p.income),
      expenses: points.map((p) => p.expenses),
      savings: points.map((p) => (p.income > 0 ? (p.net / p.income) * 100 : 0)),
    };
  });
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
