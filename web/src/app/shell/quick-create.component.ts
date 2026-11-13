import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IconComponent } from '../shared/icon.component';

export interface QuickCreateAction {
  label: string;
  path: string;
  icon: string;
  resource?: string;
}

@Component({
  selector: 'app-quick-create',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    @if (primary(); as main) {
      <div class="qc">
        <a class="btn primary qc-main" [routerLink]="main.path" [attr.title]="main.label">
          <app-icon name="plus" [size]="18" />
          <span class="qc-label">{{ main.label }}</span>
        </a>
        @if (actions().length > 1) {
          <button
            type="button"
            class="btn primary qc-toggle"
            [attr.aria-expanded]="open()"
            aria-haspopup="menu"
            aria-label="ตัวเลือกการสร้าง"
            (click)="open.set(!open())"
          >
            <app-icon name="chevron" [size]="14" />
          </button>
        }
        @if (open()) {
          <div class="qc-menu" role="menu" aria-label="สร้างใหม่">
            @for (action of actions(); track action.path) {
              <button type="button" role="menuitem" class="qc-item" (click)="choose(action.path)">
                <app-icon [name]="action.icon" [size]="17" />
                <span>{{ action.label }}</span>
                @if (action.path === main.path) {
                  <app-icon name="check" [size]="14" class="qc-check" />
                }
              </button>
            }
          </div>
        }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickCreateComponent {
  readonly currentUrl = input('');
  readonly actions = input<QuickCreateAction[]>([]);
  readonly primaryOverride = input<QuickCreateAction | null>(null);

  readonly open = signal(false);

  private readonly router = inject(Router);
  private readonly host = inject(ElementRef) as ElementRef<HTMLElement>;

  readonly primary = computed<QuickCreateAction | null>(() => {
    const override = this.primaryOverride();
    if (override) return override;

    const actions = this.actions();
    if (!actions.length) return null;

    const url = this.currentUrl().split('?')[0];
    const match = (start: string): QuickCreateAction | undefined => actions.find((action) => action.path.startsWith(start));

    if (url.startsWith('/tickets')) return match('/tickets') ?? actions[0];
    if (url.startsWith('/projects')) return match('/projects') ?? actions[0];
    if (url.startsWith('/purchase-orders')) return match('/purchase-orders') ?? actions[0];
    if (url.startsWith('/entities/invoices')) return match('/entities/invoices') ?? actions[0];
    if (url.startsWith('/entities/receipts')) return match('/entities/receipts') ?? actions[0];
    if (url.startsWith('/entities/expenses')) return match('/entities/expenses') ?? actions[0];
    return match('/tickets') ?? actions[0];
  });

  choose(path: string): void {
    this.open.set(false);
    void this.router.navigateByUrl(path);
  }

  @HostListener('document:pointerdown', ['$event'])
  onPointer(event: PointerEvent): void {
    if (!this.open()) return;
    const target = event.target as Node | null;
    if (target && this.host.nativeElement.contains(target)) return;
    this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.open.set(false);
  }
}
