import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { MetaService } from '../core/meta.service';
import { fmtDateTime } from '../core/util';
import { ToastService } from '../shared/toast.service';

interface EventRow {
  id: string;
  at: string;
  type: string;
  entity: string;
  recordId?: string | null;
  code?: string | null;
  actorName?: string | null;
  summary: string;
}

const ENTITY_ROUTES: Record<string, string> = {
  tickets: '/tickets',
  purchaseOrders: '/purchase-orders',
  projects: '/projects',
};

@Component({
  selector: 'app-events',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="card">
      <div class="row" style="margin-bottom:12px">
        <div>
          <h3 style="margin:0">เหตุการณ์ของระบบ</h3>
          <div class="muted small">บันทึกทุกการสร้าง/แก้ไข/ลบ และคำขออนุมัติ เพื่อตรวจสอบหรือต่อยอด automation</div>
        </div>
        <span class="grow"></span>
        <div class="field" style="margin:0;min-width:190px">
          <select [value]="entity()" (change)="setEntity($any($event.target).value)">
            <option value="" [selected]="!entity()">ทุกโมดูล</option>
            @for (item of entities(); track item.key) { <option [value]="item.key" [selected]="item.key === entity()">{{ item.label }}</option> }
          </select>
        </div>
        <button type="button" class="btn" [disabled]="loading()" (click)="load()">
          {{ loading() ? 'กำลังโหลด…' : 'รีเฟรช' }}
        </button>
      </div>

      @if (error()) { <div class="state error">{{ error() }}</div> }
      @if (!loading() && !rows().length) {
        <div class="state empty">ยังไม่มีเหตุการณ์</div>
      } @else {
        <div class="event-list">
          @for (row of rows(); track row.id) {
            <div class="event-row">
              <span class="badge {{ tone(row.type) }}">{{ typeLabel(row.type) }}</span>
              <span class="event-main">
                <b>{{ row.summary || row.type }}</b>
                <span class="sub">
                  @if (row.entity) {
                    @if (row.recordId) {
                      <a [routerLink]="recordLink(row)">{{ entityLabel(row.entity) }} {{ row.code || '' }}</a>
                    } @else {
                      {{ entityLabel(row.entity) }}
                    }
                  }
                  · โดย {{ row.actorName || 'ระบบ' }}
                </span>
              </span>
              <span class="event-time muted">{{ fmtDateTime(row.at) }}</span>
            </div>
          }
        </div>
      }
      <div class="row" style="margin-top:10px">
        <span class="muted small">แสดง {{ rows().length }} เหตุการณ์ล่าสุด · รีเฟรชอัตโนมัติทุก 30 วินาที</span>
        <span class="grow"></span>
        <a class="small" routerLink="/settings">← กลับการตั้งค่า</a>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventsComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly meta = inject(MetaService);
  private readonly toast = inject(ToastService);
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly rows = signal<EventRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly entity = signal('');
  readonly fmtDateTime = fmtDateTime;
  readonly entities = signal<{ key: string; label: string }[]>([]);

  ngOnInit(): void {
    this.meta.load();
    this.api.get<{ entities: Record<string, { label: string }> }>('/meta/config').subscribe({
      next: (config) => {
        const items = Object.entries(config.entities ?? {}).map(([key, entity]) => ({ key, label: entity.label ?? key }));
        this.entities.set(items);
      },
      error: () => this.entities.set([]),
    });
    this.load();
    this.timer = setInterval(() => this.load(true), 30000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  setEntity(key: string): void {
    this.entity.set(key);
    this.load();
  }

  load(silent = false): void {
    if (!silent) this.loading.set(true);
    this.error.set('');
    this.api.get<EventRow[]>('/events', { ...(this.entity() ? { entity: this.entity() } : {}), limit: 200 }).subscribe({
      next: (rows) => {
        this.rows.set(rows ?? []);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(error));
        if (silent) this.toast.error(apiErrorMessage(error));
      },
    });
  }

  entityLabel(key: string): string {
    return this.entities().find((item) => item.key === key)?.label ?? key;
  }

  recordLink(row: EventRow): string {
    const base = ENTITY_ROUTES[row.entity];
    if (base) return `${base}/${row.recordId}`;
    return `/entities/${row.entity}/${row.recordId}`;
  }

  typeLabel(type: string): string {
    if (type === 'record.created') return 'สร้าง';
    if (type === 'record.updated') return 'แก้ไข';
    if (type === 'record.deleted') return 'ลบ/ซ่อน';
    if (type === 'record.restored') return 'กู้คืน';
    if (type === 'approval.requested') return 'ขออนุมัติ';
    if (type === 'approval.approved') return 'อนุมัติ';
    if (type === 'approval.rejected') return 'ปฏิเสธ';
    return type;
  }

  tone(type: string): string {
    if (type.includes('deleted') || type.includes('rejected')) return 'red';
    if (type.includes('created') || type.includes('approved')) return 'green';
    if (type.includes('approval')) return 'amber';
    if (type.includes('restored')) return 'violet';
    return 'blue';
  }
}
