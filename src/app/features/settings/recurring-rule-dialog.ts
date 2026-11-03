import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { categoriesFor } from '../../core/categories';
import { errorMessage } from '../../core/interceptors/api-error.interceptor';
import { RecurringRule, TransactionType } from '../../core/models';
import { FinanceStore } from '../../core/state/finance-store';
import { amountValidator, DESCRIPTION_MAX, firstErrorMessage } from '../../core/utils/form-validators';

export interface RecurringRuleDialogData {
  rule: RecurringRule;
}

type Field = 'type' | 'amount' | 'categoryId' | 'description' | 'day';

/**
 * Edits what a recurring rule adds from now on. Months it has already added are ordinary
 * transactions; they are changed on the Transactions page ("this and later months").
 */
@Component({
  selector: 'bf-recurring-rule-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <div class="dialog">
      <h2 class="dialog__title" id="rule-dialog-title">Edit recurring transaction</h2>
      <p class="dialog__text">Changes apply to months that have not been added yet.</p>

      <form class="dialog__form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <fieldset class="field">
          <legend class="field__label">Type</legend>
          <div class="segmented">
            <label><input type="radio" formControlName="type" value="EXPENSE" /> Expense</label>
            <label><input type="radio" formControlName="type" value="INCOME" /> Income</label>
          </div>
        </fieldset>

        <div class="form-row">
          <div class="field">
            <label class="field__label" for="rule-amount">Amount</label>
            <div class="input--prefixed">
              <span class="input__prefix" aria-hidden="true">₹</span>
              <input
                id="rule-amount"
                class="input num"
                type="number"
                inputmode="decimal"
                step="0.01"
                min="0.01"
                formControlName="amount"
                [attr.aria-invalid]="errorFor('amount') ? 'true' : null"
                [attr.aria-describedby]="errorFor('amount') ? 'rule-amount-error' : null"
              />
            </div>
            @if (errorFor('amount'); as message) {
              <p class="field__error" id="rule-amount-error">{{ message }}</p>
            }
          </div>

          <div class="field">
            <label class="field__label" for="rule-day">Day of the month</label>
            <input
              id="rule-day"
              class="input num"
              type="number"
              inputmode="numeric"
              min="1"
              max="31"
              step="1"
              formControlName="day"
              [attr.aria-invalid]="errorFor('day') ? 'true' : null"
              aria-describedby="rule-day-hint"
            />
            @if (errorFor('day')) {
              <p class="field__error">Enter a day from 1 to 31.</p>
            } @else {
              <p class="field__hint" id="rule-day-hint">Shorter months use their last day.</p>
            }
          </div>
        </div>

        <div class="field">
          <label class="field__label" for="rule-category">Category</label>
          <select
            id="rule-category"
            class="select"
            formControlName="categoryId"
            [attr.aria-invalid]="errorFor('categoryId') ? 'true' : null"
          >
            <option [ngValue]="null" disabled>Choose a category</option>
            @for (category of categoryOptions(); track category.id) {
              <option [ngValue]="category.id">{{ category.name }}</option>
            }
          </select>
          @if (errorFor('categoryId')) {
            <p class="field__error">Choose a category.</p>
          }
        </div>

        <div class="field">
          <label class="field__label" for="rule-description"
            >Description <span class="optional">(optional)</span></label
          >
          <input
            id="rule-description"
            class="input"
            type="text"
            formControlName="description"
            autocomplete="off"
            [attr.maxlength]="descriptionMax"
          />
        </div>

        @if (serverError(); as message) {
          <p class="form-error" role="alert">{{ message }}</p>
        }

        <div class="dialog__actions">
          <button type="button" class="btn btn--secondary" (click)="ref.close()">Cancel</button>
          <button type="submit" class="btn" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save changes' }}</button>
        </div>
      </form>
    </div>
  `,
})
export class RecurringRuleDialog {
  protected readonly ref = inject<DialogRef<RecurringRule>>(DialogRef);
  private readonly data = inject<RecurringRuleDialogData>(DIALOG_DATA);
  private readonly store = inject(FinanceStore);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly descriptionMax = DESCRIPTION_MAX;
  protected readonly saving = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    type: this.fb.control<TransactionType>(this.data.rule.type),
    amount: this.fb.control<number | null>(this.data.rule.amount, [Validators.required, amountValidator]),
    categoryId: this.fb.control<string | null>(this.data.rule.categoryId, Validators.required),
    description: this.fb.control(this.data.rule.description, Validators.maxLength(DESCRIPTION_MAX)),
    day: this.fb.control<number | null>(this.data.rule.day, [
      Validators.required,
      Validators.min(1),
      Validators.max(31),
      Validators.pattern(/^\d+$/),
    ]),
  });

  private readonly type = toSignal(this.form.controls.type.valueChanges, {
    initialValue: this.form.controls.type.value,
  });
  protected readonly categoryOptions = computed(() => categoriesFor(this.type()));

  constructor() {
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
    if (this.saving()) return;
    this.serverError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.store
      .updateRule(this.data.rule.id, {
        type: value.type,
        amount: Number(value.amount),
        categoryId: String(value.categoryId),
        description: value.description.trim(),
        day: Number(value.day),
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (rule) => this.ref.close(rule),
        error: (error: unknown) => this.serverError.set(errorMessage(error, 'The changes could not be saved.')),
      });
  }
}
