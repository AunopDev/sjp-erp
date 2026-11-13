import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { MetaService } from '../core/meta.service';
import { IconComponent } from '../shared/icon.component';
import { StateComponent } from '../shared/state.component';
import { ToastService } from '../shared/toast.service';
import { WorkspaceWidgetComponent } from './workspace-widget.component';
import type { DashboardData, WorkspaceConfig, WorkspaceWidgetDef, WorkspaceWidgetPosition } from '../core/dashboard.models';

const SNAP_Y = 8;
const MIN_WIDTH = 18;

const round = (value: number, step = 0.5): number => Math.round(value / step) * step;

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [IconComponent, StateComponent, WorkspaceWidgetComponent],
  template: `
    <div class="page ws-page">
      <header class="page-head ws-head">
        <div>
          <div class="dash-kicker">พื้นที่ทำงานส่วนตัว</div>
          <h1>โต๊ะทำงาน</h1>
          <div class="muted">ลากการ์ดไปวางที่ไหนก็ได้ ปรับความกว้าง และซ่อนการ์ดที่ไม่ใช้ — ระบบบันทึกให้อัตโนมัติ</div>
        </div>
        <div class="page-actions">
          @if (!editing()) {
            <button type="button" class="btn" [disabled]="!desktop()" [title]="desktop() ? 'จัดหน้าจอ' : 'จัดหน้าจอแบบอิสระได้บนจอใหญ่'" (click)="startEdit()">
              <app-icon name="grid" [size]="14" /> {{ desktop() ? 'จัดหน้าจอ' : 'จัดหน้าจอบนจอใหญ่' }}
            </button>
            @if (hasCustomLayout()) { <button type="button" class="btn ghost" (click)="resetLayout()">รีเซ็ต</button> }
          } @else {
            <span class="ws-save-state" role="status">{{ saving() ? 'กำลังบันทึก…' : savedAt() ? 'บันทึกอัตโนมัติแล้ว' : 'ยังไม่มีการเปลี่ยนแปลง' }}</span>
            <button type="button" class="btn" (click)="autoArrange()">จัดเรียงอัตโนมัติ</button>
            <button type="button" class="btn ghost" (click)="resetLayout()">รีเซ็ต</button>
            <button type="button" class="btn primary" (click)="finishEdit()">เสร็จสิ้น</button>
          }
        </div>
      </header>

      @if (loading()) {
        <app-state kind="loading" message="กำลังโหลดโต๊ะทำงาน…" />
      } @else if (error()) {
        <div class="state error">{{ error() }}</div>
      } @else if (data(); as d) {
        @if (editing()) {
          <div class="ws-editor-bar">
            <div class="ws-editor-hint">
              <app-icon name="grid" [size]="14" />
              ลากการ์ดเพื่อย้าย · ลากมุมขวาล่างเพื่อปรับความกว้าง · การ์ดที่ลากล่าสุดจะอยู่ด้านบนสุด
            </div>
            <div class="ws-catalog">
              @for (w of catalog(); track w.key) {
                <button type="button" class="ws-chip" [class.off]="isHidden(w.key)" (click)="toggleHidden(w.key)" [attr.aria-pressed]="!isHidden(w.key)">
                  <app-icon [name]="w.icon" [size]="13" />
                  {{ w.title }}
                  <span class="ws-chip-state">{{ isHidden(w.key) ? 'ซ่อน' : 'แสดง' }}</span>
                </button>
              }
            </div>
          </div>
        }

        @if (!visibleWidgets().length) {
          <div class="state empty">ซ่อนการ์ดทั้งหมดอยู่ — กด “จัดหน้าจอ” แล้วเลือกแสดงการ์ดที่ต้องการ</div>
        } @else if (canvasPositions(); as pos) {
          <div class="ws-canvas" [class.editing]="editing()" [style.min-height.px]="canvasHeight()">
            @for (w of visibleWidgets(); track w.key) {
              <div
                class="ws-widget ws-absolute"
                [class.editing]="editing()"
                [class.dragging]="dragKey() === w.key"
                [style.z-index]="pos[w.key]?.z ?? 0"
                [style.left.%]="pos[w.key]?.x ?? 0"
                [style.top.px]="pos[w.key]?.y ?? 0"
                [style.width.%]="pos[w.key]?.w ?? 100"
                [attr.data-widget]="w.key"
              >
                @if (editing()) {
                  <div
                    class="ws-toolbar"
                    role="button"
                    tabindex="0"
                    [attr.aria-label]="'ย้ายการ์ด ' + w.title"
                    title="ลากเพื่อย้าย"
                    (pointerdown)="startDrag($event, w.key)"
                    (keydown)="moveWithKeyboard($event, w.key)"
                  >
                    <app-icon name="grid" [size]="13" class="ws-grip" />
                    <b>{{ w.title }}</b>
                    <span class="grow"></span>
                    <button type="button" class="ws-icon" (pointerdown)="$event.stopPropagation()" (click)="toggleHidden(w.key)" [attr.aria-label]="'ซ่อนการ์ด ' + w.title">×</button>
                  </div>
                }
                <app-workspace-widget [widget]="w" [data]="d" />
                @if (editing()) { <span class="ws-resize" (pointerdown)="startResize($event, w.key)" aria-hidden="true"></span> }
              </div>
            }
          </div>
        } @else {
          <div class="ws-flow">
            @for (w of flowWidgets(); track w.key) {
              <div
                class="ws-widget"
                [class.editing]="editing()"
                [class.dragging]="dragKey() === w.key"
                [style.grid-column]="desktop() ? 'span ' + w.span : null"
                [attr.data-widget]="w.key"
              >
                @if (editing()) {
                  <div
                    class="ws-toolbar"
                    role="button"
                    tabindex="0"
                    [attr.aria-label]="'ย้ายการ์ด ' + w.title"
                    title="ลากเพื่อย้าย"
                    (pointerdown)="startDrag($event, w.key)"
                    (keydown)="moveWithKeyboard($event, w.key)"
                  >
                    <app-icon name="grid" [size]="13" class="ws-grip" />
                    <b>{{ w.title }}</b>
                    <span class="grow"></span>
                    <button type="button" class="ws-icon" (pointerdown)="$event.stopPropagation()" (click)="toggleHidden(w.key)" [attr.aria-label]="'ซ่อนการ์ด ' + w.title">×</button>
                  </div>
                }
                <app-workspace-widget [widget]="w" [data]="d" />
              </div>
            }
          </div>
        }
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly meta = inject(MetaService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly data = signal<DashboardData | null>(null);
  readonly editing = signal(false);
  readonly positions = signal<Record<string, WorkspaceWidgetPosition> | null>(null);
  readonly hidden = signal<string[]>([]);
  readonly saving = signal(false);
  readonly savedAt = signal('');
  readonly dragKey = signal('');
  private readonly heights = signal<Record<string, number>>({});
  private readonly savedWidgets = signal<Record<string, WorkspaceWidgetPosition> | null>(null);
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly media = window.matchMedia('(min-width: 960px)');
  readonly desktop = signal(this.media.matches);
  private readonly onMediaChange = (event: MediaQueryListEvent): void => {
    this.desktop.set(event.matches);
    if (!event.matches) this.editing.set(false);
  };
  private readonly onResize = (): void => {
    if (this.positions()) requestAnimationFrame(() => this.measureHeights());
  };

  readonly catalog = computed<WorkspaceWidgetDef[]>(() => {
    const can = (resource: string, action = 'view'): boolean => this.auth.can(resource, action);
    const all: (WorkspaceWidgetDef & { available: boolean })[] = [
      {
        key: 'kpi',
        title: 'ตัวชี้วัดสำคัญ',
        icon: 'chart',
        span: 12,
        available:
          can('tickets') || can('pm') || can('projects') || can('purchase') || can('accounting') || can('warehouse') || can('assets'),
      },
      { key: 'my-work', title: 'งานของฉัน', icon: 'check', span: 6, available: can('tickets') || can('pm') || can('projects') },
      { key: 'approvals', title: 'คำขออนุมัติ', icon: 'bell', span: 6, available: can('tickets') || can('purchase') || can('accounting') },
      { key: 'queue', title: 'คิวงานที่ต้องจัดการ', icon: 'ticket', span: 7, available: can('tickets') },
      { key: 'activity', title: 'ความเคลื่อนไหวล่าสุด', icon: 'clock', span: 5, available: true },
      { key: 'finance', title: 'ภาพรวมการเงิน', icon: 'receipt', span: 12, available: can('accounting') },
      { key: 'status', title: 'เคสตามสถานะ', icon: 'chart', span: 4, available: can('tickets') },
      { key: 'team', title: 'เคสตามทีม', icon: 'user', span: 4, available: can('tickets') },
      { key: 'assignee', title: 'เคสตามผู้รับผิดชอบ', icon: 'user', span: 4, available: can('tickets') },
      { key: 'project-steps', title: 'โครงการตามขั้นตอน', icon: 'folder', span: 6, available: can('projects') },
      { key: 'pm', title: 'งาน PM', icon: 'wrench', span: 6, available: can('pm') },
      { key: 'shortcuts', title: 'ทางลัด', icon: 'grid', span: 12, available: true },
    ];
    return all.filter((widget) => widget.available).map(({ available, ...widget }) => widget);
  });

  readonly visibleWidgets = computed<WorkspaceWidgetDef[]>(() => {
    const hidden = new Set(this.hidden());
    return this.catalog().filter((widget) => !hidden.has(widget.key));
  });

  readonly flowWidgets = computed<WorkspaceWidgetDef[]>(() => {
    const widgets = this.visibleWidgets();
    const positions = this.positions();
    if (!positions) return widgets;
    return [...widgets].sort((a, b) => {
      const pa = positions[a.key];
      const pb = positions[b.key];
      return (pa?.y ?? 0) - (pb?.y ?? 0) || (pa?.x ?? 0) - (pb?.x ?? 0);
    });
  });

  readonly canvasPositions = computed<Record<string, WorkspaceWidgetPosition> | null>(() =>
    this.desktop() ? this.positions() : null,
  );

  readonly canvasHeight = computed(() => {
    const positions = this.positions();
    if (!positions) return 480;
    const heights = this.heights();
    let bottom = 480;
    for (const widget of this.visibleWidgets()) {
      const position = positions[widget.key];
      if (!position) continue;
      bottom = Math.max(bottom, position.y + (heights[widget.key] ?? 320) + 48);
    }
    return bottom;
  });

  ngOnInit(): void {
    this.media.addEventListener('change', this.onMediaChange);
    window.addEventListener('resize', this.onResize);
    this.meta.load();
    this.loadDashboard();
    this.loadLayout();
    if (this.route.snapshot.queryParamMap.get('edit') === '1') this.editing.set(true);
  }

  ngOnDestroy(): void {
    this.media.removeEventListener('change', this.onMediaChange);
    window.removeEventListener('resize', this.onResize);
    if (this.saveTimer) clearTimeout(this.saveTimer);
  }

  hasCustomLayout(): boolean {
    return !!this.positions() || this.hidden().length > 0;
  }

  isHidden(key: string): boolean {
    return this.hidden().includes(key);
  }

  startEdit(): void {
    if (!this.desktop()) {
      this.toast.error('จัดหน้าจอแบบอิสระใช้ได้บนจอใหญ่ กรุณาเปิดบนคอมพิวเตอร์หรือแท็บเล็ตแนวนอน');
      return;
    }
    this.editing.set(true);
    if (!this.positions()) {
      requestAnimationFrame(() => this.captureFlow());
    } else {
      requestAnimationFrame(() => this.measureHeights());
    }
  }

  finishEdit(): void {
    this.editing.set(false);
    if (this.dirty) {
      void this.flushSave();
    } else {
      this.positions.set(this.savedWidgets());
    }
  }

  toggleHidden(key: string): void {
    const hidden = this.hidden();
    const next = hidden.includes(key) ? hidden.filter((item) => item !== key) : [...hidden, key];
    this.hidden.set(next);
    if (!next.includes(key)) this.ensurePosition(key);
    this.markDirty();
    if (this.positions()) requestAnimationFrame(() => this.measureHeights());
  }

  autoArrange(): void {
    this.positions.set(null);
    requestAnimationFrame(() => {
      this.captureFlow();
      this.markDirty();
    });
  }

  resetLayout(): void {
    if (!confirm('รีเซ็ตการจัดหน้าจอเป็นค่าเริ่มต้นหรือไม่?')) return;
    this.api.delete<WorkspaceConfig>('/prefs/workspace').subscribe({
      next: () => {
        this.positions.set(null);
        this.savedWidgets.set(null);
        this.hidden.set([]);
        this.editing.set(false);
        this.savedAt.set('');
        this.dirty = false;
        this.toast.show('รีเซ็ตการจัดหน้าจอแล้ว');
      },
      error: (error: unknown) => this.toast.error(apiErrorMessage(error)),
    });
  }

  startDrag(event: PointerEvent, key: string): void {
    if (!this.editing() || !this.desktop()) return;
    if ((event.target as HTMLElement).closest('button')) return;
    const positions = this.positions();
    const canvas = document.querySelector('.ws-canvas') as HTMLElement | null;
    if (!positions || !canvas) return;
    const raised = this.raise(positions, key);
    const position = raised[key];
    if (!position) return;
    event.preventDefault();
    this.positions.set(raised);
    const rect = canvas.getBoundingClientRect();
    const start = { clientX: event.clientX, clientY: event.clientY, x: position.x, y: position.y, w: position.w };
    this.dragKey.set(key);

    const move = (moveEvent: PointerEvent): void => {
      const dx = ((moveEvent.clientX - start.clientX) / Math.max(1, rect.width)) * 100;
      const x = round(Math.min(Math.max(0, start.x + dx), 100 - start.w));
      const y = Math.max(0, Math.round((start.y + moveEvent.clientY - start.clientY) / SNAP_Y) * SNAP_Y);
      this.positions.update((current) => (current ? { ...current, [key]: { ...position, x, y } } : current));
    };
    const up = (): void => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      this.dragKey.set('');
      this.markDirty();
    };
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerup', up, { once: true });
  }

  startResize(event: PointerEvent, key: string): void {
    if (!this.editing() || !this.desktop()) return;
    const positions = this.positions();
    const canvas = document.querySelector('.ws-canvas') as HTMLElement | null;
    if (!positions || !canvas) return;
    const raised = this.raise(positions, key);
    const position = raised[key];
    if (!position) return;
    event.preventDefault();
    event.stopPropagation();
    this.positions.set(raised);
    const rect = canvas.getBoundingClientRect();
    const start = { clientX: event.clientX, w: position.w };
    const move = (moveEvent: PointerEvent): void => {
      const dx = ((moveEvent.clientX - start.clientX) / Math.max(1, rect.width)) * 100;
      const max = Math.max(MIN_WIDTH, 100 - position.x);
      const w = round(Math.min(Math.max(MIN_WIDTH, start.w + dx), max), 1);
      this.positions.update((current) => (current ? { ...current, [key]: { ...position, w } } : current));
      requestAnimationFrame(() => this.measureHeights());
    };
    const up = (): void => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      this.markDirty();
    };
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerup', up, { once: true });
  }

  moveWithKeyboard(event: KeyboardEvent, key: string): void {
    if (!this.editing()) return;
    const positions = this.positions();
    if (!positions) return;
    const raised = this.raise(positions, key);
    const position = raised[key];
    if (!position) return;
    const step = event.shiftKey ? 40 : 12;
    let x = position.x;
    let y = position.y;
    let w = position.w;
    if (event.key === 'ArrowLeft') x = Math.max(0, x - step / 10);
    else if (event.key === 'ArrowRight') x = Math.min(100 - position.w, x + step / 10);
    else if (event.key === 'ArrowUp') y = Math.max(0, y - step);
    else if (event.key === 'ArrowDown') y += step;
    else if (event.key === '+' || event.key === '=') w = Math.min(100 - position.x, w + 2);
    else if (event.key === '-') w = Math.max(MIN_WIDTH, w - 2);
    else return;
    event.preventDefault();
    this.positions.set({
      ...raised,
      [key]: { ...position, x: round(x), y: Math.round(y / SNAP_Y) * SNAP_Y, w: round(w, 1) },
    });
    this.markDirty();
    requestAnimationFrame(() => this.measureHeights());
  }

  private raise(positions: Record<string, WorkspaceWidgetPosition>, key: string): Record<string, WorkspaceWidgetPosition> {
    const current = positions[key];
    if (!current) return positions;
    const maxZ = Math.max(0, ...Object.values(positions).map((position) => position.z ?? 0));
    if ((current.z ?? 0) >= maxZ) return positions;
    return { ...positions, [key]: { ...current, z: maxZ + 1 } };
  }

  private loadDashboard(): void {
    this.api.get<DashboardData>('/dashboard').subscribe({
      next: (data) => {
        this.data.set(data);
        this.loading.set(false);
        if (this.editing() && !this.positions()) requestAnimationFrame(() => this.captureFlow());
        else if (this.positions()) requestAnimationFrame(() => this.measureHeights());
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(error));
      },
    });
  }

  private loadLayout(): void {
    this.api.get<WorkspaceConfig>('/prefs/workspace').subscribe({
      next: (config) => {
        const hidden = (config.hidden ?? []).filter((key) => this.catalog().some((widget) => widget.key === key));
        this.hidden.set(hidden);
        const widgets = (config.widgets ?? {}) as Record<string, WorkspaceWidgetPosition>;
        if (Object.keys(widgets).length) {
          this.positions.set(widgets);
          this.savedWidgets.set(widgets);
          this.savedAt.set(config.updatedAt ?? '');
          requestAnimationFrame(() => {
            this.ensureVisiblePositions();
            requestAnimationFrame(() => this.measureHeights());
          });
        } else if (this.editing()) {
          requestAnimationFrame(() => this.captureFlow());
        }
      },
      error: () => undefined,
    });
  }

  private captureFlow(): void {
    if (this.positions()) return;
    const flow = document.querySelector('.ws-flow') as HTMLElement | null;
    if (!flow) return;
    const rect = flow.getBoundingClientRect();
    if (rect.width < 20) return;
    const positions: Record<string, WorkspaceWidgetPosition> = {};
    let order = 0;
    flow.querySelectorAll<HTMLElement>('.ws-widget').forEach((element) => {
      const key = element.dataset['widget'];
      if (!key) return;
      const box = element.getBoundingClientRect();
      positions[key] = {
        x: round(((box.left - rect.left) / rect.width) * 100, 0.01),
        y: Math.round(box.top - rect.top),
        w: round((box.width / rect.width) * 100, 0.01),
        z: order++,
      };
    });
    if (!Object.keys(positions).length) return;
    this.positions.set(positions);
    requestAnimationFrame(() => this.measureHeights());
  }

  private measureHeights(): void {
    const heights: Record<string, number> = {};
    document.querySelectorAll<HTMLElement>('.ws-canvas .ws-widget').forEach((element) => {
      const key = element.dataset['widget'];
      if (key) heights[key] = Math.round(element.getBoundingClientRect().height);
    });
    this.heights.set(heights);
  }

  private ensurePosition(key: string): void {
    const positions = this.positions();
    if (!positions || positions[key]) return;
    const widget = this.catalog().find((item) => item.key === key);
    if (!widget) return;
    const bottom = this.canvasHeight();
    const maxZ = Math.max(0, ...Object.values(positions).map((position) => position.z ?? 0));
    this.positions.set({ ...positions, [key]: { x: 0, y: bottom, w: round((widget.span / 12) * 100, 0.5), z: maxZ + 1 } });
    requestAnimationFrame(() => this.measureHeights());
  }

  private ensureVisiblePositions(): void {
    const positions = this.positions();
    if (!positions) return;
    const next = { ...positions };
    let bottom = Math.max(0, ...Object.values(next).map((position) => position.y));
    let maxZ = Math.max(0, ...Object.values(next).map((position) => position.z ?? 0));
    let changed = false;
    for (const widget of this.visibleWidgets()) {
      if (next[widget.key]) continue;
      next[widget.key] = { x: 0, y: bottom + 24, w: round((widget.span / 12) * 100, 0.5), z: ++maxZ };
      bottom += 320;
      changed = true;
    }
    if (!changed) return;
    this.positions.set(next);
    this.savedWidgets.set(next);
  }

  private markDirty(): void {
    this.dirty = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flushSave(), 600);
  }

  private async flushSave(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    const widgets = this.positions();
    if (!widgets) return;
    this.saving.set(true);
    try {
      const config = await firstValueFrom(
        this.api.put<WorkspaceConfig>('/prefs/workspace', { version: 1, widgets, hidden: this.hidden() }),
      );
      this.savedWidgets.set(widgets);
      this.savedAt.set(config.updatedAt || new Date().toISOString());
      this.dirty = false;
    } catch (error) {
      this.toast.error(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}

