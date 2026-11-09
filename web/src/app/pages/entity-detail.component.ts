import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { FileService, type StoredFile } from '../core/file.service';
import { MetaService } from '../core/meta.service';
import { PdfService } from '../core/pdf.service';
import { displayValue, fmtDate, fmtDateTime } from '../core/util';
import { RecordFormComponent } from '../shared/record-form.component';
import { StateComponent } from '../shared/state.component';
import { ToastService } from '../shared/toast.service';
import type { ApprovalRow, EntityDef, FieldDef, RecordRow, WorkflowStatus } from '../core/models';

interface RelatedGroup {
  entity: string;
  label: string;
  field: string;
  records: { id: string; code: string; title: string }[];
}

const SPECIAL_ROUTES: Record<string, string> = {
  tickets: '/tickets',
  purchaseOrders: '/purchase-orders',
  projects: '/projects',
  pmRecords: '/pm/records',
};

@Component({
  selector: 'app-entity-detail',
  standalone: true,
  imports: [RecordFormComponent, RouterLink, StateComponent],
  template: `
    @if (record(); as row) {
      @if (def(); as entity) {
        <div class="page">
          <div class="page-head">
            <div>
              <h1>{{ label(row) }} @if (row._deleted) { <span class="badge red">ยกเลิก/ซ่อน</span> }</h1>
              <div class="muted">{{ entity.label }} · {{ row.code }}</div>
            </div>
            <div class="page-actions">
              <button type="button" class="btn" (click)="back()">‹ กลับ</button>
              <button type="button" class="btn" (click)="printPage()">พิมพ์</button>
              <button type="button" class="btn" (click)="downloadPdf()">ดาวน์โหลด PDF</button>
              @if (auth.can(entity.resource, 'edit') && !row._deleted) { <button type="button" class="btn primary" (click)="editOpen.set(true)">แก้ไข</button> }
              @if (auth.can(entity.resource, 'delete') && !row._deleted) { <button type="button" class="btn danger" (click)="archive()">ยกเลิก/ซ่อน</button> }
              @if (auth.can(entity.resource, 'delete') && row._deleted) { <button type="button" class="btn" (click)="restore()">กู้คืน</button> }
            </div>
          </div>
          @if (row._deleted) { <div class="notice bad">รายการนี้ถูกยกเลิก/ซ่อน — เหตุผล: {{ row._deleteReason }}</div> }
          @if (pendingApprovals().length) {
            <div class="notice warn">
              <b>รออนุมัติ:</b>
              @for (approval of pendingApprovals(); track approval.id) {
                <div>{{ approval.title }} <span class="muted small">· {{ approval.byName }} · {{ fmtDateTime(approval.at) }}</span></div>
              }
            </div>
          }
          <div class="tabs">
            <button type="button" [class.active]="tab() === 'info'" (click)="tab.set('info')">ข้อมูล</button>
            <button type="button" [class.active]="tab() === 'audit'" (click)="tab.set('audit')">ประวัติการแก้ไข</button>
          </div>
          @if (tab() === 'info') {
            @if (workflowStatuses().length) {
              <div class="card">
                <h3>สถานะ: <span class="badge {{ statusColor(row['status']) }}">{{ statusLabel(row['status']) }}</span></h3>
                @if (statusOptions().length) {
                  <div class="form-grid" style="margin-top:10px">
                    <div class="field"><label>เปลี่ยนเป็น</label><select [value]="statusTo()" (change)="setStatusTo($any($event.target).value)">@for (status of statusOptions(); track status.key) { <option [value]="status.key" [selected]="status.key === statusTo()">{{ status.label }}{{ statusNeedsApproval(status) ? ' · ต้องอนุมัติ' : '' }}</option> }</select></div>
                    <div class="field wide"><label>หมายเหตุ</label><input [value]="statusComment()" (input)="statusComment.set($any($event.target).value)" /></div>
                  </div>
                  <button type="button" class="btn primary" [disabled]="statusBusy()" (click)="changeStatus()">{{ statusNeedsApproval(selectedStatus()) ? 'ส่งคำขออนุมัติ' : 'เปลี่ยนสถานะ' }}</button>
                } @else { <div class="muted small">ไม่มีสถานะถัดไปที่เปลี่ยนได้</div> }
              </div>
            }
            <div class="card">
              @for (field of visibleFields(); track field.key) {
                @if (field.type === 'section') {
                  <div class="section-title">{{ field.label }}</div>
                } @else {
                  <div class="kv"><div class="k">{{ field.label }}</div><div class="v">
                    @if (field.type === 'file') {
                      <div class="doc-files">
                        @for (file of asFiles(row[field.key]); track $index) {
                          <span class="file-chip">{{ file.name }} @if (file.id) { <a href="#x" (click)="downloadFile(file, $event)">ดาวน์โหลด</a> }</span>
                        }
                        @if (!asFiles(row[field.key]).length) { <span class="muted">–</span> }
                      </div>
                    } @else if (field.type === 'rows') {
                      @if (asRows(row[field.key]).length) {
                        <div class="table-wrap"><table class="mini">
                          <thead><tr>@for (col of field.cols; track col.key) { <th>{{ col.label }}</th> }</tr></thead>
                          <tbody>@for (line of asRows(row[field.key]); track $index) { <tr>@for (col of field.cols; track col.key) { <td>{{ rowCell(row, field, line, $index, col.key) }}</td> }</tr> }</tbody>
                        </table></div>
                      } @else { <span class="muted">–</span> }
                    } @else {
                      {{ display(field, row) }}
                    }
                  </div></div>
                }
              }
              <div class="kv"><div class="k">สร้างโดย</div><div class="v">{{ row._createdByName || '–' }} · {{ fmtDateTime(row._createdAt) }}</div></div>
              <div class="kv"><div class="k">แก้ไขล่าสุด</div><div class="v">{{ row._updatedByName || '–' }} · {{ fmtDateTime(row._updatedAt) }}</div></div>
            </div>
            @if (related().length) {
              <div class="card">
                <h3>รายการที่เชื่อมโยง</h3>
                @for (group of related(); track group.entity + group.field) {
                  <div class="related-group">
                    <div class="related-title">{{ group.label }} · {{ group.field }}</div>
                    @for (item of group.records; track item.id) {
                      <a class="list-row" [routerLink]="relatedLink(group.entity, item.id)">
                        <span class="mono muted">{{ item.code }}</span>
                        <span class="lr-main"><b>{{ item.title }}</b></span>
                        <span class="lr-age">›</span>
                      </a>
                    }
                  </div>
                }
              </div>
            }
            @if (entity.key === 'serials' && asArray(row['history']).length) {
              <div class="card"><h3>ประวัติ Serial</h3>
                @for (item of asArray(row['history']).slice().reverse(); track item['id']) { <div style="padding:4px 0">{{ item['text'] }} <span class="muted small">· {{ fmtDateTime(item['at']) }}</span></div> }
              </div>
            }
          }
          @if (tab() === 'audit') {
            <div class="card">
              @if (!audit().length) { <div class="state empty">ยังไม่มีประวัติ</div> }
              @else { @for (entry of audit(); track entry['id']) {
                <div class="tl-item"><div class="tl-dot"></div><div><b>{{ entry['summary'] }}</b><div class="muted small">{{ entry['userName'] }} · {{ fmtDateTime(entry['at']) }}</div></div></div>
              } }
            </div>
          }
        </div>
        @if (editOpen()) {
          <app-record-form
            [entity]="entity.key"
            [entityLabel]="entity.label"
            [fields]="entity.fields"
            [record]="row"
            [lists]="lists()"
            (saved)="onSaved($event)"
            (closed)="editOpen.set(false)"
          />
        }
      }
    } @else if (loading()) {
      <app-state kind="loading" message="กำลังโหลดข้อมูล…" />
    } @else {
      <app-state kind="error" message="ไม่พบรายการ" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntityDetailComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly meta = inject(MetaService);
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly fileService = inject(FileService);
  private readonly pdf = inject(PdfService);

  readonly record = signal<RecordRow | null>(null);
  readonly audit = signal<Record<string, unknown>[]>([]);
  readonly pendingApprovals = signal<ApprovalRow[]>([]);
  readonly related = signal<RelatedGroup[]>([]);
  readonly loading = signal(true);
  readonly editOpen = signal(false);
  readonly tab = signal<'info' | 'audit'>('info');
  readonly statusTo = signal('');
  readonly statusComment = signal('');
  readonly statusBusy = signal(false);
  readonly fmtDateTime = fmtDateTime;
  readonly def = computed(() => this.meta.entity(this.route.snapshot.paramMap.get('entity') ?? ''));
  readonly lists = computed(() => this.meta.lists());
  readonly visibleFields = computed(() => (this.def()?.fields ?? []).filter((field) => !field.hidden));
  readonly workflowStatuses = computed<WorkflowStatus[]>(() => {
    const def = this.def();
    const key = def?.workflowKey ?? def?.key;
    if (!key) return [];
    const workflows = this.meta.meta()?.workflows as Record<string, { statuses?: WorkflowStatus[] }> | undefined;
    return workflows?.[key]?.statuses ?? [];
  });
  readonly statusOptions = computed(() => {
    const current = this.record()?.['status'];
    const from = this.workflowStatuses().find((status) => status.key === current);
    const candidates = this.workflowStatuses().filter((status) => status.enabled !== false && status.key !== current);
    if (!from) return candidates;
    if (from.final) return candidates.filter((status) => !status.final);
    const next = from.next ?? [];
    return next.length ? candidates.filter((status) => next.includes(status.key)) : [];
  });
  readonly selectedStatus = computed(() => this.workflowStatuses().find((status) => status.key === this.statusTo()));

  constructor() {
    effect(() => {
      if (this.meta.meta()) this.load();
    });
  }

  ngOnInit(): void {
    this.meta.load();
  }

  load(): void {
    const entity = this.def();
    const id = this.route.snapshot.paramMap.get('id');
    if (!entity || !id) return;
    this.api.get<RecordRow>(`/records/${entity.key}/${id}`).subscribe({
      next: (row) => {
        this.record.set(row);
        this.statusTo.set(this.statusOptions()[0]?.key ?? '');
        this.loading.set(false);
        this.api.get<ApprovalRow[]>(`/records/${entity.key}/${id}/approvals`).subscribe({
          next: (approvals) => this.pendingApprovals.set(approvals),
          error: () => this.pendingApprovals.set([]),
        });
        this.api.get<Record<string, unknown>[]>(`/audit/records/${entity.key}/${id}`).subscribe({
          next: (audit) => this.audit.set(audit),
          error: () => this.audit.set([]),
        });
        this.api.get<{ groups: RelatedGroup[] }>(`/records/${entity.key}/${id}/related`).subscribe({
          next: (related) => this.related.set(related.groups ?? []),
          error: () => this.related.set([]),
        });
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.toast.error(apiErrorMessage(error));
      },
    });
  }

  label(row: RecordRow): string {
    const title = this.def()?.title ?? 'name';
    return displayValue(row[title] ?? row.code);
  }

  relatedLink(entity: string, id: string): string {
    const base = SPECIAL_ROUTES[entity];
    return base ? `${base}/${id}` : `/entities/${entity}/${id}`;
  }

  display(field: FieldDef, row: RecordRow): string {
    const value = row[field.key];
    if (field.type === 'ref') return row._labels?.[field.key] ?? '–';
    if (field.type === 'boolean') return value ? 'ใช่' : 'ไม่';
    if (field.type === 'date') return fmtDate(value);
    if (field.type === 'datetime') return fmtDateTime(value);
    if (field.type === 'file') return (Array.isArray(value) ? (value as { name: string }[]) : []).map((f) => f.name).join(', ') || '–';
    if (field.type === 'multiselect') return Array.isArray(value) ? value.join(', ') : '–';
    if (field.type === 'number') {
      const n = Number(value);
      return Number.isFinite(n) ? new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(n) : '–';
    }
    if (value === undefined || value === null || value === '') return '–';
    return displayValue(value);
  }

  rowCell(row: RecordRow, field: FieldDef, line: Record<string, unknown>, index: number, key: string): string {
    const col = field.cols?.find((c) => c.key === key);
    if (col?.type === 'ref') return row._rowLabels?.[field.key]?.[index]?.[key] ?? '–';
    return displayValue(line[key]);
  }

  asRows(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  }

  asFiles(value: unknown): StoredFile[] {
    return Array.isArray(value) ? (value as StoredFile[]) : [];
  }

  downloadFile(file: StoredFile, event: Event): void {
    event.preventDefault();
    this.fileService.download(file);
  }

  asArray(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  }

  onSaved(record: RecordRow): void {
    this.record.set(record);
    this.editOpen.set(false);
    this.load();
  }

  setStatusTo(value: string): void {
    this.statusTo.set(value);
  }

  statusNeedsApproval(status: WorkflowStatus | undefined): boolean {
    if (!status || (!status.approverRole && !status.approverUser)) return false;
    const user = this.auth.user();
    if (!user) return true;
    if (user.isAdmin) return false;
    return !((!!status.approverUser && status.approverUser === user.id) || (!!status.approverRole && status.approverRole === user.roleId));
  }

  statusLabel(value: unknown): string {
    return this.workflowStatuses().find((status) => status.key === value)?.label ?? String(value ?? '–');
  }

  statusColor(value: unknown): string {
    return this.workflowStatuses().find((status) => status.key === value)?.color ?? 'gray';
  }

  changeStatus(): void {
    const entity = this.def();
    const row = this.record();
    if (!entity || !row || !this.statusTo() || this.statusBusy()) return;
    this.statusBusy.set(true);
    this.api.post<RecordRow>(`/records/${entity.key}/${row.id}/transition`, { to: this.statusTo(), comment: this.statusComment() }).subscribe({
      next: (updated) => {
        this.statusBusy.set(false);
        this.statusComment.set('');
        this.record.set(updated);
        this.statusTo.set(this.statusOptions()[0]?.key ?? '');
        this.toast.show(updated['_pendingApproval'] ? 'ส่งคำขออนุมัติแล้ว — รอผู้อนุมัติพิจารณา' : 'เปลี่ยนสถานะแล้ว');
        this.load();
      },
      error: (error: unknown) => {
        this.statusBusy.set(false);
        this.toast.error(apiErrorMessage(error));
      },
    });
  }

  archive(): void {
    const entity = this.def();
    const row = this.record();
    if (!entity || !row) return;
    const reason = prompt('เหตุผลการยกเลิก/ซ่อน');
    if (!reason?.trim()) return;
    this.api.delete<RecordRow>(`/records/${entity.key}/${row.id}`, { reason }).subscribe({
      next: () => {
        this.toast.show('ยกเลิก/ซ่อนรายการแล้ว');
        void this.router.navigate(['/entities', entity.key]);
      },
      error: (error: unknown) => this.toast.error(apiErrorMessage(error)),
    });
  }

  restore(): void {
    const entity = this.def();
    const row = this.record();
    if (!entity || !row) return;
    this.api.post<RecordRow>(`/records/${entity.key}/${row.id}/restore`).subscribe({
      next: (updated) => {
        this.record.set(updated);
        this.toast.show('กู้คืนรายการแล้ว');
      },
      error: (error: unknown) => this.toast.error(apiErrorMessage(error)),
    });
  }

  back(): void {
    const entity = this.def();
    void this.router.navigate(entity ? ['/entities', entity.key] : ['/']);
  }

  printPage(): void {
    window.print();
  }

  downloadPdf(): void {
    const entity = this.def();
    const row = this.record();
    if (entity && row) this.pdf.download(entity.key, row.id, String(row.code));
  }
}
