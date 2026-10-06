import { computed, DOCUMENT, effect, inject, Injectable, signal } from '@angular/core';
import { TransactionType } from '../models';
import { todayIso } from '../utils/dates';
import { CURRENCIES, CurrencyCode } from '../utils/money';

export type DateBehavior = 'today' | 'last-used';
export type ThemeMode = 'light' | 'dark';

export interface AppSettings {
  currency: CurrencyCode;
  defaultTransactionType: TransactionType;
  defaultDateBehavior: DateBehavior;
  theme: ThemeMode;
}

export const DEFAULT_SETTINGS: AppSettings = {
  currency: 'INR',
  defaultTransactionType: 'EXPENSE',
  defaultDateBehavior: 'today',
  theme: 'light',
};

const SETTINGS_KEY = 'budgetflow.settings.v1';
const LAST_DATE_KEY = 'budgetflow.lastTransactionDate';

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode, quota). Settings still work for this session.
  }
}

/** First visit: follow the device's light/dark preference. */
function systemTheme(): ThemeMode {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function parseSettings(raw: string | null): AppSettings {
  if (!raw) return { ...DEFAULT_SETTINGS, theme: systemTheme() };
  try {
    const value = JSON.parse(raw) as Partial<AppSettings>;
    return {
      currency: CURRENCIES.some((c) => c.code === value.currency) ? value.currency! : DEFAULT_SETTINGS.currency,
      defaultTransactionType: value.defaultTransactionType === 'INCOME' ? 'INCOME' : 'EXPENSE',
      defaultDateBehavior: value.defaultDateBehavior === 'last-used' ? 'last-used' : 'today',
      theme: value.theme === 'dark' || value.theme === 'light' ? value.theme : systemTheme(),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Display preferences, kept in the browser's localStorage. They are personal to this
 * browser, unlike transactions and budgets, which live in MockAPI.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly document = inject(DOCUMENT);
  private readonly state = signal<AppSettings>(parseSettings(readStorage(SETTINGS_KEY)));

  readonly settings = this.state.asReadonly();
  readonly currency = computed(() => this.state().currency);
  readonly theme = computed(() => this.state().theme);
  readonly isDark = computed(() => this.state().theme === 'dark');

  constructor() {
    this.applyTheme(this.state().theme);
    effect(() => writeStorage(SETTINGS_KEY, JSON.stringify(this.state())));
  }

  update(patch: Partial<AppSettings>): void {
    this.state.update((current) => ({ ...current, ...patch }));
    if (patch.theme) this.applyTheme(patch.theme);
  }

  toggleTheme(): void {
    this.update({ theme: this.isDark() ? 'light' : 'dark' });
  }

  /** Restores preferences but keeps the chosen light/dark mode. */
  reset(): void {
    this.state.set({ ...DEFAULT_SETTINGS, theme: this.state().theme });
  }

  defaultTransactionDate(): string {
    const today = todayIso();
    if (this.state().defaultDateBehavior === 'last-used') {
      const last = readStorage(LAST_DATE_KEY);
      if (last && last <= today) return last;
    }
    return today;
  }

  rememberTransactionDate(date: string): void {
    writeStorage(LAST_DATE_KEY, date);
  }

  /**
   * Sets data-theme on <html> straight away (not in an effect), so the CSS variables
   * are already switched when charts redraw for the new theme.
   */
  private applyTheme(theme: ThemeMode): void {
    const root = this.document.documentElement;
    root.setAttribute('data-theme', theme);
    this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b111c' : '#f4f6fa');
  }
}