import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { CurrencyService } from '../../core/services/currency.service';

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

@Component({
  selector: 'bf-count-up',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span aria-hidden="true">{{ shownText() }}</span
    ><span class="sr-only">{{ finalText() }}</span>`,
  styles: `
    :host {
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class CountUp {
  readonly value = input.required<number>();
  readonly kind = input<'money' | 'percent'>('money');
  readonly duration = input(900);

  private readonly currency = inject(CurrencyService);
  private readonly shown = signal(0);
  private frame = 0;

  protected readonly shownText = computed(() => this.format(this.shown()));
  protected readonly finalText = computed(() => this.format(this.value()));

  constructor() {
    effect(() => {
      const target = this.value();
      untracked(() => this.animateTo(target));
    });
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));
  }

  private animateTo(target: number): void {
    cancelAnimationFrame(this.frame);
    const from = this.shown();
    if (from === target || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      this.shown.set(target);
      return;
    }

    const start = performance.now();
    const duration = this.duration();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      this.shown.set(progress === 1 ? target : from + (target - from) * eased);
      if (progress < 1) this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  /** In-between values are rounded; the final value is shown exactly as it would be without animation. */
  private format(value: number): string {
    const isFinal = value === this.value();
    if (this.kind() === 'percent') return `${isFinal ? value : value.toFixed(1)}%`;
    return this.currency.format(isFinal ? value : Math.round(value));
  }
}
