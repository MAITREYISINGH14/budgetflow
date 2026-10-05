import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { map, Observable } from 'rxjs';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel: string;
}

@Component({
  selector: 'bf-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dialog">
      <h2 class="dialog__title" id="confirm-title">{{ data.title }}</h2>
      <p class="dialog__text" id="confirm-message">{{ data.message }}</p>
      <div class="dialog__actions">
        <button type="button" class="btn btn--secondary" (click)="ref.close(false)">Cancel</button>
        <button type="button" class="btn btn--danger" (click)="ref.close(true)">{{ data.confirmLabel }}</button>
      </div>
    </div>
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
}

/** Opens the confirmation dialog and emits true only when the user confirms. */
export function confirmAction(dialog: Dialog, data: ConfirmDialogData): Observable<boolean> {
  return dialog
    .open<boolean, ConfirmDialogData>(ConfirmDialog, {
      data,
      role: 'alertdialog',
      ariaLabelledBy: 'confirm-title',
      ariaDescribedBy: 'confirm-message',
      panelClass: 'bf-dialog',
      width: '420px',
      maxWidth: 'calc(100vw - 2rem)',
    })
    .closed.pipe(map((confirmed) => confirmed === true));
}
