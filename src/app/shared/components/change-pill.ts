import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ToneChange } from '../../core/finance/month-comparison';

const ICONS = { up: 'north', down: 'south', flat: 'east' } as const;
const SPOKEN = { up: 'Up', down: 'Down', flat: 'No change,' } as const;

/** "↑ 12%" in green when the change is good news and red when it isn't; the direction is also spoken. */
@Component({
  selector: 'bf-change-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-tone]': 'onAccent() ? null : change().tone', '[class.on-accent]': 'onAccent()' },
  template: `<span class="material-symbols-outlined" aria-hidden="true">{{ icon() }}</span
    ><span class="sr-only">{{ spoken() }}</span> {{ change().text }}`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      align-self: flex-start;
      gap: 0.25rem;
      padding: 0.25rem 0.625rem 0.25rem 0.4375rem;
      border-radius: 999px;
      background: var(--surface-sunken);
      color: var(--text-muted);
      font-size: 0.75rem;
      font-weight: 700;
      white-space: nowrap;
    }

    .material-symbols-outlined {
      font-size: 0.875rem;
    }

    :host([data-tone='good']) {
      background: var(--ok-soft);
      color: var(--income);
    }

    :host([data-tone='bad']) {
      background: var(--danger-soft);
      color: var(--danger);
    }

    /* On a bright accent card the pill stays in the card's ink so it reads on the gradient. */
    :host(.on-accent) {
      background: color-mix(in srgb, var(--hero-text) 10%, transparent);
      color: var(--hero-text);
    }
  `,
})
export class ChangePill {
  readonly change = input.required<ToneChange>();
  readonly onAccent = input(false);

  protected readonly icon = computed(() => ICONS[this.change().direction]);
  protected readonly spoken = computed(() => SPOKEN[this.change().direction]);
}
