import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { IconComponent } from './icon.component';

export type UiStateKind = 'loading' | 'empty' | 'error';

@Component({
  selector: 'app-state',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="state" [class.error]="kind === 'error'" [class.empty]="kind === 'empty'" [class.loading]="kind === 'loading'" role="status" aria-live="polite">
      @if (kind === 'loading') {
        <div class="spinner" aria-hidden="true"></div>
      } @else {
        <app-icon [name]="kind === 'error' ? 'close' : 'search'" [size]="26" class="state-ic" />
      }
      <span class="state-message">{{ message }}</span>
      @if (actionLabel) {
        <button type="button" class="btn sm" (click)="action.emit()">{{ actionLabel }}</button>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StateComponent {
  @Input() kind: UiStateKind = 'empty';
  @Input() message = '';
  @Input() actionLabel = '';
  @Output() action = new EventEmitter<void>();
}
