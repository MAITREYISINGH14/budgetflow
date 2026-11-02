import { DestroyRef, DOCUMENT, inject, Injectable, signal } from '@angular/core';
import { todayIso } from '../utils/dates';

/** How often to look at the clock while the tab is open. Cheap, and catches midnight within a minute. */
const CHECK_EVERY_MS = 60_000;

/**
 * Today's date as a signal. Pages read `today()` instead of calling todayIso() once when
 * they are created, so a tab left open overnight or into a new month moves on by itself:
 * "this month", days left and per-day amounts all recompute.
 */
@Injectable({ providedIn: 'root' })
export class ClockService {
  private readonly state = signal(todayIso());
  readonly today = this.state.asReadonly();

  constructor() {
    const document = inject(DOCUMENT);
    const refresh = () => this.refresh();
    const timer = setInterval(refresh, CHECK_EVERY_MS);
    // Phones suspend timers in background tabs, so also check when the tab comes back.
    document.addEventListener('visibilitychange', refresh);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    });
  }

  /** Re-reads the clock; only notifies when the date actually changed. */
  refresh(): void {
    const now = todayIso();
    if (now !== this.state()) this.state.set(now);
  }
}
