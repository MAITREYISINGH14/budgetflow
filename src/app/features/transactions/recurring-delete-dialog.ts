import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { RecurringScope } from '../../core/models';
import { dialogOptions } from '../../shared/components/dialog-options';

export interface RecurringDeleteData {
  /** e.g. "Netflix" */
  label: string;
  /** e.g. "October 2026" */
  monthLabel: string;
}

/** Asks which months to delete when the transaction came from a recurring rule. */
@Component({
  selector: 'bf-recurring-delete-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dialog">
      <h2 class="dialog__title" id="recurring-delete-title">Delete “{{ data.label }}”?</h2>
      <p class="dialog__text" id="recurring-delete-text">This transaction repeats every month.</p>

      <fieldset class="field">
        <legend class="sr-only">Which months to delete</legend>
        <div class="scope-options">
          <label class="check">
            <input type="radio" name="delete-scope" [checked]="scope() === 'one'" (change)="scope.set('one')" />
            <span>
              Only {{ data.monthLabel }}
              <span class="scope-options__hint">Other months stay, and it keeps repeating.</span>
            </span>
          </label>
          <label class="check">
            <input type="radio" name="delete-scope" [checked]="scope() === 'future'" (change)="scope.set('future')" />
            <span>
              {{ data.monthLabel }} and every later month
              <span class="scope-options__hint">Earlier months stay. It stops repeating.</span>
            </span>
          </label>
        </div>
      </fieldset>

      <div class="dialog__actions">
        <button type="button" class="btn btn--secondary" (click)="ref.close()">Cancel</button>
        <button type="button" class="btn btn--danger" (click)="ref.close(scope())">Delete</button>
      </div>
    </div>
  `,
  styles: `
    .scope-options {
      display: grid;
      gap: 0.75rem;
      margin: 0.25rem 0 0.5rem;
    }

    .scope-options .check {
      align-items: flex-start;
      min-height: 0;
    }

    .scope-options .check input {
      margin-top: 0.1875rem;
    }

    .scope-options__hint {
      display: block;
      margin-top: 0.125rem;
      font-size: 0.8125rem;
      font-weight: 400;
      color: var(--text-muted);
    }
  `,
})
export class RecurringDeleteDialog {
  protected readonly data = inject<RecurringDeleteData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<RecurringScope>>(DialogRef);
  protected readonly scope = signal<RecurringScope>('one');
}

/** Opens the dialog; emits the chosen scope, or nothing when cancelled. */
export function askDeleteScope(dialog: Dialog, data: RecurringDeleteData): Observable<RecurringScope | undefined> {
  return dialog.open<RecurringScope, RecurringDeleteData>(RecurringDeleteDialog, {
    ...dialogOptions(460, 'recurring-delete-title', data),
    role: 'alertdialog',
    ariaDescribedBy: 'recurring-delete-text',
  }).closed;
}
