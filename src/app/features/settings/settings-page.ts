import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { filter, finalize, Observable } from 'rxjs';
import { MOCKAPI_BASE_URL, MOCKAPI_RECORD_LIMIT } from '../../core/config';
import { errorMessage } from '../../core/interceptors/api-error.interceptor';
import { TransactionType } from '../../core/models';
import { CurrencyService } from '../../core/services/currency.service';
import { DateBehavior, SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { FinanceStore } from '../../core/state/finance-store';
import { formatDisplayDate } from '../../core/utils/dates';
import { CURRENCIES, CurrencyCode, formatMoney } from '../../core/utils/money';
import { confirmAction } from '../../shared/components/confirm-dialog';

interface BulkProgress {
  label: string;
  done: number;
  total: number;
}

@Component({
  selector: 'bf-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  private readonly settingsService = inject(SettingsService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  protected readonly currency = inject(CurrencyService);
  protected readonly store = inject(FinanceStore);

  protected readonly settings = this.settingsService.settings;
  protected readonly currencies = CURRENCIES;
  protected readonly apiUrl = MOCKAPI_BASE_URL;
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
