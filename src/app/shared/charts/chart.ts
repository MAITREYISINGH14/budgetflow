import {afterRenderEffect, ChangeDetectionStrategy,Component,DestroyRef,ElementRef,inject,input,viewChild,} from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { SettingsService } from '../../core/services/settings.service';
import { BfChartConfig } from './chart-configs';

Chart.register(...registerables);
Chart.defaults.responsive = true;
Chart.defaults.maintainAspectRatio = false;
Chart.defaults.font.size = 12;
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.displayColors = false;
if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
  Chart.defaults.animation = false;
}

/** Reads a CSS variable from <html>, i.e. its value for the current theme. */
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Chart.js draws on a canvas and cannot read CSS variables, so configs use
 * "var(--chart-1)" strings and they are swapped for real colours here, just before drawing.
 */
function resolveColors<T>(value: T): T {
  if (typeof value === 'string') {
    const match = /^var\((--[\w-]+)\)$/.exec(value);
    return (match ? cssVar(match[1]) || value : value) as T;
  }
  if (Array.isArray(value)) return value.map(resolveColors) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveColors(v)])) as T;
  }
  return value;
}

/**
 * Thin wrapper around Chart.js. Parents pass a config built from signals with computed();
 * when it changes, or the light/dark theme changes, the chart is rebuilt. Rebuilding is
 * simpler than diffing datasets and is cheap at this data size.
 */
@Component({
  selector: 'bf-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart" [style.height.px]="height()">
      <canvas #canvas role="img" [attr.aria-label]="label()"></canvas>
    </div>
  `,
  styles: `
    .chart {
      position: relative;
      width: 100%;
    }
  `,
})
export class ChartComponent {
  readonly config = input.required<BfChartConfig>();
  /** Text alternative for screen readers, e.g. "Spending by category for September". */
  readonly label = input.required<string>();
  readonly height = input(260);

  private readonly settings = inject(SettingsService);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart: Chart | null = null;

  constructor() {
    afterRenderEffect(() => {
      const config = this.config();
      this.settings.theme(); // redraw when the theme changes

      Chart.defaults.font.family = cssVar('--font-sans');
      Chart.defaults.color = cssVar('--chart-text');
      Chart.defaults.plugins.tooltip.backgroundColor = cssVar('--chart-tooltip-bg');
      Chart.defaults.plugins.tooltip.titleColor = cssVar('--chart-tooltip-text');
      Chart.defaults.plugins.tooltip.bodyColor = cssVar('--chart-tooltip-text');

      this.chart?.destroy();
      // The union of typed configs is narrower than Chart's own generic signature.
      this.chart = new Chart(this.canvas().nativeElement, resolveColors(config) as unknown as ChartConfiguration);
    });
    inject(DestroyRef).onDestroy(() => this.chart?.destroy());
  }
}