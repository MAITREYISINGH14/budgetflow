import { AbstractControl, ValidationErrors } from '@angular/forms';
import { isValidIsoDate, MIN_DATE, todayIso } from './dates';

export const MAX_AMOUNT = 100_000_000;
export const DESCRIPTION_MAX = 140;

const TWO_DECIMALS = /^\d+(\.\d{1,2})?$/;

function checkAmount(value: unknown, allowZero: boolean): ValidationErrors | null {
  if (value === null || value === undefined || value === '') return null; // `required` reports this
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) return { amountInvalid: true };
  if (allowZero ? amount < 0 : amount <= 0) return { amountNotPositive: true };
  if (amount > MAX_AMOUNT) return { amountTooLarge: true };
  if (!TWO_DECIMALS.test(String(value))) return { amountPrecision: true };
  return null;
}

/** Positive, finite, at most two decimal places, below the API's upper bound. */
export function amountValidator(control: AbstractControl): ValidationErrors | null {
  return checkAmount(control.value, false);
}

/** Same as amountValidator but allows 0 (a budget of zero is valid). */
export function budgetLimitValidator(control: AbstractControl): ValidationErrors | null {
  return checkAmount(control.value, true);
}

/**
 * V1 policy: transactions record what already happened, so future dates are rejected.
 * Planned or recurring payments would be a separate feature.
 */
export function transactionDateValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value as string | null;
  if (!value) return null;
  if (!isValidIsoDate(value)) return { dateInvalid: true };
  if (value < MIN_DATE) return { dateTooEarly: true };
  if (value > todayIso()) return { futureDate: true };
  return null;
}

const MESSAGES: Record<string, (error: unknown) => string> = {
  required: () => 'This field is required.',
  amountInvalid: () => 'Enter a valid number.',
  amountNotPositive: () => 'Amount must be greater than 0.',
  amountTooLarge: () => 'Amount cannot be more than 10,00,00,000.',
  amountPrecision: () => 'Use at most 2 decimal places.',
  dateInvalid: () => 'Enter a valid date.',
  dateTooEarly: () => `Date cannot be earlier than ${MIN_DATE}.`,
  futureDate: () => 'Date cannot be in the future.',
  maxlength: (error) => `Keep it to ${(error as { requiredLength: number }).requiredLength} characters or fewer.`,
};

/** The message for the first error on a control, or null. */
export function firstErrorMessage(errors: ValidationErrors | null): string | null {
  if (!errors) return null;
  const [key, value] = Object.entries(errors)[0];
  return MESSAGES[key]?.(value) ?? 'This value is not valid.';
}
