import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { ExchangeRateApi, ExchangeRates } from '../data/exchange-rate-api';
import { CURRENCIES, formatMoney } from '../utils/money';
import { SettingsService } from './settings.service';

/**
 * Amounts are recorded in INR. When the display currency is something else, this
 * service fetches the latest ECB rate from Frankfurter once and converts for display.
 * If the rate cannot be loaded, amounts are shown in INR rather than guessed.
 */
@Injectable({ providedIn: 'root' })
export class CurrencyService {
  private readonly settings = inject(SettingsService);
  private readonly api = inject(ExchangeRateApi);

  private readonly rates = signal<ExchangeRates | null>(null);
  readonly ratesStatus = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');

  /** The currency amounts are actually shown in right now. */
  readonly displayCurrency = computed(() => {
    const wanted = this.settings.currency();
    return wanted === 'INR' || this.rates()?.rates[wanted] ? wanted : 'INR';
  });

  /** 1 INR in the display currency, or null for INR. */
  readonly rate = computed(() => {
    const currency = this.displayCurrency();
    return currency === 'INR' ? null : (this.rates()?.rates[currency] ?? null);
  });

  readonly ratesDate = computed(() => this.rates()?.date ?? null);

  constructor() {
    effect(() => {
      if (this.settings.currency() !== 'INR') this.loadRates();
    });
  }

  loadRates(force = false): void {
    const status = this.ratesStatus();
    if (status === 'loading' || (status === 'ready' && !force)) return;
    this.ratesStatus.set('loading');
    const symbols = CURRENCIES.map((c) => c.code).filter((code) => code !== 'INR');
    this.api.latestFromInr(symbols).subscribe({
      next: (rates) => {
        this.rates.set(rates);
        this.ratesStatus.set('ready');
      },
      error: () => this.ratesStatus.set('error'),
    });
  }

  /** Formats an INR amount in the display currency. */
  format(amountInInr: number, options?: { compact?: boolean }): string {
    const rate = this.rate();
    const value = rate === null ? amountInInr : Math.round(amountInInr * rate * 100) / 100;
    return formatMoney(value, this.displayCurrency(), options);
  }
}
