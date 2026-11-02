import type { ChartConfiguration, TooltipItem } from 'chart.js';
import { MonthlyTrendPoint } from '../../core/models';
import { formatMonth } from '../../core/utils/dates';

export type BfChartConfig = ChartConfiguration<'bar'>;
type Format = (value: number, options?: { compact?: boolean }) => string;

export const CHART_COLORS = {
  income: 'var(--chart-income)',
  expense: 'var(--chart-expense)',
  grid: 'var(--chart-grid)',
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
