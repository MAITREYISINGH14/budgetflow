import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MonthlyTrendPoint } from '../../core/models';
import { CurrencyService } from '../../core/services/currency.service';
import { formatMonth } from '../../core/utils/dates';
import { MoneyPipe } from '../../shared/pipes/money.pipe';

/**
 * Income and expenses per month as paired bars, in plain HTML and CSS like the dashboard's
 * other bars, so no charting library is needed. Long ranges scroll sideways. Screen readers
 * get the same numbers as a table.
 */
@Component({
  selector: 'bf-income-expense-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MoneyPipe],
  template: `
    <figure class="chart">
      <div class="chart__scale" aria-hidden="true">
        <span>{{ max() | money: 'compact' }}</span>
        <span>0</span>
      </div>
      <div class="chart__scroll" aria-hidden="true">
        <ul class="chart__groups" [style.min-width.rem]="bars().length * 3">
          @for (bar of bars(); track bar.month) {
            <li class="chart__group" [title]="bar.title">
              <span class="chart__pair">
                <span class="chart__bar chart__bar--income" [style.height.%]="bar.income"></span>
                <span class="chart__bar chart__bar--expense" [style.height.%]="bar.expenses"></span>
              </span>
              <span class="chart__label">{{ bar.label }}</span>
            </li>
          }
        </ul>
      </div>
      <figcaption class="chart__legend" aria-hidden="true">
        <span><span class="chart__key chart__bar--income"></span>Income</span>
        <span><span class="chart__key chart__bar--expense"></span>Expenses</span>
      </figcaption>

      <table class="sr-only">
        <caption>
          Income and expenses per month in the selected period
        </caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Income</th>
            <th scope="col">Expenses</th>
          </tr>
        </thead>
        <tbody>
          @for (point of points(); track point.month) {
            <tr>
              <th scope="row">{{ point.label }}</th>
              <td>{{ point.income | money }}</td>
              <td>{{ point.expenses | money }}</td>
            </tr>
          }
        </tbody>
      </table>
    </figure>
  `,
  styles: `
    .chart {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 0.5rem 0.75rem;
      margin: 0;
    }

    .chart__scale {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 14rem;
      font-size: 0.75rem;
      color: var(--text-subtle);
      text-align: right;
    }

    .chart__scroll {
      overflow-x: auto;
    }

    .chart__groups {
      display: flex;
      gap: 0.5rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .chart__group {
      flex: 1;
      display: grid;
      gap: 0.5rem;
      min-width: 2.5rem;
    }

    .chart__pair {
      display: flex;
      align-items: flex-end;
      justify-content: center;
      gap: 0.25rem;
      height: 14rem;
      border-bottom: 1px solid var(--chart-grid);
    }

    .chart__bar {
      width: min(1.375rem, 40%);
      min-height: 2px;
      border-radius: 6px 6px 0 0;
    }

    .chart__bar--income {
      background: var(--chart-income);
    }

    .chart__bar--expense {
      background: var(--chart-expense);
    }

    .chart__label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-subtle);
      text-align: center;
      white-space: nowrap;
    }

    .chart__legend {
      grid-column: 2;
      display: flex;
      gap: 1.25rem;
      justify-content: center;
      font-size: 0.8125rem;
      color: var(--text-muted);

      > span {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
      }
    }

    .chart__key {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 2px;
    }

    @media (prefers-reduced-motion: no-preference) {
      .chart__bar {
        transform-origin: bottom;
        animation: chart-grow 600ms cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
      }

      @keyframes chart-grow {
        from {
          transform: scaleY(0);
        }
      }
    }
  `,
})
export class IncomeExpenseChart {
  readonly data = input.required<MonthlyTrendPoint[]>();
  private readonly currency = inject(CurrencyService);

  protected readonly points = computed(() =>
    this.data().map((p) => ({ ...p, label: formatMonth(p.month, 'shortYear') })),
  );

  /** The tallest bar fills the chart; at least ₹1 so an empty range does not divide by zero. */
  protected readonly max = computed(() => Math.max(1, ...this.data().flatMap((p) => [p.income, p.expenses])));

  protected readonly bars = computed(() => {
    const max = this.max();
    return this.points().map((p) => ({
      month: p.month,
      label: p.label,
      income: (p.income / max) * 100,
      expenses: (p.expenses / max) * 100,
      title: `${p.label}: income ${this.currency.format(p.income)}, expenses ${this.currency.format(p.expenses)}`,
    }));
  });
}
