import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'bf-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toasts" aria-live="polite" aria-atomic="false">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast" [attr.data-tone]="toast.tone">
          <span class="material-symbols-outlined" aria-hidden="true">
            {{ toast.tone === 'success' ? 'check_circle' : 'error' }}
          </span>
          <span class="toast__text">{{ toast.message }}</span>
          <button type="button" class="icon-btn" aria-label="Dismiss notification" (click)="toastService.dismiss(toast.id)">
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .toasts {
      position: fixed;
      right: 1rem;
      bottom: 1rem;
      z-index: 1100;
      display: grid;
      gap: 0.5rem;
      max-width: min(26rem, calc(100vw - 2rem));
    }

    .toast {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      padding: 0.625rem 0.5rem 0.625rem 0.875rem;
      border-radius: 8px;
      background: var(--ink);
      color: #fff;
      box-shadow: 0 6px 20px rgba(16, 32, 48, 0.18);
    }

    .toast[data-tone='error'] {
      background: var(--danger);
    }

    .toast__text {
      flex: 1;
    }

    .toast .icon-btn {
      color: inherit;
    }

    @media (max-width: 720px) {
      .toasts {
        bottom: 5rem;
      }
    }
  `,
})
export class ToastHost {
  protected readonly toastService = inject(ToastService);
}
