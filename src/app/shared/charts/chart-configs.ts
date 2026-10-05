import type { ChartConfiguration, TooltipItem } from 'chart.js';
import { CategorySpending, MonthlyTrendPoint } from '../../core/models';
import { formatMonth } from '../../core/utils/dates';

export type BfChartConfig = ChartConfiguration<'doughnut'> | ChartConfiguration<'bar'> | ChartConfiguration<'line'>;
type Format = (value: number, options?: { compact?: boolean }) => string;

export const CHART_COLORS = {
  income: '#1f7a56',
  expense: '#b4472f',
  ink: '#17324d',
  grid: '#e4e9e6',
};

/** Ten distinguishable, muted colours; categories keep their colour across charts. */
export const CATEGORY_PALETTE = [
  '#17324d', '#3d7ea6', '#1f7a56', '#c38a2c', '#b4472f',
  '#6f5a96', '#2b8a8a', '#8a9455', '#9a5a72', '#6d7b86',
];

export function colorForIndex(index: number): string {
  return CATEGORY_PALETTE[index % CATEGORY_PALETTE.length];
}

const moneyAxis = (format: Format) => ({
  grid: { color: CHART_COLORS.grid },
  border: { display: false },
  ticks: { callback: (value: string | number) => format(Number(value), { compact: true }) },
});

export function categoryDoughnut(items: CategorySpending[], format: Format): ChartConfiguration<'doughnut'> {
  return {
    type: 'doughnut',
    data: {
      labels: items.map((i) => i.name),
      datasets: [
        {
          data: items.map((i) => i.total),
          backgroundColor: items.map((_, index) => colorForIndex(index)),
          borderColor: '#ffffff',
          borderWidth: 2,
        },
      ],
    },
    options: {
      cutout: '66%',
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
          borderColor: CHART_COLORS.ink,
          backgroundColor: 'rgba(23, 50, 77, 0.08)',
          fill: true,
          tension: 0.25,
          pointRadius: 3,
          pointBackgroundColor: CHART_COLORS.ink,
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
        { label: 'Income', data: points.map((p) => p.income), backgroundColor: CHART_COLORS.income, borderRadius: 3, maxBarThickness: 28 },
        { label: 'Expenses', data: points.map((p) => p.expenses), backgroundColor: CHART_COLORS.expense, borderRadius: 3, maxBarThickness: 28 },
      ],
    },
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 2 } },
        tooltip: { callbacks: { label: (ctx: TooltipItem<'bar'>) => ` ${ctx.dataset.label}: ${format(ctx.parsed.y ?? 0)}` } },
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
          borderRadius: 3,
          maxBarThickness: 22,
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
