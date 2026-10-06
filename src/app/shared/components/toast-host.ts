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
          <button
            type="button"
            class="icon-btn"
            aria-label="Dismiss notification"
            (click)="toastService.dismiss(toast.id)"
          >
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
      padding: 0.75rem 0.5rem 0.75rem 1rem;
      border-radius: 12px;
      background: var(--toast-bg);
      color: var(--toast-text);
      font-size: 0.875rem;
      font-weight: 600;
      box-shadow: var(--shadow-3);
    }

    .toast[data-tone='error'] {
      background: var(--danger);
      color: var(--on-danger);
    }

    .toast__text {
      flex: 1;
    }

    .toast .icon-btn {
      color: inherit;
    }

    .toast .icon-btn:hover {
      background: rgb(127 127 127 / 20%);
      color: inherit;
    }

    @keyframes toast-in {
      from {
        opacity: 0;
        transform: translateY(12px) scale(0.97);
      }
    }

    @media (prefers-reduced-motion: no-preference) {
      .toast {
        animation: toast-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
      }
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
