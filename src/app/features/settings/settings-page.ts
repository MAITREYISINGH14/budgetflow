import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { filter, finalize, Observable, switchMap } from 'rxjs';
import { findCategory } from '../../core/categories';
import { MOCKAPI_RECORD_LIMIT } from '../../core/config';
import { errorMessage } from '../../core/interceptors/api-error.interceptor';
import { isRuleActive, nextOccurrence, ordinal } from '../../core/finance/recurring';
import { RecurringRule, TransactionType } from '../../core/models';
import { ClockService } from '../../core/services/clock.service';
import { NotificationKind } from '../../core/finance/notifications';
import { NOTIFICATION_KINDS, NotificationService } from '../../core/services/notification.service';
import { CurrencyService } from '../../core/services/currency.service';
import { DateBehavior, SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { FinanceStore } from '../../core/state/finance-store';
import { formatDisplayDate } from '../../core/utils/dates';
import { CURRENCIES, CurrencyCode, formatMoney } from '../../core/utils/money';
import { confirmAction } from '../../shared/components/confirm-dialog';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { openTransactionForm } from '../transactions/transaction-form-dialog';
import { RecurringRuleDialog, RecurringRuleDialogData } from './recurring-rule-dialog';
import { dialogOptions } from '../../shared/components/dialog-options';

interface BulkProgress {
  label: string;
  done: number;
  total: number;
}

@Component({
  selector: 'bf-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MoneyPipe],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  private readonly settingsService = inject(SettingsService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  protected readonly currency = inject(CurrencyService);
  protected readonly store = inject(FinanceStore);
  private readonly clock = inject(ClockService);
  protected readonly notifications = inject(NotificationService);
  protected readonly notificationKinds = NOTIFICATION_KINDS;
  protected readonly browserMessage = signal<string | null>(null);

  protected readonly settings = this.settingsService.settings;
  protected readonly currencies = CURRENCIES;
  protected readonly recordLimit = MOCKAPI_RECORD_LIMIT;

  protected readonly preview = computed(() => this.currency.format(125000));
  protected readonly rateText = computed(() => {
    const rate = this.currency.rate();
    const date = this.currency.ratesDate();
    if (rate === null || !date) return null;
    return `${formatMoney(1, 'INR')} = ${rate} ${this.currency.displayCurrency()}, ECB rate of ${formatDisplayDate(date)}`;
  });
  protected readonly rateFailed = computed(
    () => this.settings().currency !== 'INR' && this.currency.ratesStatus() === 'error',
  );

  protected readonly progress = signal<BulkProgress | null>(null);
  protected readonly progressPercent = computed(() => {
    const p = this.progress();
    return p && p.total ? Math.round((p.done / p.total) * 100) : 0;
  });
  protected readonly hasData = computed(() => this.store.transactions().length > 0 || this.store.budgets().length > 0);

  /** Recurring rules, running ones first, each soonest next date first. */
  protected readonly rules = computed(() => {
    const today = this.clock.today();
    return this.store
      .rules()
      .map((rule) => {
        const active = isRuleActive(rule, today);
        const next = active ? nextOccurrence(rule, today) : null;
        return {
          rule,
          name: rule.description || findCategory(rule.categoryId)?.name || 'Recurring transaction',
          category: findCategory(rule.categoryId)?.name ?? '',
          schedule: `every month on the ${ordinal(rule.day)}`,
          next: next ? formatDisplayDate(next) : null,
          active,
        };
      })
      .sort((a, b) => Number(b.active) - Number(a.active) || (a.next ?? '').localeCompare(b.next ?? ''));
  });

  protected addRecurring(): void {
    openTransactionForm(this.dialog, { repeat: true }).subscribe((message) => this.toast.success(message));
  }

  protected editRule(rule: RecurringRule): void {
    this.dialog
      .open<RecurringRule, RecurringRuleDialogData>(
        RecurringRuleDialog,
        dialogOptions(520, 'rule-dialog-title', { rule }),
      )
      .closed.pipe(filter((saved): saved is RecurringRule => !!saved))
      .subscribe(() => this.toast.success('Recurring transaction updated'));
  }

  protected stopRule(rule: RecurringRule, name: string): void {
    confirmAction(this.dialog, {
      title: `Stop repeating “${name}”?`,
      message: 'No more months will be added. Transactions it already added stay as they are.',
      confirmLabel: 'Stop repeating',
    })
      .pipe(
        filter(Boolean),
        switchMap(() => this.store.deleteRule(rule.id)),
      )
      .subscribe({
        next: () => this.toast.success('Stopped repeating'),
        error: (error: unknown) => this.toast.error(errorMessage(error, 'It could not be stopped.')),
      });
  }

  protected setNotificationKind(kind: NotificationKind, event: Event): void {
    this.notifications.setEnabled(kind, (event.target as HTMLInputElement).checked);
  }

  protected async setBrowserNotifications(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const result = await this.notifications.setBrowserEnabled(input.checked);
    input.checked = this.notifications.browserEnabled();
    this.browserMessage.set(
      result === 'denied'
        ? 'Notifications are blocked for this site. Allow them in your browser’s site settings, then try again.'
        : result === 'unsupported'
          ? 'This browser does not support notifications.'
          : null,
    );
  }

  protected setImportCode(event: Event): void {
    this.settingsService.update({ importCode: (event.target as HTMLInputElement).value.trim() });
    this.toast.success('Access code saved');
  }

  protected setCurrency(event: Event): void {
    this.settingsService.update({ currency: (event.target as HTMLSelectElement).value as CurrencyCode });
  }

  protected setDefaultType(type: TransactionType): void {
    this.settingsService.update({ defaultTransactionType: type });
  }

  protected setDateBehavior(behavior: DateBehavior): void {
    this.settingsService.update({ defaultDateBehavior: behavior });
  }

  protected resetPreferences(): void {
    this.settingsService.reset();
    this.toast.success('Preferences restored to defaults');
  }

  protected loadDemoData(): void {
    const size = this.store.demoDataSize();
    confirmAction(this.dialog, {
      title: 'Load demo data?',
      message: `This adds ${size.transactions} transactions and ${size.budgets} budgets across the last six months to your MockAPI project.`,
      confirmLabel: 'Load demo data',
    })
      .pipe(filter(Boolean))
      .subscribe(() =>
        this.runBulk(
          'Adding demo data',
          size.transactions + size.budgets,
          this.store.loadDemoData(),
          'Demo data loaded',
        ),
      );
  }

  protected deleteAllData(): void {
    const total = this.store.transactions().length + this.store.budgets().length;
    confirmAction(this.dialog, {
      title: 'Delete all data?',
      message: `All ${total} transactions and budgets will be removed from your MockAPI project. This cannot be undone.`,
      confirmLabel: 'Delete everything',
    })
      .pipe(filter(Boolean))
      .subscribe(() => this.runBulk('Deleting data', total, this.store.deleteAllData(), 'All data deleted'));
  }

  private runBulk(label: string, total: number, work$: Observable<number>, doneMessage: string): void {
    this.progress.set({ label, done: 0, total });
    work$.pipe(finalize(() => this.progress.set(null))).subscribe({
      next: (done) => this.progress.set({ label, done, total }),
      complete: () => this.toast.success(doneMessage),
      error: (error: unknown) =>
        this.toast.error(`${errorMessage(error, 'The operation stopped.')} Records already processed were kept.`),
    });
  }

  protected retryRates(): void {
    this.currency.loadRates(true);
  }
}
