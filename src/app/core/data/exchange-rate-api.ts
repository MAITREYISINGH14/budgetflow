import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { FRANKFURTER_URL } from '../config';

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
      .get<{ date: string; rates: Record<string, number> }>(`${FRANKFURTER_URL}/latest`, {
        params: { base: 'INR', symbols: symbols.join(',') },
      })
      .pipe(map(({ date, rates }) => ({ date, rates })));
  }
}
