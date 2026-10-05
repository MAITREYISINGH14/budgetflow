import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { categoriesFor } from '../../core/categories';
import { errorMessage } from '../../core/interceptors/api-error.interceptor';
import { Transaction, TransactionPayload, TransactionType, TransactionView } from '../../core/models';
import { SettingsService } from '../../core/services/settings.service';
import { FinanceStore } from '../../core/state/finance-store';
import { MIN_DATE, todayIso } from '../../core/utils/dates';
import {
  amountValidator,
  DESCRIPTION_MAX,
  firstErrorMessage,
  transactionDateValidator,
} from '../../core/utils/form-validators';

export interface TransactionDialogData {
  transaction?: TransactionView;
}

type Field = 'type' | 'amount' | 'categoryId' | 'description' | 'date';

/** Add and edit share one form; the dialog closes with the saved transaction. */
@Component({
  selector: 'bf-transaction-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './transaction-form-dialog.html',
})
export class TransactionFormDialog {
  private readonly ref = inject<DialogRef<Transaction>>(DialogRef);
  private readonly data = inject<TransactionDialogData | null>(DIALOG_DATA, { optional: true });
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly store = inject(FinanceStore);
  private readonly settings = inject(SettingsService);

  protected readonly existing = this.data?.transaction ?? null;
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
    const request$ = this.existing
      ? this.store.updateTransaction(this.existing.id, payload)
      : this.store.createTransaction(payload);

    request$.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (saved) => {
        this.settings.rememberTransactionDate(saved.date);
        this.ref.close(saved);
      },
      error: (error: unknown) => this.serverError.set(errorMessage(error, 'The transaction could not be saved.')),
    });
  }

  protected cancel(): void {
    this.ref.close();
  }
}
