import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { MetaService } from '../core/meta.service';
import { fmtDate, fmtMoney, todayStr } from '../core/util';
import type { ColumnDef, TabDef } from '../shared/data-table.component';
import { DataTableComponent } from '../shared/data-table.component';
import { RecordFormComponent } from '../shared/record-form.component';
import { ToastService } from '../shared/toast.service';
import type { RecordRow } from '../core/models';

@Component({
  selector: 'app-purchase',
  standalone: true,
  imports: [DataTableComponent, RecordFormComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>ใบสั่งซื้อและรับสินค้า</h1><div class="muted">จัดซื้อ → รับสินค้า → เข้าคลัง</div></div>
        <div class="page-actions">@if (auth.can('purchase','create')) { <button type="button" class="btn primary" (click)="formOpen.set(true)">+ สร้างใบสั่งซื้อ</button> }</div>
      </div>
      <app-data-table
        [columns]="columns()"
        [rows]="rows()"
        [tabs]="tabs"
        [exportName]="'purchase-orders'"
        [canExport]="auth.can('purchase','export')"
        [emptyText]="'ยังไม่มีใบสั่งซื้อ'"
        [error]="loadError()"
        [rowClass]="rowClass"
        (rowClick)="open($event)"
        (retry)="load()"
      />
    </div>
    @if (formOpen()) {
      <app-record-form entity="purchaseOrders" entityLabel="ใบสั่งซื้อ" createUrl="/records/purchaseOrders" [fields]="fields()" [lists]="meta.lists()" [defaults]="{ orderDate: today, lines: [{}] }" (saved)="saved($event)" (closed)="formOpen.set(false)" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly meta = inject(MetaService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  readonly rows = signal<RecordRow[]>([]);
  readonly loadError = signal('');
  readonly formOpen = signal(false);
  readonly fields = computed(() => this.meta.entity('purchaseOrders')?.fields ?? []);
  readonly today = todayStr();
  readonly tabs: TabDef[] = [
    { key: 'wait', label: 'รอรับสินค้า', test: (row) => ['ordered', 'partial'].includes(String(row['status'])) },
    { key: 'draft', label: 'ร่าง', test: (row) => row['status'] === 'draft' },
    { key: 'done', label: 'รับครบ/ปิด', test: (row) => ['received', 'closed'].includes(String(row['status'])) },
    { key: 'all', label: 'ทั้งหมด' },
  ];
  readonly rowClass = () => '';

  ngOnInit(): void {
    this.meta.load();
    this.load();
    this.route.queryParamMap.subscribe((params) => {
      if (params.get('new') !== '1' || !this.auth.can('purchase', 'create')) return;
      this.formOpen.set(true);
      void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    });
  }

  load(): void {
    this.loadError.set('');
    this.api.get<RecordRow[]>('/purchase-orders').subscribe({
      next: (rows) => this.rows.set(rows),
      error: (error: unknown) => {
        const message = apiErrorMessage(error);
        this.loadError.set(message);
        this.toast.error(message);
      },
    });
  }

  columns(): ColumnDef[] {
    return [
      { key: 'code', label: 'เลขที่ PO' },
      { key: 'vendor', label: 'ผู้ขาย', value: (row) => row._labels?.['vendor'] ?? '–' },
      { key: 'project', label: 'โครงการ', value: (row) => row._labels?.['project'] ?? '–' },
      { key: 'orderDate', label: 'วันที่สั่ง', value: (row) => fmtDate(row['orderDate']) },
      { key: 'dueDate', label: 'กำหนดส่ง', value: (row) => fmtDate(row['dueDate']) },
      { key: 'amount', label: 'มูลค่า (บาท)', value: (row) => fmtMoney(row['amount']) },
      { key: 'pct', label: 'รับแล้ว', value: (row) => `${row['pct'] ?? 0}%` },
      { key: 'status', label: 'สถานะ', value: (row) => this.statusLabel(row['status']), badge: (row) => this.statusColor(row['status']) },
    ];
  }

  statusLabel(value: unknown): string {
    return this.meta.poWorkflow().find((status) => status.key === value)?.label ?? String(value ?? '–');
  }

  statusColor(value: unknown): string {
    return this.meta.poWorkflow().find((status) => status.key === value)?.color ?? 'gray';
  }

  open(row: Record<string, unknown>): void {
    void this.router.navigate(['/purchase-orders', String(row['id'])]);
  }

  saved(record: RecordRow): void {
    void this.router.navigate(['/purchase-orders', record.id]);
  }
}
