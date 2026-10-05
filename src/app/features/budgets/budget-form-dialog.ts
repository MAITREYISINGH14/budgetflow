import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { errorMessage } from '../../core/interceptors/api-error.interceptor';
import { Budget, BudgetView, Category, YearMonth } from '../../core/models';
import { FinanceStore } from '../../core/state/finance-store';
import { formatMonth, toIsoMonth } from '../../core/utils/dates';
import { budgetLimitValidator, firstErrorMessage } from '../../core/utils/form-validators';

export interface BudgetDialogData {
  period: YearMonth;
  budget?: BudgetView;
  /** Expense categories that do not have a budget for this month yet. */
  availableCategories: Category[];
}

@Component({
  selector: 'bf-budget-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './budget-form-dialog.html',
})
export class BudgetFormDialog {
  private readonly ref = inject<DialogRef<Budget>>(DialogRef);
  protected readonly data = inject<BudgetDialogData>(DIALOG_DATA);
  private readonly store = inject(FinanceStore);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly existing = this.data.budget ?? null;
  protected readonly monthLabel = formatMonth(toIsoMonth(this.data.period));
  protected readonly saving = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    categoryId: this.fb.control<string | null>(this.existing?.categoryId ?? null, Validators.required),
    limit: this.fb.control<number | null>(this.existing?.limit ?? null, [Validators.required, budgetLimitValidator]),
  });

  protected errorFor(field: 'categoryId' | 'limit'): string | null {
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

    const { categoryId, limit } = this.form.getRawValue();
    const request$ = this.existing
      ? this.store.updateBudgetLimit(this.existing.id, Number(limit))
      : this.store.createBudget({ categoryId: String(categoryId), limit: Number(limit), ...this.data.period });

    this.saving.set(true);
    request$.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (budget) => this.ref.close(budget),
      error: (error: unknown) => this.serverError.set(errorMessage(error, 'The budget could not be saved.')),
    });
  }

  protected cancel(): void {
    this.ref.close();
  }
}
