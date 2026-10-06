import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const WIDTH = 100;
const HEIGHT = 32;
const PAD = 3;

/**
 * A tiny trend line drawn as SVG (no chart library), coloured with currentColor so the
 * parent decides its colour. Decorative only: the numbers it summarises are shown as text.
 */
@Component({
  selector: 'bf-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (paths(); as p) {
      <svg
        [attr.viewBox]="'0 0 ' + width + ' ' + height"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path class="area" [attr.d]="p.area" />
        <path class="line" [attr.d]="p.line" pathLength="1" />
      </svg>
    }
  `,
  styles: `
    :host {
      display: block;
      color: currentColor;
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }

    .area {
      fill: currentColor;
      fill-opacity: 0.12;
    }

    .line {
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
    }

    /* The line draws itself in from left to right. */
    @keyframes draw {
      from {
        stroke-dashoffset: 1;
      }
    }

    @media (prefers-reduced-motion: no-preference) {
      .line {
        stroke-dasharray: 1;
        animation: draw 1200ms cubic-bezier(0.2, 0.8, 0.2, 1) 300ms backwards;
      }

      .area {
        animation: fade 900ms ease 700ms backwards;
      }
    }

    @keyframes fade {
      from {
        fill-opacity: 0;
      }
    }
  `,
})
export class Sparkline {
  readonly values = input.required<readonly number[]>();

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;

  protected readonly paths = computed(() => {
    const values = this.values();
    if (values.length < 2) return null;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const stepX = WIDTH / (values.length - 1);
    const points = values.map((v, i) => {
      const x = i * stepX;
      const y = span === 0 ? HEIGHT / 2 : PAD + (1 - (v - min) / span) * (HEIGHT - PAD * 2);
      return [x, y] as const;
    });

    const line = smoothPath(points);
    const area = `${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;
    return { line, area };
  });
}

function smoothPath(points: readonly (readonly [number, number])[]): string {
  const n = points.length;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    slopes.push((points[i + 1][1] - points[i][1]) / (points[i + 1][0] - points[i][0]));
  }

  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === n - 1) return slopes[n - 2];
    return slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
  });

  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i] / slopes[i];
    const b = tangents[i + 1] / slopes[i];
    const sum = a * a + b * b;
    if (sum > 9) {
      const k = 3 / Math.sqrt(sum);
      tangents[i] = k * a * slopes[i];
      tangents[i + 1] = k * b * slopes[i];
    }
  }

  const f = (v: number) => v.toFixed(2);
  let d = `M${f(points[0][0])},${f(points[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const third = (x1 - x0) / 3;
    d += ` C${f(x0 + third)},${f(y0 + tangents[i] * third)} ${f(x1 - third)},${f(y1 - tangents[i + 1] * third)} ${f(x1)},${f(y1)}`;
  }
  return d;
}
