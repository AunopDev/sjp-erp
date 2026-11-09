import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-host',
  standalone: true,
  template: `
    <div class="toasts" role="status" aria-live="polite" aria-atomic="false">
      @for (toast of toasts.items(); track toast.id) {
        <div class="toast" [class.err]="toast.type === 'err'" (mouseenter)="toasts.pause(toast.id)" (mouseleave)="toasts.resume(toast.id)">
          <span class="toast-msg">{{ toast.msg }}</span>
          <button type="button" class="toast-close" (click)="toasts.dismiss(toast.id)" aria-label="ปิดข้อความ">×</button>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastHostComponent {
  readonly toasts = inject(ToastService);
}
