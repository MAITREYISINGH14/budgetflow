import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { BfChartConfig } from './chart-configs';

Chart.register(...registerables);
Chart.defaults.font.family = '"Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
Chart.defaults.color = '#5b6670';
Chart.defaults.responsive = true;
Chart.defaults.maintainAspectRatio = false;
if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
  Chart.defaults.animation = false;
}

/**
 * Thin wrapper around Chart.js. Parents pass a config built from signals with computed();
 * when it changes the chart is rebuilt. Rebuilding is simpler than diffing datasets and is
 * cheap at this data size (a handful of points per chart).
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

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart: Chart | null = null;

  constructor() {
    afterRenderEffect(() => {
      const config = this.config();
      this.chart?.destroy();
      // The union of typed configs is narrower than Chart's own generic signature.
      this.chart = new Chart(this.canvas().nativeElement, config as unknown as ChartConfiguration);
    });
    inject(DestroyRef).onDestroy(() => this.chart?.destroy());
  }
}
