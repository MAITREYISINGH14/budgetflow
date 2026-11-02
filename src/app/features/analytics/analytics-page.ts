import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { compareCategorySpending, inRange, monthlyTrend, summarize } from '../../core/finance/aggregations';
import { MonthChange, percentChange } from '../../core/finance/month-comparison';
import { DateRange, YearMonth } from '../../core/models';
import { ClockService } from '../../core/services/clock.service';
import { CurrencyService } from '../../core/services/currency.service';
import { FinanceStore } from '../../core/state/finance-store';
import {
  formatDisplayDate,
  formatMonth,
  isValidIsoDate,
  monthBounds,
  parseIsoMonth,
  previousRange,
  shiftYearMonth,
  toIsoMonth,
  trailingMonths,
  yearMonthOf,
} from '../../core/utils/dates';
import { sumAmounts } from '../../core/utils/money';
import { ChartComponent } from '../../shared/charts/chart';
import { colorForIndex, incomeExpenseBars } from '../../shared/charts/chart-configs';
import { CountUp } from '../../shared/components/count-up';
import { StateMessage } from '../../shared/components/state-message';
import { MoneyPipe } from '../../shared/pipes/money.pipe';

type RangeOption = '1' | '3' | '6' | '12' | 'custom';

/** Months offered in "Month in review", counting back from last month. */
const REVIEW_MONTHS = 12;

/** A change plus whether it is good news, e.g. lower spending is good. */
interface ToneChange extends MonthChange {
  tone: 'good' | 'bad' | 'neutral';
}

function withTone(change: MonthChange | null, upIsGood: boolean): ToneChange | null {
  if (!change) return null;
  const tone = change.direction === 'flat' ? 'neutral' : (change.direction === 'up') === upIsGood ? 'good' : 'bad';
  return { ...change, tone };
}

/**
 * Looking back: totals for a period compared with the period before it, income against
 * expenses per month, one category table, and a review of any single past month (which
 * replaced the dashboard's month switcher).
 */
@Component({
  selector: 'bf-analytics-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ChartComponent, StateMessage, MoneyPipe, CountUp],
  templateUrl: './analytics-page.html',
  styleUrl: './analytics-page.scss',
})
export class AnalyticsPage {
  private readonly currency = inject(CurrencyService);
  private readonly clock = inject(ClockService);
  protected readonly store = inject(FinanceStore);
  private readonly format = (value: number, options?: { compact?: boolean }) => this.currency.format(value, options);

  protected readonly today = this.clock.today;
  protected readonly options: { value: RangeOption; label: string }[] = [
    { value: '1', label: '1 month' },
    { value: '3', label: '3 months' },
    { value: '6', label: '6 months' },
    { value: '12', label: '12 months' },
    { value: 'custom', label: 'Custom' },
  ];

  protected readonly option = signal<RangeOption>('3');
  protected readonly customFrom = signal(trailingMonths(this.today(), 3).startDate);
  protected readonly customTo = signal(this.today());

  // ---------- The period and the one before it ----------

  protected readonly range = computed<DateRange | null>(() => {
    const option = this.option();
    if (option !== 'custom') return trailingMonths(this.today(), Number(option));
    const startDate = this.customFrom();
    const endDate = this.customTo();
    return isValidIsoDate(startDate) && isValidIsoDate(endDate) && startDate <= endDate ? { startDate, endDate } : null;
  });

  private readonly previous = computed<DateRange | null>(() => {
    const range = this.range();
    if (!range) return null;
    const option = this.option();
    return option === 'custom' ? previousRange(range) : previousRange(range, Number(option));
  });

  protected readonly rangeLabel = computed(() => {
    const range = this.range();
    return range ? `${formatDisplayDate(range.startDate)} – ${formatDisplayDate(range.endDate)}` : '';
  });

  protected readonly previousLabel = computed(() => {
    const previous = this.previous();
    return previous ? `${formatDisplayDate(previous.startDate)} – ${formatDisplayDate(previous.endDate)}` : '';
  });

  private readonly rangeTransactions = computed(() => {
    const range = this.range();
    return range ? inRange(this.store.transactions(), range) : [];
  });

  private readonly previousTransactions = computed(() => {
    const previous = this.previous();
    return previous ? inRange(this.store.transactions(), previous) : [];
  });

  /** Changes are only shown when there is something before this period to compare with. */
  protected readonly hasPrevious = computed(() => this.previousTransactions().length > 0);

  // ---------- Totals with their changes ----------

  protected readonly summary = computed(() => summarize(this.rangeTransactions()));
  private readonly previousSummary = computed(() => summarize(this.previousTransactions()));

  private readonly trend = computed(() => {
    const range = this.range();
    return range ? monthlyTrend(this.store.transactions(), range) : [];
  });

  private readonly averageOf = (expenses: number, months: number) => (months ? Math.round(expenses / months) : 0);

  protected readonly averageMonthlySpend = computed(() => this.averageOf(this.summary().expenses, this.trend().length));

  protected readonly changes = computed(() => {
    if (!this.hasPrevious()) return null;
    const now = this.summary();
    const before = this.previousSummary();
    const previous = this.previous();
    const previousMonths = previous ? monthlyTrend([], previous).length : 0;
    return {
      income: withTone(percentChange(now.income, before.income), true),
      expenses: withTone(percentChange(now.expenses, before.expenses), false),
      net: withTone(percentChange(now.balance, before.balance), true),
      previousSavingsRate: before.savingsRate,
      average: withTone(
        percentChange(this.averageMonthlySpend(), this.averageOf(before.expenses, previousMonths)),
        false,
      ),
    };
  });

  // ---------- Income vs expenses by month ----------

  protected readonly incomeExpenseChart = computed(() => incomeExpenseBars(this.trend(), this.format));

  // ---------- Categories ----------

  protected readonly categories = computed(() => {
    const range = this.range();
    return compareCategorySpending(this.rangeTransactions(), this.previousTransactions()).map((item, index) => ({
      ...item,
      color: colorForIndex(index),
      tone: withTone(item.change, false),
      // That category's expenses within the selected period, on the Transactions page.
      link: range
        ? { type: 'EXPENSE', category: item.categoryId, range: 'custom', from: range.startDate, to: range.endDate }
        : { type: 'EXPENSE', category: item.categoryId },
    }));
  });

  /** Bars are scaled to the biggest category, so the largest one fills its slot. */
  protected readonly maxShare = computed(() => this.categories()[0]?.percentage || 1);

  // ---------- Month in review ----------

  private readonly currentMonth = computed(() => yearMonthOf(this.today()));

  protected readonly reviewOptions = computed(() =>
    Array.from({ length: REVIEW_MONTHS }, (_, i) => {
      const value = toIsoMonth(shiftYearMonth(this.currentMonth(), -(i + 1)));
      return { value, label: formatMonth(value) };
    }),
  );

  /** null until the person picks one; then last month is the default. */
  private readonly chosenReviewMonth = signal<string | null>(null);
  protected readonly reviewMonth = computed<YearMonth>(
    () => parseIsoMonth(this.chosenReviewMonth()) ?? shiftYearMonth(this.currentMonth(), -1),
  );
  protected readonly reviewValue = computed(() => toIsoMonth(this.reviewMonth()));
  protected readonly reviewName = computed(() => formatMonth(this.reviewValue(), 'name'));

  protected readonly review = computed(() => {
    const period = this.reviewMonth();
    const summary = summarize(inRange(this.store.transactions(), monthBounds(period)));
    const budgets = this.store
      .budgetViews()
      .filter((b) => b.year === period.year && b.month === period.month && b.status !== 'NO_LIMIT');
    const over = budgets
      .filter((b) => b.status === 'EXCEEDED')
      .sort((a, b) => a.remaining - b.remaining)
      .map((b) => ({ id: b.id, name: b.category.name, over: Math.abs(b.remaining), limit: b.limit }));
    return {
      summary,
      budgetCount: budgets.length,
      withinCount: budgets.length - over.length,
      over,
      overTotal: sumAmounts(over.map((o) => o.over)),
    };
  });

  protected selectOption(value: RangeOption): void {
    this.option.set(value);
  }

  protected selectReviewMonth(event: Event): void {
    this.chosenReviewMonth.set((event.target as HTMLSelectElement).value);
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
