import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { attentionItems } from '../../core/finance/attention';
import { inRange, summarize } from '../../core/finance/aggregations';
import { categoryOverview } from '../../core/finance/category-overview';
import { insightsForMonth } from '../../core/finance/insights';
import { monthPace } from '../../core/finance/month-pace';
import { upcomingExpenses } from '../../core/finance/recurring';
import { ClockService } from '../../core/services/clock.service';
import { CurrencyService } from '../../core/services/currency.service';
import { ToastService } from '../../core/services/toast.service';
import { FinanceStore } from '../../core/state/finance-store';
import { formatMonth, monthBounds, toIsoMonth, yearMonthOf } from '../../core/utils/dates';
import { describeInsight } from '../../core/utils/insight-text';
import { categoryThisMonth } from '../../core/utils/transaction-filters';
import { BudgetMeter } from '../../shared/components/budget-meter';
import { CountUp } from '../../shared/components/count-up';
import { StateMessage } from '../../shared/components/state-message';
import { TransactionTable } from '../../shared/components/transaction-table';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { openTransactionForm } from '../transactions/transaction-form-dialog';

const RECENT_COUNT = 5;
/** Unbudgeted categories named in the footer before "and N more". */
const UNBUDGETED_NAMED = 2;

/**
 * The dashboard answers one question: how is this month going, and does anything need
 * doing? Four blocks, each computed() from the store:
 *
 *   1. Left to spend, with a daily allowance and how spending compares with the calendar
 *   2. Needs attention: at most three ranked items, each linking to the data behind it
 *   3. This month by category: spending and budgets in one list
 *   4. Recent transactions in this month
 *
 * It always shows the current month. Past months are reviewed on Analytics.
 */
@Component({
  selector: 'bf-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BudgetMeter, CountUp, StateMessage, TransactionTable, MoneyPipe],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  private readonly currency = inject(CurrencyService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly clock = inject(ClockService);
  protected readonly store = inject(FinanceStore);

  private readonly format = (value: number) => this.currency.format(value);

  private readonly period = computed(() => yearMonthOf(this.clock.today()));
  protected readonly monthLabel = computed(() => formatMonth(toIsoMonth(this.period())));

  private readonly monthTransactions = computed(() => inRange(this.store.transactions(), monthBounds(this.period())));
  private readonly summary = computed(() => summarize(this.monthTransactions()));
  private readonly monthBudgets = computed(() => {
    const { year, month } = this.period();
    return this.store.budgetViews().filter((b) => b.year === year && b.month === month);
  });

  // ---------- 1. Left to spend ----------

  /** Recurring expenses that will still be added later this month. */
  private readonly upcomingBills = computed(() =>
    upcomingExpenses(this.store.rules(), this.store.transactions(), this.clock.today()),
  );

  protected readonly pace = computed(() =>
    monthPace({
      today: this.clock.today(),
      budgets: this.monthBudgets(),
      income: this.summary().income,
      expenses: this.summary().expenses,
      upcoming: this.upcomingBills(),
    }),
  );

  protected readonly heroLabel = computed(() => {
    switch (this.pace().basis) {
      case 'BUDGET':
        return this.pace().left < 0 ? 'Over budget this month' : 'Left to spend this month';
      case 'INCOME':
        return this.pace().left < 0 ? 'Spent more than you earned' : 'Left from this month’s income';
      case 'NONE':
        return 'Spent this month';
    }
  });

  /** The hero's big number: what is left, how far over, or (with nothing to measure against) what was spent. */
  protected readonly heroValue = computed(() => {
    const pace = this.pace();
    return pace.basis === 'NONE' ? pace.spent : Math.abs(pace.left);
  });

  protected readonly heroNote = computed(() => {
    const pace = this.pace();
    if (pace.basis === 'NONE') return 'Add your income or set budgets to see what’s left to spend.';
    if (pace.left <= 0) return 'Nothing left to spend for the rest of the month.';
    if (pace.perDay === 0) return 'What’s left is needed for bills still due this month.';
    const days = pace.daysLeft === 1 ? 'today' : `a day for the next ${pace.daysLeft} days`;
    const bills = pace.stillDue > 0 ? ', after bills still due' : '';
    return `${this.format(pace.perDay ?? 0)} ${days}${bills}`;
  });

  protected readonly paceText = computed(() => {
    switch (this.pace().status) {
      case 'AHEAD':
        return 'Spending faster than the month';
      case 'ON_PACE':
        return 'On pace';
      case 'OVER':
        return this.pace().basis === 'BUDGET' ? 'Over budget' : 'Over your income';
      case 'NONE':
        return '';
    }
  });

  protected readonly paceWidth = computed(() => Math.min(100, this.pace().usedPercent));

  // ---------- 2. Needs attention ----------

  private readonly insights = computed(() =>
    insightsForMonth(this.store.transactions(), this.store.budgetViews(), this.period()),
  );

  protected readonly attention = computed(() => attentionItems(this.monthBudgets(), this.insights(), this.format));

  /** When nothing needs attention, one piece of good news if there is any. */
  protected readonly goodNews = computed(() => {
    const positive = this.insights().find((i) => i.severity === 'POSITIVE');
    return positive ? describeInsight(positive, this.format).message : null;
  });

  // ---------- 3. This month by category ----------

  private readonly overview = computed(() => categoryOverview(this.monthTransactions(), this.monthBudgets()));
  protected readonly categoryLink = categoryThisMonth;

  // At most ten expense categories exist, so the whole list fits without a "show all".
  protected readonly categories = computed(() => this.overview().rows);

  /** "Travel, Education and 6 more have no budget"; null once every category has one. */
  protected readonly unbudgetedText = computed(() => {
    const names = this.overview().unbudgeted.map((c) => c.name);
    if (names.length === 0) return null;
    if (names.length === 1) return `${names[0]} has no budget`;
    if (names.length <= UNBUDGETED_NAMED + 1) {
      return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} have no budget`;
    }
    const rest = names.length - UNBUDGETED_NAMED;
    return `${names.slice(0, UNBUDGETED_NAMED).join(', ')} and ${rest} more have no budget`;
  });

  // ---------- 4. Recent transactions this month ----------

  protected readonly recent = computed(() => {
    const { startDate, endDate } = monthBounds(this.period());
    return this.store
      .transactionViews()
      .filter((t) => t.date >= startDate && t.date <= endDate)
      .slice(0, RECENT_COUNT);
  });

  protected addTransaction(): void {
    openTransactionForm(this.dialog, {}).subscribe((message) => this.toast.success(message));
  }
}
