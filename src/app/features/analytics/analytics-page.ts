import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { inRange, monthlyTrend, spendingByCategory, summarize } from '../../core/finance/aggregations';
import { DateRange } from '../../core/models';
import { CurrencyService } from '../../core/services/currency.service';
import { FinanceStore } from '../../core/state/finance-store';
import { formatDisplayDate, isValidIsoDate, todayIso, trailingMonths } from '../../core/utils/dates';
import { ChartComponent } from '../../shared/charts/chart';
import { categoryBars, colorForIndex, incomeExpenseBars, spendingTrendLine } from '../../shared/charts/chart-configs';
import { StateMessage } from '../../shared/components/state-message';
import { MoneyPipe } from '../../shared/pipes/money.pipe';

type RangeOption = '1' | '3' | '6' | '12' | 'custom';

@Component({
  selector: 'bf-analytics-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartComponent, StateMessage, MoneyPipe],
  templateUrl: './analytics-page.html',
  styleUrl: './analytics-page.scss',
})
export class AnalyticsPage {
  private readonly currency = inject(CurrencyService);
  protected readonly store = inject(FinanceStore);
  private readonly format = (value: number, options?: { compact?: boolean }) => this.currency.format(value, options);

  protected readonly today = todayIso();
  protected readonly options: { value: RangeOption; label: string }[] = [
    { value: '1', label: '1 month' },
    { value: '3', label: '3 months' },
    { value: '6', label: '6 months' },
    { value: '12', label: '12 months' },
    { value: 'custom', label: 'Custom' },
  ];

  protected readonly option = signal<RangeOption>('6');
  protected readonly customFrom = signal(trailingMonths(this.today, 3).startDate);
  protected readonly customTo = signal(this.today);

  protected readonly range = computed<DateRange | null>(() => {
    const option = this.option();
    if (option !== 'custom') return trailingMonths(this.today, Number(option));
    const startDate = this.customFrom();
    const endDate = this.customTo();
    return isValidIsoDate(startDate) && isValidIsoDate(endDate) && startDate <= endDate ? { startDate, endDate } : null;
  });
  protected readonly rangeLabel = computed(() => {
    const range = this.range();
    return range ? `${formatDisplayDate(range.startDate)} – ${formatDisplayDate(range.endDate)}` : '';
  });

  /** Falls back to an empty range while a custom range is invalid, so the page keeps its last layout. */
  private readonly rangeTransactions = computed(() => {
    const range = this.range();
    return range ? inRange(this.store.transactions(), range) : [];
  });

  protected readonly summary = computed(() => summarize(this.rangeTransactions()));
  private readonly spending = computed(() => spendingByCategory(this.rangeTransactions()));
  protected readonly categories = computed(() =>
    this.spending().map((item, index) => ({ ...item, color: colorForIndex(index) })),
  );
  protected readonly topCategories = computed(() => this.categories().slice(0, 3));
  private readonly trend = computed(() => {
    const range = this.range();
    return range ? monthlyTrend(this.store.transactions(), range) : [];
  });

  /** Display-only average, rounded to the rupee. */
  protected readonly averageMonthlySpend = computed(() => {
    const months = this.trend().length;
    return months ? Math.round(this.summary().expenses / months) : 0;
  });

  protected readonly categoryChart = computed(() => categoryBars(this.spending(), this.format));
  protected readonly trendChart = computed(() => spendingTrendLine(this.trend(), this.format));
  protected readonly incomeExpenseChart = computed(() => incomeExpenseBars(this.trend(), this.format));
  protected readonly categoryChartHeight = computed(() => Math.max(160, this.categories().length * 34 + 40));

  protected selectOption(value: RangeOption): void {
    this.option.set(value);
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
