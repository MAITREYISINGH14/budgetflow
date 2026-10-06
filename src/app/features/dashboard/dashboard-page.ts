import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { inRange, monthlyTrend, spendingByCategory, summarize } from '../../core/finance/aggregations';
import { insightsForMonth } from '../../core/finance/insights';
import { greetingFor, MonthChange, percentChange } from '../../core/finance/month-comparison';
import { CategorySpending, Transaction, YearMonth } from '../../core/models';
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
import { categoryDoughnut, colorForIndex } from '../../shared/charts/chart-configs';
import { BudgetMeter } from '../../shared/components/budget-meter';
import { CountUp } from '../../shared/components/count-up';
import { StateMessage } from '../../shared/components/state-message';
import { TransactionTable } from '../../shared/components/transaction-table';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { TransactionDialogData, TransactionFormDialog } from '../transactions/transaction-form-dialog';

const TREND_MONTHS = 6;
const RECENT_COUNT = 6;
const TOP_CATEGORIES = 4;
const BUDGET_PREVIEW = 4;

/** One piece of the dashboard's headline sentence; emphasised parts are the numbers. */
interface StoryPart {
  text: string;
  emphasis?: boolean;
}

/** A month-over-month change plus whether it is good news (e.g. lower spending is good). */
interface ToneChange extends MonthChange {
  tone: 'good' | 'bad' | 'neutral';
}

function withTone(change: MonthChange | null, upIsGood: boolean): ToneChange | null {
  if (!change) return null;
  const tone = change.direction === 'flat' ? 'neutral' : (change.direction === 'up') === upIsGood ? 'good' : 'bad';
  return { ...change, tone };
}

/**
 * Everything here is computed() from the store's two lists. A computed only re-runs when
 * the transactions, budgets or selected month change, so switching tabs or opening a
 * dialog never recalculates the dashboard.
 */
@Component({
  selector: 'bf-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ChartComponent, BudgetMeter, CountUp, StateMessage, TransactionTable, MoneyPipe],
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

  // ---------- Header: greeting and one sentence ----------

  protected readonly greeting = greetingFor(new Date().getHours());
  private readonly periodWording = computed(() => (this.isCurrentMonth() ? 'this month' : `in ${this.monthLabel()}`));

  /** "You’ve spent 30% of your income this month." with the number emphasised. */
  protected readonly story = computed<StoryPart[]>(() => {
    const { income, expenses } = this.summary();
    const highlight = income > 0 ? `${Math.round((expenses / income) * 100)}%` : this.format(expenses);
    const rest = income > 0 ? ` of your income ${this.periodWording()}.` : ` ${this.periodWording()}.`;
    return [{ text: 'You’ve spent ' }, { text: highlight, emphasis: true }, { text: rest }];
  });

  // ---------- Comparison with the previous month ----------

  private readonly previousPeriod = computed(() => shiftYearMonth(this.period(), -1));
  protected readonly previousName = computed(() => formatMonth(toIsoMonth(this.previousPeriod()), 'name'));
  private readonly previousSummary = computed(() =>
    summarize(inRange(this.store.transactions(), monthBounds(this.previousPeriod()))),
  );
  private readonly hasPrevious = computed(() => this.previousSummary().transactionCount > 0);

  /** "₹24,353 more than September"; null when there is nothing to compare with. */
  protected readonly balanceComparison = computed(() => {
    if (!this.hasPrevious()) return null;
    const diff = this.summary().balance - this.previousSummary().balance;
    if (diff === 0) return { direction: 'flat' as const, text: `Same as ${this.previousName()}` };
    return {
      direction: diff > 0 ? ('up' as const) : ('down' as const),
      text: `${this.format(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than ${this.previousName()}`,
    };
  });

  protected readonly incomeChange = computed(() =>
    this.hasPrevious() ? withTone(percentChange(this.summary().income, this.previousSummary().income), true) : null,
  );
  /** Spending less than last month is good news, so "down" is shown in green. */
  protected readonly expenseChange = computed(() =>
    this.hasPrevious()
      ? withTone(percentChange(this.summary().expenses, this.previousSummary().expenses), false)
      : null,
  );

  // ---------- Monthly spending bars (last six months) ----------

  private readonly trend = computed(() => {
    const period = this.period();
    const range = {
      startDate: monthBounds(shiftYearMonth(period, -(TREND_MONTHS - 1))).startDate,
      endDate: monthBounds(period).endDate,
    };
    return monthlyTrend(this.store.transactions(), range);
  });

  protected readonly spendingBars = computed(() => {
    const points = this.trend();
    const max = Math.max(...points.map((p) => p.expenses), 1);
    return points.map((p, index) => ({
      month: p.month,
      label: formatMonth(p.month, 'short'),
      amount: p.expenses,
      // At least a sliver, so empty months still show where they are.
      height: Math.max(3, Math.round((p.expenses / max) * 100)),
      current: index === points.length - 1,
    }));
  });

  // ---------- Where it went: top categories plus "Other" ----------

  private readonly spending = computed(() => spendingByCategory(this.monthTransactions()));

  protected readonly spendingGroups = computed(() => {
    const all = this.spending();
    const top = all.slice(0, TOP_CATEGORIES).map((item, index) => ({ ...item, color: colorForIndex(index) }));
    const rest = all.slice(TOP_CATEGORIES);
    const groups: (CategorySpending & { color: string })[] = [...top];
    if (rest.length) {
      groups.push({
        categoryId: 'other',
        name: 'Other',
        total: rest.reduce((sum, item) => sum + item.total, 0),
        percentage: Math.round(rest.reduce((sum, item) => sum + item.percentage, 0) * 10) / 10,
        color: 'var(--chart-8)',
      });
    }
    return groups.map((group) => ({ ...group, share: Math.round(group.percentage) }));
  });

  protected readonly categoryChart = computed(() => {
    const groups = this.spendingGroups();
    return categoryDoughnut(
      groups,
      this.format,
      groups.map((g) => g.color),
    );
  });

  // ---------- Budgets preview ----------

  private readonly monthBudgets = computed(() => {
    const { year, month } = this.period();
    return this.store.budgetViews().filter((b) => b.year === year && b.month === month);
  });
  protected readonly budgetCount = computed(() => this.monthBudgets().length);
  protected readonly budgets = computed(() =>
    [...this.monthBudgets()].sort((a, b) => b.percentageUsed - a.percentageUsed).slice(0, BUDGET_PREVIEW),
  );

  // ---------- Below the fold: insights and recent activity ----------

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
