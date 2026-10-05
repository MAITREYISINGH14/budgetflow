import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FRANKFURTER_URL } from '../config';
import { CurrencyService } from './currency.service';
import { SettingsService } from './settings.service';

describe('CurrencyService', () => {
  let currency: CurrencyService;
  let settings: SettingsService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    currency = TestBed.inject(CurrencyService);
    settings = TestBed.inject(SettingsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('formats in rupees by default without calling the API', () => {
    TestBed.tick();
    expect(currency.format(125000)).toBe('₹1,25,000');
    http.expectNone(() => true);
  });

  it('fetches the rate once and converts when another currency is chosen', () => {
    settings.update({ currency: 'USD' });
    TestBed.tick();

    const request = http.expectOne((r) => r.url === `${FRANKFURTER_URL}/latest`);
    expect(request.request.params.get('base')).toBe('INR');
    request.flush({ amount: 1, base: 'INR', date: '2026-10-02', rates: { USD: 0.012, EUR: 0.011, GBP: 0.0094 } });

    expect(currency.format(100000)).toBe('$1,200');
    expect(currency.ratesDate()).toBe('2026-10-02');

    settings.update({ currency: 'EUR' });
    TestBed.tick();
    http.expectNone(() => true); // reuses the rates already loaded
  });

  it('falls back to rupees when the rate cannot be loaded', () => {
    settings.update({ currency: 'GBP' });
    TestBed.tick();
    http.expectOne(() => true).error(new ProgressEvent('error'));

    expect(currency.ratesStatus()).toBe('error');
    expect(currency.format(500)).toBe('₹500');
  });
});
