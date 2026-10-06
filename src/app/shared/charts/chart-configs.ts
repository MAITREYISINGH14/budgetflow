import type { ChartConfiguration, TooltipItem } from 'chart.js';
import { CategorySpending, MonthlyTrendPoint } from '../../core/models';
import { formatMonth } from '../../core/utils/dates';

export type BfChartConfig = ChartConfiguration<'doughnut'> | ChartConfiguration<'bar'> | ChartConfiguration<'line'>;
type Format = (value: number, options?: { compact?: boolean }) => string;

export const CHART_COLORS = {
  income: 'var(--chart-income)',
  expense: 'var(--chart-expense)',
  line: 'var(--chart-line)',
  fill: 'var(--chart-fill)',
  grid: 'var(--chart-grid)',
  gap: 'var(--surface)',
};

export const CATEGORY_PALETTE = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
  'var(--chart-9)',
  'var(--chart-10)',
];

export function colorForIndex(index: number): string {
  return CATEGORY_PALETTE[index % CATEGORY_PALETTE.length];
}

const moneyAxis = (format: Format) => ({
  grid: { color: CHART_COLORS.grid },
  border: { display: false },
  ticks: { callback: (value: string | number) => format(Number(value), { compact: true }) },
});

export function categoryDoughnut(
  items: CategorySpending[],
  format: Format,
  colors?: readonly string[],
): ChartConfiguration<'doughnut'> {
  return {
    type: 'doughnut',
    data: {
      labels: items.map((i) => i.name),
      datasets: [
        {
          data: items.map((i) => i.total),
          backgroundColor: items.map((_, index) => colors?.[index] ?? colorForIndex(index)),
          borderColor: CHART_COLORS.gap,
          borderWidth: 3,
        },
      ],
    },
    options: {
      cutout: '70%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx: TooltipItem<'doughnut'>) => ` ${ctx.label}: ${format(ctx.parsed)}` } },
      },
    },
  };
}

export function spendingTrendLine(points: MonthlyTrendPoint[], format: Format): ChartConfiguration<'line'> {
  return {
    type: 'line',
    data: {
      labels: points.map((p) => formatMonth(p.month, 'shortYear')),
      datasets: [
        {
          label: 'Expenses',
          data: points.map((p) => p.expenses),
          borderColor: CHART_COLORS.line,
          backgroundColor: CHART_COLORS.fill,
          borderWidth: 2.5,
          fill: true,
          cubicInterpolationMode: 'monotone',
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBorderWidth: 2,
          pointBorderColor: CHART_COLORS.gap,
          pointBackgroundColor: CHART_COLORS.line,
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx: TooltipItem<'line'>) => ` Spent ${format(ctx.parsed.y ?? 0)}` } },
      },
      scales: { x: { grid: { display: false } }, y: { ...moneyAxis(format), beginAtZero: true } },
    },
  };
}

export function incomeExpenseBars(points: MonthlyTrendPoint[], format: Format): ChartConfiguration<'bar'> {
  return {
    type: 'bar',
    data: {
      labels: points.map((p) => formatMonth(p.month, 'shortYear')),
      datasets: [
        {
          label: 'Income',
          data: points.map((p) => p.income),
          backgroundColor: CHART_COLORS.income,
          borderRadius: 6,
          maxBarThickness: 22,
        },
        {
          label: 'Expenses',
          data: points.map((p) => p.expenses),
          backgroundColor: CHART_COLORS.expense,
          borderRadius: 6,
          maxBarThickness: 22,
        },
      ],
    },
    options: {
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 8, boxHeight: 8, useBorderRadius: true, borderRadius: 4, padding: 16 },
        },
        tooltip: {
          callbacks: { label: (ctx: TooltipItem<'bar'>) => ` ${ctx.dataset.label}: ${format(ctx.parsed.y ?? 0)}` },
        },
      },
      scales: { x: { grid: { display: false } }, y: { ...moneyAxis(format), beginAtZero: true } },
    },
  };
}

export function categoryBars(items: CategorySpending[], format: Format): ChartConfiguration<'bar'> {
  return {
    type: 'bar',
    data: {
      labels: items.map((i) => i.name),
      datasets: [
        {
          label: 'Spent',
          data: items.map((i) => i.total),
          backgroundColor: items.map((_, index) => colorForIndex(index)),
          borderRadius: 6,
          maxBarThickness: 18,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx: TooltipItem<'bar'>) => ` ${format(ctx.parsed.x ?? 0)}` } },
      },
      scales: { x: { ...moneyAxis(format), beginAtZero: true }, y: { grid: { display: false } } },
    },
  };
}
