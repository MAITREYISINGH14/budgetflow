import { ApiError } from '../interceptors/api-error.interceptor';
import { toExchangeRates } from './exchange-rate-api';

describe('toExchangeRates', () => {
  it('keeps a valid reply as it is', () => {
    expect(toExchangeRates({ date: '2026-10-05', rates: { USD: 0.012, EUR: 0.011 } })).toEqual({
      date: '2026-10-05',
      rates: { USD: 0.012, EUR: 0.011 },
    });
  });

  it('drops rates that are not finite, positive numbers', () => {
    const result = toExchangeRates({ date: '2026-10-05', rates: { USD: 0.012, EUR: 0, GBP: '0.009', JPY: -1 } });
    expect(result.rates).toEqual({ USD: 0.012 });
  });

  it.each([
    ['a missing body', null],
    ['an invalid date', { date: 'yesterday', rates: { USD: 0.012 } }],
    ['no usable rates', { date: '2026-10-05', rates: { USD: 'n/a' } }],
  ])('rejects %s', (_label, raw) => {
    expect(() => toExchangeRates(raw)).toThrow(ApiError);
  });
});
