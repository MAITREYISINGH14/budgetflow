import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { AppNotification, buildNotifications, NotificationKind } from '../finance/notifications';
import { FinanceStore } from '../state/finance-store';
import { ClockService } from './clock.service';
import { CurrencyService } from './currency.service';

export interface NotificationKindInfo {
  kind: NotificationKind;
  label: string;
  description: string;
  defaultOn: boolean;
  /** Also shown as a browser notification when those are switched on. */
  push: boolean;
}

/** In the order Settings lists them. */
export const NOTIFICATION_KINDS: readonly NotificationKindInfo[] = [
  {
    kind: 'BILL_DUE',
    label: 'Bills coming up',
    description: 'Three days before a recurring expense.',
    defaultOn: true,
    push: true,
  },
  {
    kind: 'BUDGET_OVER',
    label: 'Over budget',
    description: 'When a category goes over its limit.',
    defaultOn: true,
    push: true,
  },
  {
    kind: 'BUDGET_NEAR',
    label: 'Near a budget limit',
    description: 'When a category reaches 75%.',
    defaultOn: true,
    push: true,
  },
  {
    kind: 'UNUSUAL_SPEND',
    label: 'Unusual payments',
    description: 'A payment far above what you usually spend there.',
    defaultOn: true,
    push: true,
  },
  {
    kind: 'NEW_MONTH',
    label: 'New month set-up',
    description: 'When a new month has no budgets yet.',
    defaultOn: true,
    push: false,
  },
  {
    kind: 'MONTH_RECAP',
    label: 'Month recap',
    description: 'How the last month went, in its first week.',
    defaultOn: true,
    push: false,
  },
  {
    kind: 'RECURRING_ADDED',
    label: 'Recurring added',
    description: 'When a recurring transaction is added.',
    defaultOn: true,
    push: false,
  },
  {
    kind: 'LOGGING_NUDGE',
    label: 'Reminder to log',
    description: 'After four days with nothing added.',
    defaultOn: false,
    push: false,
  },
];

const PUSH_KINDS = new Set(NOTIFICATION_KINDS.filter((k) => k.push).map((k) => k.kind));
const STORAGE_KEY = 'budgetflow.notifications.v1';
/** Ids are kept for read/dismissed/pushed state; old ones fall off the end. */
const MAX_IDS = 500;
/** Browser notifications at once, so a backlog never floods the screen. */
const MAX_PUSH_AT_ONCE = 3;

interface StoredState {
  read: string[];
  dismissed: string[];
  pushed: string[];
  enabled: Partial<Record<NotificationKind, boolean>>;
  browser: boolean;
}

export type BrowserPermission = 'unsupported' | 'default' | 'granted' | 'denied';

const EMPTY: StoredState = { read: [], dismissed: [], pushed: [], enabled: {}, browser: false };

function load(): StoredState {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<StoredState> | null;
    if (!raw || typeof raw !== 'object') return EMPTY;
    const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    return {
      read: ids(raw.read),
      dismissed: ids(raw.dismissed),
      pushed: ids(raw.pushed),
      enabled: raw.enabled && typeof raw.enabled === 'object' ? raw.enabled : {},
      browser: raw.browser === true,
    };
  } catch {
    return EMPTY;
  }
}

function save(state: StoredState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable: notifications still work for this session.
  }
}

function addIds(list: string[], ids: string[]): string[] {
  const set = new Set(list);
  const added = ids.filter((id) => !set.has(id));
  return added.length ? [...list, ...added].slice(-MAX_IDS) : list;
}

function permission(): BrowserPermission {
  return typeof Notification === 'undefined' ? 'unsupported' : (Notification.permission as BrowserPermission);
}

/**
 * Notifications: what core/finance/notifications.ts says is worth telling, plus which
 * ones were read or dismissed and which kinds are switched on. State lives in this
 * browser's localStorage, like the other preferences.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly store = inject(FinanceStore);
  private readonly clock = inject(ClockService);
  private readonly currency = inject(CurrencyService);
  private readonly router = inject(Router);

  private readonly state = signal<StoredState>(load());
  readonly browserPermission = signal<BrowserPermission>(permission());

  readonly enabled = computed(() => {
    const stored = this.state().enabled;
    return Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k.kind, stored[k.kind] ?? k.defaultOn])) as Record<
      NotificationKind,
      boolean
    >;
  });

  readonly browserEnabled = computed(() => this.state().browser && this.browserPermission() === 'granted');

  /** Current notifications, without dismissed ones. Empty until the data has loaded. */
  readonly notifications = computed<AppNotification[]>(() => {
    if (this.store.status() !== 'ready') return [];
    const dismissed = new Set(this.state().dismissed);
    return buildNotifications({
      today: this.clock.today(),
      rules: this.store.rules(),
      transactions: this.store.transactions(),
      budgets: this.store.budgetViews(),
      format: (value) => this.currency.format(value),
      enabled: this.enabled(),
    }).filter((n) => !dismissed.has(n.id));
  });

  private readonly readIds = computed(() => new Set(this.state().read));
  readonly unread = computed(() => this.notifications().filter((n) => !this.readIds().has(n.id)));
  readonly unreadCount = computed(() => this.unread().length);

  constructor() {
    effect(() => save(this.state()));

    // Browser notifications for new, important items, once each.
    effect(() => {
      const unread = this.unread();
      if (!this.browserEnabled()) return;
      untracked(() => {
        const pushed = new Set(this.state().pushed);
        const fresh = unread.filter((n) => PUSH_KINDS.has(n.kind) && !pushed.has(n.id));
        if (fresh.length === 0) return;
        fresh.slice(0, MAX_PUSH_AT_ONCE).forEach((n) => this.showBrowserNotification(n));
        this.state.update((s) => ({
          ...s,
          pushed: addIds(
            s.pushed,
            fresh.map((n) => n.id),
          ),
        }));
      });
    });
  }

  isRead(id: string): boolean {
    return this.readIds().has(id);
  }

  markAllRead(): void {
    const ids = this.notifications().map((n) => n.id);
    this.state.update((s) => ({ ...s, read: addIds(s.read, ids) }));
  }

  dismiss(id: string): void {
    this.state.update((s) => ({ ...s, dismissed: addIds(s.dismissed, [id]), read: addIds(s.read, [id]) }));
  }

  setEnabled(kind: NotificationKind, on: boolean): void {
    this.state.update((s) => ({ ...s, enabled: { ...s.enabled, [kind]: on } }));
  }

  /**
   * Turns browser notifications on (asking for permission if needed) or off. What is
   * already showing counts as announced, so switching on does not replay old items.
   */
  async setBrowserEnabled(on: boolean): Promise<BrowserPermission> {
    if (!on) {
      this.state.update((s) => ({ ...s, browser: false }));
      return this.browserPermission();
    }
    let result = permission();
    if (result === 'default') result = (await Notification.requestPermission()) as BrowserPermission;
    this.browserPermission.set(result);
    if (result !== 'granted') {
      this.state.update((s) => ({ ...s, browser: false }));
      return result;
    }
    const current = this.notifications().map((n) => n.id);
    this.state.update((s) => ({ ...s, browser: true, pushed: addIds(s.pushed, current) }));
    return result;
  }

  /** Follows a notification's action inside the app. */
  open(notification: AppNotification): void {
    if (notification.action) {
      this.router.navigate([notification.action.path], { queryParams: notification.action.queryParams ?? {} });
    }
  }

  private showBrowserNotification(n: AppNotification): void {
    try {
      const shown = new Notification(n.title, { body: n.body, tag: n.id, icon: '/favicon.svg' });
      shown.onclick = () => {
        window.focus();
        this.open(n);
        shown.close();
      };
    } catch {
      // Some mobile browsers only allow notifications from a service worker; the bell still has it.
    }
  }
}
