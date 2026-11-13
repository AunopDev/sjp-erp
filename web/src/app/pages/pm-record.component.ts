import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { MetaService } from '../core/meta.service';
import { fmtDate, fmtDateTime } from '../core/util';
import { ToastService } from '../shared/toast.service';
import type { RecordRow } from '../core/models';

interface PmResult {
  label: string;
  result: string;
  note: string;
  action: string;
  ticket?: string | null;
}

@Component({
  selector: 'app-pm-record',
  standalone: true,
  template: `
    @if (record(); as rec) {
      <div class="page">
        <div class="page-head"><div><h1>{{ rec.code }}</h1><div class="muted">{{ rec._labels?.['plan'] }} · {{ rec._labels?.['site'] }} · กำหนด {{ fmtDate(rec['dueDate']) }}</div></div>
          <div class="page-actions"><button type="button" class="btn" (click)="back()">‹ งาน PM</button></div>
        </div>
        <div class="card"><span class="badge {{ rec['status'] === 'เสร็จ' ? 'green' : rec['status'] === 'กำลังตรวจ' ? 'blue' : 'gray' }}">{{ rec['status'] }}</span> แม่แบบ: {{ rec['templateName'] }} @if (rec['doneAt']) { <span class="muted small">· ปิดงานโดย {{ rec._labels?.['doneBy'] }} {{ fmtDateTime(rec['doneAt']) }}</span> }</div>
        <div class="card">
          <h3>ผลการตรวจ</h3>
          @if (!results().length) { <div class="state empty">แม่แบบนี้ไม่มีรายการตรวจ</div> }
          @else {
            <div class="table-wrap"><table class="mini"><thead><tr><th scope="col">รายการ</th><th scope="col">ผล</th><th scope="col">รายละเอียด/สิ่งผิดปกติ</th><th scope="col">วิธีแก้/งานติดตาม</th></tr></thead>
              <tbody>@for (row of results(); track $index; let i = $index) {
                <tr><td>{{ row.label }}</td>
                  <td><select [disabled]="locked()" [value]="row.result" (change)="set(i, 'result', $any($event.target).value)"><option value="" [selected]="!row.result">–</option><option value="ปกติ" [selected]="row.result === 'ปกติ'">ปกติ</option><option value="ผิดปกติ" [selected]="row.result === 'ผิดปกติ'">ผิดปกติ</option><option value="ไม่เกี่ยวข้อง" [selected]="row.result === 'ไม่เกี่ยวข้อง'">ไม่เกี่ยวข้อง</option></select></td>
                  <td><input [disabled]="locked()" [value]="row.note || ''" (input)="set(i, 'note', $any($event.target).value)" /></td>
                  <td><input [disabled]="locked()" [value]="row.action || ''" (input)="set(i, 'action', $any($event.target).value)" /></td>
                </tr>
              }</tbody>
            </table></div>
          }
          <div class="field" style="margin-top:10px"><label for="lf-pm-record-component-1">สรุปผล</label><textarea id="lf-pm-record-component-1" rows="3" [disabled]="locked()" [value]="summary()" (input)="summary.set($any($event.target).value)"></textarea></div>
          @if (!locked()) { <div class="form-actions"><button type="button" class="btn" [disabled]="busy()" (click)="save(false)">บันทึกร่าง</button><button type="button" class="btn primary" [disabled]="busy()" (click)="save(true)">ปิดงาน PM</button></div> }
        </div>
        <div class="card"><h3>ประวัติ</h3>
          @if (!audit().length) { <div class="muted">–</div> } @else { @for (entry of audit(); track entry['id']) { <div class="tl-item"><div class="tl-dot"></div><div><b>{{ entry['summary'] }}</b><div class="muted small">{{ entry['userName'] }} · {{ fmtDateTime(entry['at']) }}</div></div></div> } }
        </div>
      </div>
    } @else if (loading()) {
      <div class="state"><div class="spinner"></div>กำลังโหลดข้อมูล…</div>
    } @else {
      <div class="state error">ไม่พบงาน PM หรือไม่มีสิทธิ์เข้าถึง</div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PmRecordComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly meta = inject(MetaService);
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly record = signal<RecordRow | null>(null);
  readonly results = signal<PmResult[]>([]);
  readonly summary = signal('');
  readonly audit = signal<Record<string, unknown>[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly locked = signal(true);
  readonly fmtDate = fmtDate;
  readonly fmtDateTime = fmtDateTime;

  ngOnInit(): void {
    this.meta.load();
    this.load();
  }

  load(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.api.get<RecordRow>(`/records/pmRecords/${id}`).subscribe({
      next: (record) => {
        this.record.set(record);
        this.results.set(Array.isArray(record['results']) ? (record['results'] as PmResult[]) : []);
        this.summary.set(String(record['summary'] ?? ''));
        this.locked.set(record['status'] === 'เสร็จ' || !this.auth.can('pm', 'edit'));
        this.loading.set(false);
        this.api.get<Record<string, unknown>[]>(`/audit/records/pmRecords/${id}`).subscribe({ next: (audit) => this.audit.set(audit), error: () => this.audit.set([]) });
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.toast.error(apiErrorMessage(error));
      },
    });
  }

  set(index: number, key: 'result' | 'note' | 'action', value: string): void {
    this.results.update((rows) => rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  save(finish: boolean): void {
    const rec = this.record();
    if (!rec || this.busy()) return;
    this.busy.set(true);
    this.api.patch(`/pm/records/${rec.id}`, { results: this.results(), summary: this.summary(), finish }).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.show(finish ? 'ปิดงาน PM แล้ว' : 'บันทึกแล้ว');
        this.load();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.toast.error(apiErrorMessage(error));
      },
    });
  }

  back(): void {
    void this.router.navigate(['/pm']);
  }
}
