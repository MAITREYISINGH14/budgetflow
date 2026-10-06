import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { FRANKFURTER_URL } from '../config';
import { ApiError } from '../interceptors/api-error.interceptor';
import { isValidIsoDate } from '../utils/dates';

export interface ExchangeRates {
  date: string;
  rates: Record<string, number>;
}

/** Client for Frankfurter, a free exchange-rate API backed by European Central Bank data. */
@Injectable({ providedIn: 'root' })
export class ExchangeRateApi {
  private readonly http = inject(HttpClient);

  latestFromInr(symbols: string[]): Observable<ExchangeRates> {
    return this.http
      .get<unknown>(`${FRANKFURTER_URL}/latest`, { params: { base: 'INR', symbols: symbols.join(',') } })
      .pipe(map(toExchangeRates));
  }
}

/**
 * Every amount on screen is multiplied by these rates, so only finite, positive numbers
 * are kept. A malformed reply becomes an error and the app falls back to showing INR.
 */
export function toExchangeRates(raw: unknown): ExchangeRates {
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const date = typeof body['date'] === 'string' ? body['date'] : '';
  const source = body['rates'] && typeof body['rates'] === 'object' ? (body['rates'] as Record<string, unknown>) : {};
  const rates: Record<string, number> = {};
  for (const [code, value] of Object.entries(source)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) rates[code] = value;
  }
  if (!isValidIsoDate(date) || Object.keys(rates).length === 0) {
    throw new ApiError(502, 'Exchange rates are unavailable right now.');
  }
  return { date, rates };
}
