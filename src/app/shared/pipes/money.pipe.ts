import { inject, Pipe, PipeTransform } from '@angular/core';
import { CurrencyService } from '../../core/services/currency.service';

/**
 * Formats an INR amount in the user's display currency.
 * Impure because the currency and exchange rate are signals that can change at
 * runtime; the Intl formatters are cached, so repeated calls stay cheap.
 */
@Pipe({ name: 'money', pure: false })
export class MoneyPipe implements PipeTransform {
  private readonly currency = inject(CurrencyService);

  transform(value: number | null | undefined, style: 'standard' | 'compact' = 'standard'): string {
    if (value === null || value === undefined) return '—';
    return this.currency.format(value, { compact: style === 'compact' });
  }
}
