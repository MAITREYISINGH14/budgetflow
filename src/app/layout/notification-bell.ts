import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppNotification } from '../core/finance/notifications';
import { ClockService } from '../core/services/clock.service';
import { NotificationService } from '../core/services/notification.service';
import { addDays, formatDisplayDate } from '../core/utils/dates';

/** The bell in the app bar: unread count, and a panel listing current notifications. */
@Component({
  selector: 'bf-notification-bell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close(true)',
  },
  template: `
    <button
      type="button"
      class="bell"
      (click)="toggle()"
      [attr.aria-expanded]="open()"
      aria-controls="notification-panel"
      [attr.aria-label]="service.unreadCount() ? 'Notifications, ' + service.unreadCount() + ' new' : 'Notifications'"
    >
      <span class="material-symbols-outlined" aria-hidden="true">notifications</span>
      @if (service.unreadCount()) {
        <span class="bell__badge" aria-hidden="true">{{
          service.unreadCount() > 9 ? '9+' : service.unreadCount()
        }}</span>
      }
    </button>

    @if (open()) {
      <section class="panel bell__panel" id="notification-panel" role="dialog" aria-labelledby="notification-title">
        <header class="bell__head">
          <h2 class="bell__title" id="notification-title">Notifications</h2>
          <a class="bell__settings" routerLink="/settings" fragment="notifications" (click)="close()">Settings</a>
        </header>

        @if (service.notifications().length) {
          <ul class="bell__list">
            @for (n of service.notifications(); track n.id) {
              <li class="bell__item" [attr.data-tone]="n.tone" [class.is-new]="fresh().has(n.id)">
                <span class="material-symbols-outlined bell__icon" aria-hidden="true">{{ n.icon }}</span>
                <div class="bell__text">
                  <p class="bell__item-title">
                    @if (fresh().has(n.id)) {
                      <span class="sr-only">New: </span>
                    }
                    {{ n.title }}
                  </p>
                  @if (n.body) {
                    <p class="bell__body">{{ n.body }}</p>
                  }
                  <div class="bell__meta">
                    <span>{{ when(n) }}</span>
                    @if (n.action) {
                      <button type="button" class="bell__action" (click)="follow(n)">{{ n.action.label }}</button>
                    }
                  </div>
                </div>
                <button
                  type="button"
                  class="icon-btn bell__dismiss"
                  (click)="service.dismiss(n.id)"
                  [attr.aria-label]="'Dismiss: ' + n.title"
                >
                  <span class="material-symbols-outlined" aria-hidden="true">close</span>
                </button>
              </li>
            }
          </ul>
        } @else {
          <p class="bell__empty">You’re all caught up.</p>
        }
      </section>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: inline-flex;
    }

    // Same as the app bar's other round buttons (the theme toggle).
    .bell {
      position: relative;
      display: grid;
      place-items: center;
      width: 2.75rem;
      height: 2.75rem;
      border: 1px solid var(--border);
      border-radius: 50%;
      background: var(--nav-bg);
      color: var(--text);
      cursor: pointer;
      transition: background-color 160ms ease;

      &:hover {
        background: var(--surface-hover);
      }
    }

    .bell__badge {
      position: absolute;
      top: 0.125rem;
      right: 0.125rem;
      min-width: 1.125rem;
      height: 1.125rem;
      padding: 0 0.25rem;
      border-radius: 999px;
      background: var(--danger);
      color: var(--on-danger);
      font-size: 0.6875rem;
      font-weight: 800;
      line-height: 1.125rem;
      text-align: center;
    }

    .bell__panel {
      position: absolute;
      top: calc(100% + 0.5rem);
      right: 0;
      z-index: 1000;
      width: min(24rem, calc(100vw - 2rem));
      max-height: min(32rem, 75vh);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-radius: var(--radius-sm);
      box-shadow: var(--shadow-3);
    }

    .bell__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.875rem 1rem 0.625rem;
      border-bottom: 1px solid var(--border-soft);
    }

    .bell__title {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 700;
    }

    .bell__settings {
      font-size: 0.8125rem;
      font-weight: 700;
      color: var(--primary);
    }

    .bell__list {
      overflow-y: auto;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .bell__item {
      display: grid;
      grid-template-columns: 1.875rem minmax(0, 1fr) auto;
      gap: 0.625rem;
      padding: 0.75rem 0.5rem 0.75rem 1rem;

      & + & {
        border-top: 1px solid var(--border-soft);
      }

      &.is-new {
        background: color-mix(in srgb, var(--primary) 5%, transparent);
      }
    }

    .bell__icon {
      display: grid;
      place-items: center;
      width: 1.875rem;
      height: 1.875rem;
      border-radius: 50%;
      font-size: 1.0625rem;
      font-variation-settings: 'FILL' 1;
      background: var(--primary-soft);
      color: var(--primary);

      [data-tone='danger'] & {
        background: var(--danger-soft);
        color: var(--danger);
      }

      [data-tone='warn'] & {
        background: var(--warn-soft);
        color: var(--warn-text);
      }

      [data-tone='ok'] & {
        background: var(--ok-soft);
        color: var(--income);
      }
    }

    .bell__item-title {
      margin: 0.1875rem 0 0;
      font-size: 0.875rem;
      font-weight: 600;
      line-height: 1.4;
    }

    .bell__body {
      margin: 0.25rem 0 0;
      font-size: 0.8125rem;
      line-height: 1.45;
      color: var(--text-muted);
    }

    .bell__meta {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-top: 0.375rem;
      font-size: 0.75rem;
      color: var(--text-subtle);
    }

    .bell__action {
      padding: 0;
      border: 0;
      background: none;
      color: var(--primary);
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }

    .bell__dismiss {
      width: 2rem;
      height: 2rem;
    }

    .bell__empty {
      margin: 0;
      padding: 1.5rem 1rem;
      text-align: center;
      color: var(--text-muted);
      font-size: 0.875rem;
    }

    @media (max-width: 600px) {
      .bell__panel {
        position: fixed;
        top: 4rem;
        right: 1rem;
        left: 1rem;
        width: auto;
      }
    }
  `,
})
export class NotificationBell {
  protected readonly service = inject(NotificationService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly clock = inject(ClockService);

  protected readonly open = signal(false);
  /** Unread when the panel opened, so they stay highlighted after being marked read. */
  protected readonly fresh = signal<ReadonlySet<string>>(new Set());

  protected toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.fresh.set(new Set(this.service.unread().map((n) => n.id)));
    this.open.set(true);
    this.service.markAllRead();
  }

  protected close(returnFocus = false): void {
    if (!this.open()) return;
    this.open.set(false);
    if (returnFocus) this.host.nativeElement.querySelector<HTMLButtonElement>('.bell')?.focus();
  }

  protected follow(n: AppNotification): void {
    this.close();
    this.service.open(n);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  /** "Today", "Yesterday", "In 3 days" or the date. */
  protected when(n: AppNotification): string {
    const today = this.clock.today();
    if (n.date === today) return 'Today';
    if (n.date === addDays(today, -1)) return 'Yesterday';
    if (n.date === addDays(today, 1)) return 'Tomorrow';
    for (let days = 2; days <= 7; days++) if (n.date === addDays(today, days)) return `In ${days} days`;
    return formatDisplayDate(n.date);
  }
}
