import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { MetaService } from '../core/meta.service';
import { PdfService } from '../core/pdf.service';
import { fmtDate, fmtDateTime, fmtMoney } from '../core/util';
import { RecordFormComponent } from '../shared/record-form.component';
import { ToastService } from '../shared/toast.service';
import type { FieldDef, Option, RecordRow, WorkflowStatus } from '../core/models';

interface ReceiveLine {
  item: string;
  qty: string;
  serialNos: string;
}

@Component({
  selector: 'app-purchase-detail',
  standalone: true,
  imports: [RecordFormComponent],
  template: `
    @if (record(); as po) {
      <div class="page">
        <div class="page-head">
          <div><h1>{{ po.code }}</h1><div class="muted">ผู้ขาย: {{ po._labels?.['vendor'] }} · {{ statusLabel(po['status']) }}</div></div>
          <div class="page-actions">
            <button type="button" class="btn" (click)="back()">‹ รายการ</button>
            <button type="button" class="btn" (click)="printPage()">พิมพ์</button>
            <button type="button" class="btn" (click)="downloadPdf()">ดาวน์โหลด PDF</button>
            @if (auth.can('purchase','edit') && po['status'] === 'draft') { <button type="button" class="btn" (click)="editOpen.set(true)">แก้ไข</button> }
            @if (auth.can('warehouse','create') && canReceive()) { <button type="button" class="btn primary" (click)="openReceive()">รับสินค้า</button> }
            @for (status of statusOptions(); track status.key) { <button type="button" class="btn" (click)="changeStatus(status)">→ {{ status.label }}</button> }
          </div>
        </div>
        <div class="card"><span class="badge {{ statusColor(po['status']) }}">{{ statusLabel(po['status']) }}</span> <span class="muted small">สถานะ “รับบางส่วน/รับครบ” เปลี่ยนอัตโนมัติเมื่อบันทึกการรับสินค้า</span></div>

        <div class="tabs">
          <button type="button" [class.active]="tab() === 'info'" (click)="tab.set('info')">รายละเอียด</button>
          <button type="button" [class.active]="tab() === 'receive'" (click)="tab.set('receive')">การรับสินค้า ({{ receipts().length }})</button>
          <button type="button" [class.active]="tab() === 'audit'" (click)="tab.set('audit')">ประวัติ</button>
        </div>

        @if (tab() === 'info') {
          <div class="card">@for (field of fields().filter(f => f.key !== 'lines'); track field.key) { <div class="kv"><div class="k">{{ field.label }}</div><div class="v">{{ display(field, po) }}</div></div> }<div class="kv"><div class="k">มูลค่ารวม</div><div class="v">{{ fmtMoney(po['amount']) }} บาท</div></div></div>
          <div class="card"><h3>รายการ</h3>
            <div class="table-wrap"><table class="mini"><thead><tr><th>สินค้า</th><th>สั่ง</th><th>ราคา/หน่วย</th><th>รับแล้ว</th></tr></thead>
              <tbody>@for (line of lines(po); track $index) { <tr><td>{{ lineLabel(po, line, $index) }}</td><td>{{ line['qty'] }}</td><td>{{ fmtMoney(line['unitPrice']) }}</td><td>{{ receivedFor(po, line) }}</td></tr> }</tbody>
            </table></div>
          </div>
          @if (po['project']) { <div class="card">โครงการ: {{ po._labels?.['project'] }}</div> }
        }

        @if (tab() === 'receive') {
          <div class="card">
            @if (!receipts().length) { <div class="state empty">ยังไม่มีการรับสินค้า</div> }
            @else { @for (receipt of receipts(); track receipt['id']) { <div style="padding:4px 0">{{ receipt['code'] }} · {{ fmtDate(receipt['date']) }} · {{ labelForItem(receipt['item']) }} x{{ receipt['qty'] }} → {{ labelForWarehouse(receipt['to']) }}</div> } }
          </div>
        }

        @if (tab() === 'audit') {
          <div class="card">@if (!audit().length) { <div class="state empty">ยังไม่มีประวัติ</div> } @else { @for (entry of audit(); track entry['id']) { <div class="tl-item"><div class="tl-dot"></div><div><b>{{ entry['summary'] }}</b><div class="muted small">{{ entry['userName'] }} · {{ fmtDateTime(entry['at']) }}</div></div></div> } }</div>
        }
      </div>

      @if (editOpen()) { <app-record-form entity="purchaseOrders" entityLabel="ใบสั่งซื้อ" [fields]="fields()" [record]="po" [lists]="meta.lists()" (saved)="onSaved($event)" (closed)="editOpen.set(false)" /> }

      @if (receiveOpen()) {
        <div class="overlay" (mousedown)="closeReceive($event)">
          <div class="menu-panel" role="dialog" aria-label="รับสินค้า">
            <div class="menu-head"><b>รับสินค้า / ตรวจรับ {{ po.code }}</b><span class="grow"></span><button type="button" class="icon-btn" (click)="receiveOpen.set(false)" aria-label="ปิด">×</button></div>
            <div class="field"><label>รับเข้าคลัง</label><select [value]="warehouse()" (change)="warehouse.set($any($event.target).value)">@for (wh of warehouses(); track wh.value) { <option [value]="wh.value" [selected]="wh.value === warehouse()">{{ wh.label }}</option> }</select></div>
            @for (line of receiveLines(); track line.item; let i = $index) {
              <div class="card" style="margin-top:10px">
                <b>{{ labelForItem(line.item) }}</b> <span class="muted small">สั่ง {{ orderedFor(po, line.item) }} · รับแล้ว {{ receivedFor(po, { item: line.item }) }} · คงเหลือ {{ remainFor(po, line.item) }}</span>
                <div class="form-grid" style="margin-top:6px">
                  <div class="field"><label>จำนวนที่รับครั้งนี้</label><input type="number" min="0" [max]="remainFor(po, line.item)" [value]="line.qty" (input)="setReceive(i, 'qty', $any($event.target).value)" /></div>
                  <div class="field wide"><label>Serial Number (คั่นด้วยขึ้นบรรทัดใหม่หรือ ,) — เฉพาะสินค้าที่ติดตาม Serial</label><textarea rows="3" [value]="line.serialNos" (input)="setReceive(i, 'serialNos', $any($event.target).value)"></textarea></div>
                </div>
              </div>
            }
            @if (receiveError()) { <div class="err" role="alert" style="margin-top:8px">{{ receiveError() }}</div> }
            <div class="row" style="margin-top:12px"><button type="button" class="btn" (click)="receiveOpen.set(false)">ยกเลิก</button><button type="button" class="btn primary" [disabled]="receiveBusy()" (click)="doReceive()">บันทึกการรับ</button></div>
          </div>
        </div>
      }
    } @else if (loading()) {
      <div class="state"><div class="spinner"></div>กำลังโหลดข้อมูล…</div>
    } @else {
      <div class="state error">ไม่พบใบสั่งซื้อ</div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseDetailComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly meta = inject(MetaService);
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly pdf = inject(PdfService);

  readonly record = signal<(RecordRow & { amount?: number; receivedMap?: Record<string, number>; receipts?: Record<string, unknown>[] }) | null>(null);
  readonly audit = signal<Record<string, unknown>[]>([]);
  readonly loading = signal(true);
  readonly tab = signal<'info' | 'receive' | 'audit'>('info');
  readonly editOpen = signal(false);
  readonly receiveOpen = signal(false);
  readonly receiveBusy = signal(false);
  readonly receiveError = signal('');
  readonly receiveLines = signal<ReceiveLine[]>([]);
  readonly warehouse = signal('');
  readonly warehouses = signal<Option[]>([]);
  readonly items = signal<Option[]>([]);
  readonly lines = (po: RecordRow) => Array.isArray(po['lines']) ? (po['lines'] as Record<string, unknown>[]) : [];
  readonly receipts = computed(() => ((this.record()?.['receipts'] as Record<string, unknown>[] | undefined) ?? []));
  readonly statuses = computed<WorkflowStatus[]>(() => this.meta.poWorkflow());
  readonly fields = computed(() => (this.meta.entity('purchaseOrders')?.fields ?? []).filter((field) => !field.hidden));
  readonly statusOptions = computed(() => {
    const po = this.record();
    const current = this.statuses().find((status) => status.key === po?.['status']);
    return this.statuses().filter((status) => status.enabled && !['partial', 'received'].includes(status.key) && status.key !== po?.['status'] && (!current?.next?.length || current.next.includes(status.key)));
  });
  readonly fmtMoney = fmtMoney;
  readonly fmtDate = fmtDate;
  readonly fmtDateTime = fmtDateTime;

  ngOnInit(): void {
    this.meta.load();
    this.api.get<Option[]>('/meta/options/warehouses').subscribe({ next: (rows) => { this.warehouses.set(rows); this.warehouse.set(rows[0]?.value ?? ''); }, error: () => this.warehouses.set([]) });
    this.api.get<Option[]>('/meta/options/items').subscribe({ next: (rows) => this.items.set(rows), error: () => this.items.set([]) });
    this.load();
  }

  load(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.api.get<RecordRow & { amount?: number; receivedMap?: Record<string, number>; receipts?: Record<string, unknown>[] }>(`/purchase-orders/${id}`).subscribe({
      next: (po) => {
        this.record.set(po);
        this.loading.set(false);
        this.api.get<Record<string, unknown>[]>(`/audit/records/purchaseOrders/${id}`).subscribe({ next: (audit) => this.audit.set(audit), error: () => this.audit.set([]) });
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.toast.error(apiErrorMessage(error));
      },
    });
  }

  openReceive(): void {
    const po = this.record();
    if (!po) return;
    const unique = [...new Set(this.lines(po).map((line) => String(line['item'] ?? '')))];
    this.receiveLines.set(unique.map((item) => ({ item, qty: '', serialNos: '' })));
    this.receiveError.set('');
    this.receiveOpen.set(true);
  }

  setReceive(index: number, key: 'qty' | 'serialNos', value: string): void {
    this.receiveLines.update((lines) => lines.map((line, i) => (i === index ? { ...line, [key]: value } : line)));
  }

  doReceive(): void {
    const po = this.record();
    if (!po || this.receiveBusy()) return;
    this.receiveBusy.set(true);
    this.receiveError.set('');
    const body = {
      warehouse: this.warehouse(),
      lines: this.receiveLines().map((line) => ({
        item: line.item,
        qty: Number(line.qty || 0),
        serialNos: line.serialNos.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
      })),
    };
    this.api.post(`/purchase-orders/${po.id}/receive`, body).subscribe({
      next: () => {
        this.receiveBusy.set(false);
        this.receiveOpen.set(false);
        this.toast.show('รับสินค้าเข้าคลังแล้ว');
        this.load();
      },
      error: (error: unknown) => {
        this.receiveBusy.set(false);
        this.receiveError.set(apiErrorMessage(error));
      },
    });
  }

  closeReceive(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.receiveOpen.set(false);
  }

  changeStatus(status: WorkflowStatus): void {
    const po = this.record();
    if (!po) return;
    if (status.key === 'cancelled' && !confirm('ยืนยันยกเลิกใบสั่งซื้อนี้?')) return;
    this.api.post(`/purchase-orders/${po.id}/status`, { to: status.key }).subscribe({
      next: () => {
        this.toast.show('เปลี่ยนสถานะแล้ว');
        this.load();
      },
      error: (error: unknown) => this.toast.error(apiErrorMessage(error)),
    });
  }

  orderedFor(po: RecordRow, item: string): number {
    return this.lines(po).filter((line) => line['item'] === item).reduce((sum, line) => sum + Number(line['qty'] ?? 0), 0);
  }

  receivedFor(po: RecordRow, line: Record<string, unknown>): number {
    return Number(this.receivedMap(po)[String(line['item'] ?? '')] ?? 0);
  }

  remainFor(po: RecordRow, item: string): number {
    return Math.max(0, this.orderedFor(po, item) - Number(this.receivedMap(po)[item] ?? 0));
  }

  canReceive(): boolean {
    const status = this.record()?.['status'];
    return status === 'ordered' || status === 'partial';
  }

  private receivedMap(po: RecordRow): Record<string, number> {
    return (po['receivedMap'] as Record<string, number> | undefined) ?? {};
  }

  lineLabel(po: RecordRow, line: Record<string, unknown>, index: number): string {
    return po._rowLabels?.['lines']?.[index]?.['item'] ?? '–';
  }

  labelForItem(id: unknown): string {
    return this.items().find((item) => item.value === id)?.label ?? String(id ?? '–');
  }

  labelForWarehouse(id: unknown): string {
    return this.warehouses().find((warehouse) => warehouse.value === id)?.label ?? String(id ?? '–');
  }

  display(field: FieldDef, po: RecordRow): string {
    const value = po[field.key];
    if (field.type === 'ref') return po._labels?.[field.key] ?? '–';
    if (field.type === 'date') return fmtDate(value);
    if (field.type === 'datetime') return fmtDateTime(value);
    return value === undefined || value === null || value === '' ? '–' : String(value);
  }

  statusLabel(value: unknown): string {
    return this.statuses().find((status) => status.key === value)?.label ?? String(value ?? '–');
  }

  statusColor(value: unknown): string {
    return this.statuses().find((status) => status.key === value)?.color ?? 'gray';
  }

  onSaved(record: RecordRow): void {
    this.editOpen.set(false);
    this.load();
    void record;
  }

  back(): void {
    void this.router.navigate(['/purchase-orders']);
  }

  printPage(): void {
    window.print();
  }

  downloadPdf(): void {
    const po = this.record();
    if (po) this.pdf.download('purchaseOrders', po.id, String(po.code));
  }
}
