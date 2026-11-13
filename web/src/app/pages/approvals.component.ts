import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { MetaService } from '../core/meta.service';
import { fmtDateTime } from '../core/util';
import { ToastService } from '../shared/toast.service';
import type { ApprovalRow } from '../core/models';

@Component({
  selector: 'app-approvals',
  standalone: true,
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>คำขออนุมัติ</h1><div class="muted">รายการที่รอคุณพิจารณา และประวัติการอนุมัติของคุณ</div></div>
        <div class="page-actions"><button type="button" class="btn" (click)="load()">รีเฟรช</button></div>
      </div>

      @if (error()) { <div class="state error">{{ error() }}</div> }

      <div class="card">
        <h3 style="margin-top:0">รออนุมัติ ({{ pending().length }})</h3>
        @if (!pending().length) {
          <div class="state empty">ไม่มีคำขอที่รออนุมัติ</div>
        } @else {
          @for (row of pending(); track row.id) {
            <div class="tl-item" style="align-items:flex-start">
              <div class="tl-dot"></div>
              <div style="flex:1">
                <b>{{ row.title }}</b>
                <div class="muted small">{{ row.byName }} · {{ fmtDateTime(row.at) }} · ผู้อนุมัติ: {{ approverLabel(row) }}</div>
                @if (row.canDecide) {
                  <div class="row" style="margin-top:8px">
                    <input placeholder="หมายเหตุ (จำเป็นเมื่อไม่อนุมัติ)" [value]="notes()[row.id] ?? ''" (input)="setNote(row.id, $any($event.target).value)" style="max-width:380px" />
                    <button type="button" class="btn primary" [disabled]="busy() === row.id" (click)="decide(row, true)">อนุมัติ</button>
                    <button type="button" class="btn danger" [disabled]="busy() === row.id" (click)="decide(row, false)">ไม่อนุมัติ</button>
                    <button type="button" class="btn ghost" (click)="open(row)">เปิดเอกสาร</button>
                  </div>
                } @else {
                  <div class="row muted small" style="margin-top:8px">
                    <span class="badge amber">รอผู้อนุมัติ</span>
                    @if (row.by === auth.user()?.id) { <span>คำขอของคุณ — รอ {{ approverLabel(row) }} พิจารณา</span> }
                    @else { <span>คุณดูได้อย่างเดียว ไม่ได้เป็นผู้อนุมัติคำขอนี้</span> }
                    <button type="button" class="btn ghost" (click)="open(row)">เปิดเอกสาร</button>
                  </div>
                }
                @if (errorFor() === row.id) { <div class="err">{{ error() }}</div> }
              </div>
            </div>
          }
        }
      </div>

      <div class="card">
        <h3 style="margin-top:0">พิจารณาแล้ว ({{ decided().length }})</h3>
        @if (!decided().length) {
          <div class="state empty">ยังไม่มีประวัติ</div>
        } @else {
          @for (row of decided(); track row.id) {
            <div class="tl-item">
              <div class="tl-dot"></div>
              <div>
                <b>{{ row.title }}</b>
                <span class="badge {{ row.status === 'approved' ? 'green' : 'red' }}">{{ row.status === 'approved' ? 'อนุมัติ' : 'ไม่อนุมัติ' }}</span>
                <div class="muted small">{{ row.byName }} · {{ fmtDateTime(row.at) }} · {{ row.decidedByName }} {{ row.decidedAt ? '· ' + fmtDateTime(row.decidedAt) : '' }}</div>
                @if (row.note) { <div class="small">หมายเหตุ: {{ row.note }}</div> }
              </div>
            </div>
          }
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApprovalsComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  private readonly meta = inject(MetaService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly pending = signal<ApprovalRow[]>([]);
  readonly decided = signal<ApprovalRow[]>([]);
  readonly notes = signal<Record<string, string>>({});
  readonly busy = signal('');
  readonly error = signal('');
  readonly errorFor = signal('');
  readonly fmtDateTime = fmtDateTime;
  readonly entityLabels = computed(() => {
    const entities = this.meta.meta()?.entities ?? {};
    return Object.fromEntries(Object.values(entities).map((entity) => [entity.key, entity.label])) as Record<string, string>;
  });

  ngOnInit(): void {
    this.meta.load();
    this.load();
  }

  load(): void {
    this.error.set('');
    this.api.get<{ pending: ApprovalRow[]; decided: ApprovalRow[] }>('/approvals').subscribe({
      next: (result) => {
        this.pending.set(result.pending ?? []);
        this.decided.set(result.decided ?? []);
      },
      error: (error: unknown) => this.error.set(apiErrorMessage(error)),
    });
  }

  setNote(id: string, value: string): void {
    this.notes.update((notes) => ({ ...notes, [id]: value }));
  }

  approverLabel(row: ApprovalRow): string {
    return row.approverUserName || row.approverRoleName || 'ผู้ดูแลระบบ';
  }

  decide(row: ApprovalRow, approve: boolean): void {
    const note = (this.notes()[row.id] ?? '').trim();
    if (!approve && !note) {
      this.errorFor.set(row.id);
      this.error.set('กรุณาระบุเหตุผลที่ไม่อนุมัติ');
      return;
    }
    this.busy.set(row.id);
    this.error.set('');
    this.errorFor.set('');
    this.api.post<ApprovalRow>(`/approvals/${row.id}/decide`, { approve, note }).subscribe({
      next: () => {
        this.busy.set('');
        this.notes.update((notes) => {
          const next = { ...notes };
          delete next[row.id];
          return next;
        });
        this.toast.show(approve ? 'อนุมัติแล้ว' : 'บันทึกผลการไม่อนุมัติแล้ว');
        this.load();
        this.meta.load(true);
      },
      error: (error: unknown) => {
        this.busy.set('');
        this.errorFor.set(row.id);
        this.error.set(apiErrorMessage(error));
      },
    });
  }

  open(row: ApprovalRow): void {
    if (row.entity === 'tickets') return void this.router.navigate(['/tickets', row.recordId]);
    if (row.entity === 'projects') return void this.router.navigate(['/projects', row.recordId]);
    if (row.entity === 'purchaseOrders') return void this.router.navigate(['/purchase-orders', row.recordId]);
    void this.router.navigate(['/entities', row.entity, row.recordId]);
  }
}
