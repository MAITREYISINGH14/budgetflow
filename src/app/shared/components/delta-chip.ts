import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MonthChange } from '../../core/finance/month-comparison';

/**
 * Small "▲ 12% vs Sep" badge. Sits on the gradient tiles, so it uses a translucent
 * white pill that works on every tile colour; the arrow carries the direction.
 */
@Component({
  selector: 'bf-delta-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (change(); as c) {
      <span class="delta" [attr.data-direction]="c.direction">
        <span class="material-symbols-outlined" aria-hidden="true">{{ icon() }}</span>
        <span class="sr-only">{{ c.direction === 'up' ? 'Up' : c.direction === 'down' ? 'Down' : 'No change,' }}</span>
        {{ c.text }}
        <span class="delta__ref">vs {{ reference() }}</span>
      </span>
    }
  `,
  styles: `
    .delta {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.1875rem 0.5625rem 0.1875rem 0.375rem;
      border-radius: 999px;
      background: rgb(255 255 255 / 16%);
      color: #ffffff;
      font-size: 0.75rem;
      font-weight: 700;
      white-space: nowrap;
      backdrop-filter: blur(4px);
    }

    .material-symbols-outlined {
      font-size: 0.9375rem;
    }

    .delta__ref {
      font-weight: 500;
      opacity: 0.78;
    }
  `,
})
export class DeltaChip {
  readonly change = input<MonthChange | null>(null);
  /** Short name of the month being compared with, e.g. "Sep". */
  readonly reference = input.required<string>();

  protected readonly icon = computed(() => {
    const direction = this.change()?.direction;
    return direction === 'up' ? 'trending_up' : direction === 'down' ? 'trending_down' : 'trending_flat';
  });
}
