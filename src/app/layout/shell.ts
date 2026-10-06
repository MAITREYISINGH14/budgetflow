import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { isApiConfigured } from '../core/config';
import { SettingsService } from '../core/services/settings.service';
import { FinanceStore } from '../core/state/finance-store';
import { ToastHost } from '../shared/components/toast-host';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

interface PageInfo {
  heading: string;
  /** The dashboard opens with its own greeting, so it hides the page title. */
  hideHeading: boolean;
}

@Component({
  selector: 'bf-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastHost],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(FinanceStore);
  protected readonly settings = inject(SettingsService);

  /** Until a MockAPI URL is set in core/config.ts, the app shows setup steps instead of pages. */
  protected readonly configured = isApiConfigured();

  protected readonly nav: NavItem[] = [
    { path: '/dashboard', label: 'Dashboard', icon: 'space_dashboard' },
    { path: '/transactions', label: 'Transactions', icon: 'receipt_long' },
    { path: '/budgets', label: 'Budgets', icon: 'donut_small' },
    { path: '/analytics', label: 'Analytics', icon: 'monitoring' },
    { path: '/settings', label: 'Settings', icon: 'tune' },
  ];

  protected readonly page = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.currentPage()),
    ),
    { initialValue: { heading: '', hideHeading: true } as PageInfo },
  );

  constructor() {
    // Load transactions and budgets once for the whole app; pages read them from the store.
    if (this.configured) this.store.load();
  }

  protected toggleTheme(): void {
    this.settings.toggleTheme();
  }

  private currentPage(): PageInfo {
    let route = this.route;
    while (route.firstChild) route = route.firstChild;
    const data = route.snapshot.data;
    return {
      heading: (data['heading'] as string | undefined) ?? '',
      hideHeading: data['hideHeading'] === true,
    };
  }
}
