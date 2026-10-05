import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export type StateKind = 'loading' | 'error' | 'empty';

/** One component for the loading, error and empty states used on every page. */
@Component({
  selector: 'bf-state-message',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="state" [attr.data-kind]="kind()" [attr.role]="kind() === 'error' ? 'alert' : 'status'">
      @if (kind() === 'loading') {
        <span class="spinner" aria-hidden="true"></span>
      } @else {
        <span class="material-symbols-outlined state__icon" aria-hidden="true">{{ icon() }}</span>
      }
      <p class="state__title">{{ title() }}</p>
      @if (message()) {
        <p class="state__message">{{ message() }}</p>
      }
      @if (actionLabel()) {
        <button type="button" class="btn btn--secondary" (click)="action.emit()">{{ actionLabel() }}</button>
      }
    </div>
  `,
  styleUrl: './state-message.scss',
})
export class StateMessage {
  readonly kind = input<StateKind>('empty');
  readonly title = input.required<string>();
  readonly message = input<string | null>(null);
  readonly actionLabel = input<string | null>(null);
  readonly action = output<void>();

  protected readonly icon = computed(() => (this.kind() === 'error' ? 'cloud_off' : 'inbox'));
}
