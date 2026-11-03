import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, Observable } from 'rxjs';
import { categoriesFor } from '../../core/categories';
import { backfillCount, ordinal } from '../../core/finance/recurring';
import { errorMessage } from '../../core/interceptors/api-error.interceptor';
import {
  RecurringRule,
  RecurringScope,
  Transaction,
  TransactionPayload,
  TransactionType,
  TransactionView,
} from '../../core/models';
import { SettingsService } from '../../core/services/settings.service';
import { FinanceStore } from '../../core/state/finance-store';
import { formatDisplayDate, isValidIsoDate, MIN_DATE, todayIso } from '../../core/utils/dates';
import {
  amountValidator,
  DESCRIPTION_MAX,
  firstErrorMessage,
  transactionDateValidator,
} from '../../core/utils/form-validators';

export interface TransactionDialogData {
  transaction?: TransactionView;
  /** Open with "Repeat every month" ticked, e.g. from Settings → Add recurring. */
  repeat?: boolean;
}

/** What the dialog closes with: the saved transaction, or the new rule when "Repeat" was ticked. */
export type TransactionDialogResult = Transaction | RecurringRule;

export function isRecurringRule(result: TransactionDialogResult): result is RecurringRule {
  return 'startDate' in result;
}

type Field = 'type' | 'amount' | 'categoryId' | 'description' | 'date';

/**
 * Add and edit share one form; the dialog closes with the saved transaction.
 * A new transaction can be made to repeat monthly. Editing one that a rule created
 * asks whether the change is for this month only or this and later months.
 */
@Component({
  selector: 'bf-transaction-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './transaction-form-dialog.html',
})
export class TransactionFormDialog {
  private readonly ref = inject<DialogRef<TransactionDialogResult>>(DialogRef);
  private readonly data = inject<TransactionDialogData | null>(DIALOG_DATA, { optional: true });
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly store = inject(FinanceStore);
  private readonly settings = inject(SettingsService);

  protected readonly existing = this.data?.transaction ?? null;
  /** The rule behind the transaction being edited, if it still exists. */
  protected readonly rule = this.existing?.ruleId ? this.store.ruleFor(this.existing) : undefined;
  protected readonly ruleDay = this.rule ? ordinal(this.rule.day) : '';
  protected readonly today = todayIso();
  protected readonly minDate = MIN_DATE;
  protected readonly descriptionMax = DESCRIPTION_MAX;

  protected readonly form = this.fb.group({
    type: this.fb.control<TransactionType>(this.existing?.type ?? this.settings.settings().defaultTransactionType),
    amount: this.fb.control<number | null>(this.existing?.amount ?? null, [Validators.required, amountValidator]),
    categoryId: this.fb.control<string | null>(this.existing?.categoryId ?? null, Validators.required),
    description: this.fb.control(this.existing?.description ?? '', Validators.maxLength(DESCRIPTION_MAX)),
    date: this.fb.control(this.existing?.date ?? this.settings.defaultTransactionDate(), [
      Validators.required,
      transactionDateValidator,
    ]),
  });

  /** Kept outside `form` because it decides how the payload is saved, not what is in it. */
  protected readonly repeat = this.fb.control(this.data?.repeat ?? false);
  protected readonly scope = signal<RecurringScope>('one');

  private readonly repeatOn = toSignal(this.repeat.valueChanges, { initialValue: this.repeat.value });
  private readonly date = toSignal(this.form.controls.date.valueChanges, {
    initialValue: this.form.controls.date.value,
  });

  /** "Added on the 5th of every month. 3 transactions from 05 Sep 2026 are added now." */
  protected readonly repeatHint = computed(() => {
    const date = this.date();
    if (!this.repeatOn() || !isValidIsoDate(date) || date > this.today) return null;
    const every = `Added on the ${ordinal(Number(date.slice(8, 10)))} of every month.`;
    const count = backfillCount(date, this.today);
    return count > 1 ? `${every} ${count} transactions from ${formatDisplayDate(date)} are added now.` : every;
  });

  private readonly type = toSignal(this.form.controls.type.valueChanges, {
    initialValue: this.form.controls.type.value,
  });
  private readonly description = toSignal(this.form.controls.description.valueChanges, {
    initialValue: this.form.controls.description.value,
  });

  protected readonly categoryOptions = computed(() => categoriesFor(this.type()));
  protected readonly descriptionLength = computed(() => this.description().length);
  protected readonly saving = signal(false);
  protected readonly serverError = signal<string | null>(null);

  constructor() {
    // Income and expense have separate categories; clear a choice that no longer fits.
    this.form.controls.type.valueChanges.pipe(takeUntilDestroyed()).subscribe((type) => {
      const selected = this.form.controls.categoryId.value;
      if (selected !== null && !categoriesFor(type).some((c) => c.id === selected)) {
        this.form.controls.categoryId.setValue(null);
      }
    });
  }

  protected errorFor(field: Field): string | null {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || control.dirty) ? firstErrorMessage(control.errors) : null;
  }

  protected submit(): void {
    if (this.saving()) return; // ignore double clicks / repeated Enter while a request is in flight
    this.serverError.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const payload: TransactionPayload = {
      type: value.type,
      amount: Number(value.amount),
      categoryId: String(value.categoryId),
      description: value.description.trim(),
      date: value.date,
    };

    this.saving.set(true);
    let request$: Observable<TransactionDialogResult>;
    if (this.existing && this.rule) request$ = this.store.updateOccurrence(this.existing.id, payload, this.scope());
    else if (this.existing) request$ = this.store.updateTransaction(this.existing.id, payload);
    else if (this.repeat.value) request$ = this.store.createRecurring(payload);
    else request$ = this.store.createTransaction(payload);

    request$.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (saved) => {
        this.settings.rememberTransactionDate(payload.date);
        this.ref.close(saved);
      },
      error: (error: unknown) => this.serverError.set(errorMessage(error, 'The transaction could not be saved.')),
    });
  }

  protected cancel(): void {
    this.ref.close();
  }
}
