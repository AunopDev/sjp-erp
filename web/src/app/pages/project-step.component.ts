import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { Observable, firstValueFrom, of, switchMap } from 'rxjs';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { FileService, type StoredFile } from '../core/file.service';
import { MetaService } from '../core/meta.service';
import { fmtDate, fmtDateTime } from '../core/util';
import { DynamicFieldsComponent } from '../shared/fields.component';
import { ToastService } from '../shared/toast.service';
import type { Option, ProjectStepDef, RecordRow } from '../core/models';

interface DocFile extends StoredFile {
  at: string;
  by?: string;
  signerName?: string;
  signerRole?: string;
  signedDate?: string;
  version?: string;
}

interface StepData {
  status?: 'pending' | 'doing' | 'done' | 'skipped';
  values?: Record<string, unknown>;
  docs?: Record<string, DocFile[]>;
  log?: { id: string; at: string; text: string }[];
  plannedDate?: string;
  owner?: string;
  notes?: string;
  pendingApproval?: boolean;
}

@Component({
  selector: 'app-project-step',
  standalone: true,
  imports: [DynamicFieldsComponent],
  template: `
    <div class="step-body">
      <p class="muted small">{{ step.desc }} @if (step.source === 'document') { <span class="badge blue">workflow ตั้งต้นจากเอกสาร — รอยืนยัน</span> }</p>
      @if (data.pendingApproval) { <div class="notice warn">รออนุมัติจบขั้นตอนนี้</div> }
      <div class="form-grid">
        <div class="field"><label for="lf-project-step-component-1">ผู้รับผิดชอบขั้นตอน</label><select id="lf-project-step-component-1" [disabled]="!editable" [value]="owner" (change)="owner = $any($event.target).value"><option value="" [selected]="!owner">–</option>@for (user of users; track user.value) { <option [value]="user.value" [selected]="user.value === owner">{{ user.label }}</option> }</select></div>
        <div class="field"><label for="lf-project-step-component-2">วันที่วางแผน</label><input id="lf-project-step-component-2" type="date" [disabled]="!editable" [value]="plannedDate" (input)="plannedDate = $any($event.target).value" /></div>
      </div>
      @if (step.fields.length) { <app-fields [fields]="step.fields" [values]="values" [lists]="lists" [disabled]="!editable" (valuesChange)="values = $event" /> }
      <div class="field" style="margin-top:10px"><label for="lf-project-step-component-3">หมายเหตุขั้นตอน</label><textarea id="lf-project-step-component-3" rows="2" [disabled]="!editable" [value]="notes" (input)="notes = $any($event.target).value"></textarea></div>

      @if (step.docs.length) {
        <div style="margin-top:10px">
          <b>เอกสาร{{ step.requireDocs ? ' (บังคับแนบ)' : '' }}</b>
          @for (doc of step.docs; track doc.key) {
            <div class="doc-row">
              <div class="doc-head">
                <span class="doc-label">
                  <span class="badge {{ (docs[doc.key] || []).length ? 'green' : (doc.required || step.requireDocs ? 'red' : 'gray') }}">{{ (docs[doc.key] || []).length ? 'มีไฟล์' : 'ยังไม่แนบ' }}</span>
                  {{ doc.label }}
                  @if (doc.required || step.requireDocs) { <span class="muted small">· ต้องแนบ</span> }
                  @if (doc.signoff) { <span class="muted small">· ต้องลงนาม</span> }
                </span>
                @if (editable) {
                  <label class="btn sm file-pick" [class.disabled]="uploading">
                    <input type="file" multiple [disabled]="uploading" (change)="addDocs(doc.key, $event)" />
                    {{ uploading ? 'กำลังอัปโหลด…' : 'แนบไฟล์' }}
                  </label>
                }
              </div>
              @for (file of docs[doc.key] || []; track $index; let i = $index) {
                <div class="doc-file">
                  <span class="file-chip">
                    {{ file.name }}
                    @if (file.id) { <a href="#x" (click)="downloadDoc(file, $event)">ดาวน์โหลด</a> }
                    @if (editable) { <a href="#x" (click)="removeDoc(doc.key, i, $event)">นำออก</a> }
                  </span>
                  <span class="doc-sign small">
                    @if (file.signerName || file.signedDate) {
                      {{ file.signerName || 'ไม่ระบุชื่อ' }} · {{ signerRoleLabel(file.signerRole) }} · {{ file.signedDate ? fmtDate(file.signedDate) : 'ไม่ระบุวันที่' }}@if (file.version) { · v{{ file.version }} }
                    } @else {
                      <span class="muted">ยังไม่บันทึกผู้ลงนาม</span>
                    }
                  </span>
                  @if (editable) {
                    <button type="button" class="btn sm" (click)="toggleSignoff(doc.key, i)">{{ editingSignoff(doc.key, i) ? 'ปิด' : 'ลงนาม' }}</button>
                  }
                  @if (editingSignoff(doc.key, i)) {
                    <div class="signoff-editor">
                      <input placeholder="ชื่อผู้ลงนาม" [value]="file.signerName || ''" (input)="setSignoff(doc.key, i, 'signerName', $any($event.target).value)" />
                      <select [value]="file.signerRole || ''" (change)="setSignoff(doc.key, i, 'signerRole', $any($event.target).value)">
                        <option value="">บทบาท…</option>
                        @for (role of signerRoles; track role) { <option [value]="role" [selected]="role === file.signerRole">{{ role }}</option> }
                      </select>
                      <input type="date" [value]="file.signedDate || ''" (input)="setSignoff(doc.key, i, 'signedDate', $any($event.target).value)" />
                      <input placeholder="เวอร์ชัน" [value]="file.version || ''" (input)="setSignoff(doc.key, i, 'version', $any($event.target).value)" />
                    </div>
                  }
                </div>
              }
            </div>
          }
          @if (current && (missingDocs.length || missingSignoffs.length)) {
            <div class="notice warn small" role="status">
              @if (missingDocs.length) { <div>ยังขาดเอกสาร: {{ missingDocs.join(', ') }}</div> }
              @if (missingSignoffs.length) { <div>ยังไม่ได้ลงนาม: {{ missingSignoffs.join(', ') }}</div> }
            </div>
          }
          <div class="muted small">ไฟล์จะถูกอัปโหลดและเก็บไว้ในเซิร์ฟเวอร์ (สูงสุด 15 MB ต่อไฟล์)</div>
        </div>
      }

      @if (data.log?.length) {
        <details style="margin-top:8px"><summary class="small muted">บันทึกขั้นตอน ({{ data.log!.length }})</summary>
          @for (entry of data.log!.slice().reverse(); track entry.id) { <div class="small">{{ fmtDateTime(entry.at) }} · {{ entry.text }}</div> }
        </details>
      }

      @if (canEdit && !projectClosed) {
        <div class="form-actions">
          @if (editable) { <button type="button" class="btn" [disabled]="busy" (click)="save()">บันทึกข้อมูลขั้นตอน</button> }
          @if (current && data.status === 'pending') { <button type="button" class="btn" [disabled]="busy" (click)="runAction('start')">เริ่มขั้นตอน</button> }
          @if (current && (data.status === 'doing' || data.status === 'pending')) { <button type="button" class="btn primary" [disabled]="busy || missingDocs.length > 0 || missingSignoffs.length > 0" [title]="missingDocs.length || missingSignoffs.length ? 'ต้องแนบเอกสาร/ลงนามให้ครบก่อน' : ''" (click)="runAction('complete')">จบขั้นตอน</button> }
          @if (current && data.status !== 'done' && data.status !== 'skipped') { <button type="button" class="btn" [disabled]="busy" (click)="skip()">ข้าม</button> }
          @if (data.status === 'done' || data.status === 'skipped') { <button type="button" class="btn" [disabled]="busy" (click)="reopen()">เปิดขั้นตอนใหม่</button> }
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectStepComponent implements OnChanges {
  @Input({ required: true }) projectId = '';
  @Input({ required: true }) step!: ProjectStepDef;
  @Input({ required: true }) data: StepData = {};
  @Input() canEdit = false;
  @Input() current = false;
  @Input() projectClosed = false;
  @Input() lists: { teams: string[]; depts: string[] } = { teams: [], depts: [] };
  @Output() reload = new EventEmitter<void>();

  values: Record<string, unknown> = {};
  docs: Record<string, DocFile[]> = {};
  plannedDate = '';
  owner = '';
  notes = '';
  users: Option[] = [];
  busy = false;
  uploading = false;
  private readonly fileService = inject(FileService);
  readonly fmtDateTime = fmtDateTime;
  readonly fmtDate = fmtDate;

  constructor(
    private readonly api: ApiService,
    private readonly meta: MetaService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.meta.options('users').subscribe((users) => {
      this.users = users;
      this.cdr.markForCheck();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] || changes['step']) {
      this.values = { ...(this.data.values ?? {}) };
      this.docs = JSON.parse(JSON.stringify(this.data.docs ?? {}));
      this.plannedDate = this.data.plannedDate ?? '';
      this.owner = this.data.owner ?? '';
      this.notes = this.data.notes ?? '';
    }
  }

  get editable(): boolean {
    return this.canEdit && !this.projectClosed && this.data.status !== 'done' && this.data.status !== 'skipped';
  }

  get dirty(): boolean {
    return JSON.stringify({
      values: this.values,
      docs: this.docs,
      plannedDate: this.plannedDate,
      owner: this.owner,
      notes: this.notes,
    }) !== JSON.stringify({
      values: this.data.values ?? {},
      docs: this.data.docs ?? {},
      plannedDate: this.data.plannedDate ?? '',
      owner: this.data.owner ?? '',
      notes: this.data.notes ?? '',
    });
  }

  readonly signerRoles = ['ลูกค้า', 'ผู้ให้บริการเครือข่าย (NT)', 'SJP', 'ผู้รับเหมาช่วง', 'อื่นๆ'];
  signoffKey = '';
  signoffIndex = -1;

  editingSignoff(key: string, index: number): boolean {
    return this.signoffKey === key && this.signoffIndex === index;
  }

  toggleSignoff(key: string, index: number): void {
    if (this.editingSignoff(key, index)) {
      this.signoffKey = '';
      this.signoffIndex = -1;
    } else {
      this.signoffKey = key;
      this.signoffIndex = index;
    }
    this.cdr.markForCheck();
  }

  setSignoff(key: string, index: number, field: 'signerName' | 'signerRole' | 'signedDate' | 'version', value: string): void {
    const list = [...(this.docs[key] ?? [])];
    const file = list[index];
    if (!file) return;
    list[index] = { ...file, [field]: value };
    this.docs = { ...this.docs, [key]: list };
    this.cdr.markForCheck();
  }

  signerRoleLabel(role?: string): string {
    return role || 'ไม่ระบุบทบาท';
  }

  get missingDocs(): string[] {
    return this.step.docs
      .filter((doc) => (this.step.requireDocs || doc.required) && !(this.docs[doc.key] ?? []).length)
      .map((doc) => doc.label);
  }

  get missingSignoffs(): string[] {
    return this.step.docs
      .filter((doc) => {
        const files = this.docs[doc.key] ?? [];
        return doc.signoff && files.length > 0 && !files.some((file) => file.signerName && file.signedDate);
      })
      .map((doc) => doc.label);
  }

  save(): void {
    this.saveRequest().subscribe({
      next: () => {
        this.toast.show('บันทึกข้อมูลขั้นตอนแล้ว');
        this.reload.emit();
        this.cdr.markForCheck();
      },
      error: (error: unknown) => {
        this.toast.error(apiErrorMessage(error));
        this.cdr.markForCheck();
      },
    });
  }

  runAction(action: 'start' | 'complete'): void {
    if (this.busy) return;
    this.busy = true;
    this.saveRequest()
      .pipe(switchMap(() => this.api.post(`/projects/${this.projectId}/steps/${this.step.key}/${action}`, {})))
      .subscribe({
        next: (result) => {
          this.busy = false;
          const pending = !!(result as Record<string, unknown> | null)?.['_pendingApproval'];
          this.toast.show(pending ? 'ส่งคำขออนุมัติแล้ว — รอผู้อนุมัติ' : action === 'complete' ? 'จบขั้นตอนแล้ว' : 'เริ่มขั้นตอนแล้ว');
          this.reload.emit();
          this.cdr.markForCheck();
        },
        error: (error: unknown) => {
          this.busy = false;
          this.toast.error(apiErrorMessage(error));
          this.cdr.markForCheck();
        },
      });
  }

  skip(): void {
    const reason = prompt('เหตุผลที่ข้ามขั้นตอน');
    if (!reason?.trim()) return;
    this.postAction('skip', { reason });
  }

  reopen(): void {
    const reason = prompt('เหตุผลที่เปิดขั้นตอนใหม่');
    if (!reason?.trim()) return;
    this.postAction('reopen', { reason });
  }

  async addDocs(key: string, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    this.uploading = true;
    const list = [...(this.docs[key] ?? [])];
    for (const file of files) {
      try {
        const uploaded = await firstValueFrom(this.fileService.upload(file));
        list.push({ ...this.fileService.asStored(uploaded), at: new Date().toISOString() });
      } catch {
        this.toast.error(`อัปโหลด ${file.name} ไม่สำเร็จ`);
      }
    }
    this.uploading = false;
    this.docs = { ...this.docs, [key]: list };
    this.cdr.markForCheck();
  }

  downloadDoc(file: StoredFile, event: Event): void {
    event.preventDefault();
    this.fileService.download(file);
  }

  removeDoc(key: string, index: number, event: Event): void {
    event.preventDefault();
    const reason = prompt('เหตุผลการนำไฟล์ออก');
    if (!reason?.trim()) return;
    this.docs = { ...this.docs, [key]: (this.docs[key] ?? []).filter((_, i) => i !== index) };
  }

  private postAction(action: string, body: Record<string, unknown>): void {
    this.api.post(`/projects/${this.projectId}/steps/${this.step.key}/${action}`, body).subscribe({
      next: () => {
        this.toast.show('ดำเนินการแล้ว');
        this.reload.emit();
        this.cdr.markForCheck();
      },
      error: (error: unknown) => {
        this.toast.error(apiErrorMessage(error));
        this.cdr.markForCheck();
      },
    });
  }

  private saveRequest(): Observable<unknown> {
    if (!this.dirty) return of(null);
    return this.api.patch(`/projects/${this.projectId}/steps/${this.step.key}`, {
      values: this.values,
      docs: this.docs,
      plannedDate: this.plannedDate,
      owner: this.owner,
      notes: this.notes,
    });
  }
}
