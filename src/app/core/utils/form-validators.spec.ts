import { FormControl } from '@angular/forms';
import { todayIso, toIsoDate } from './dates';
import { amountValidator, budgetLimitValidator, firstErrorMessage, transactionDateValidator } from './form-validators';

const run = (validator: typeof amountValidator, value: unknown) => validator(new FormControl(value));

describe('amountValidator', () => {
  it.each([250, 0.01, 99.99, 100_000_000])('accepts %s', (value) => {
    expect(run(amountValidator, value)).toBeNull();
  });

  it('leaves empty values to the required validator', () => {
    expect(run(amountValidator, null)).toBeNull();
  });

  it.each([
    [0, 'amountNotPositive'],
    [-50, 'amountNotPositive'],
    [10.555, 'amountPrecision'],
    [100_000_001, 'amountTooLarge'],
    [Number.NaN, 'amountInvalid'],
    ['abc', 'amountInvalid'],
  ])('rejects %s with %s', (value, key) => {
    expect(run(amountValidator, value)).toEqual({ [key]: true });
  });

  it('allows a zero budget limit', () => {
    expect(run(budgetLimitValidator, 0)).toBeNull();
    expect(run(budgetLimitValidator, -1)).toEqual({ amountNotPositive: true });
  });
});

describe('transactionDateValidator', () => {
  it('accepts today', () => {
    expect(run(transactionDateValidator, todayIso())).toBeNull();
  });

  it('rejects future, impossible and very old dates', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(run(transactionDateValidator, toIsoDate(tomorrow))).toEqual({ futureDate: true });
    expect(run(transactionDateValidator, '2026-02-30')).toEqual({ dateInvalid: true });
    expect(run(transactionDateValidator, '1999-12-31')).toEqual({ dateTooEarly: true });
  });
});

describe('firstErrorMessage', () => {
  it('turns error keys into readable text', () => {
    expect(firstErrorMessage({ required: true })).toBe('This field is required.');
    expect(firstErrorMessage({ futureDate: true })).toBe('Date cannot be in the future.');
    expect(firstErrorMessage({ maxlength: { requiredLength: 140, actualLength: 141 } })).toBe(
      'Keep it to 140 characters or fewer.',
    );
    expect(firstErrorMessage(null)).toBeNull();
  });
});
