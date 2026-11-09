import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { Observable, firstValueFrom, of, switchMap } from 'rxjs';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { FileService, type StoredFile } from '../core/file.service';
import { MetaService } from '../core/meta.service';
import { fmtDateTime } from '../core/util';
import { DynamicFieldsComponent } from '../shared/fields.component';
import { ToastService } from '../shared/toast.service';
import type { Option, ProjectStepDef, RecordRow } from '../core/models';

interface StepData {
  status?: 'pending' | 'doing' | 'done' | 'skipped';
  values?: Record<string, unknown>;
  docs?: Record<string, (StoredFile & { at: string; by?: string })[]>;
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
        <div class="field"><label>ผู้รับผิดชอบขั้นตอน</label><select [disabled]="!editable" [value]="owner" (change)="owner = $any($event.target).value"><option value="" [selected]="!owner">–</option>@for (user of users; track user.value) { <option [value]="user.value" [selected]="user.value === owner">{{ user.label }}</option> }</select></div>
        <div class="field"><label>วันที่วางแผน</label><input type="date" [disabled]="!editable" [value]="plannedDate" (input)="plannedDate = $any($event.target).value" /></div>
      </div>
      @if (step.fields.length) { <app-fields [fields]="step.fields" [values]="values" [lists]="lists" [disabled]="!editable" (valuesChange)="values = $event" /> }
      <div class="field" style="margin-top:10px"><label>หมายเหตุขั้นตอน</label><textarea rows="2" [disabled]="!editable" [value]="notes" (input)="notes = $any($event.target).value"></textarea></div>

      @if (step.docs.length) {
        <div style="margin-top:10px">
          <b>เอกสาร{{ step.requireDocs ? ' (บังคับแนบ)' : '' }}</b>
          @for (doc of step.docs; track doc.key) {
            <div class="doc-row">
              <span class="doc-label">[{{ (docs[doc.key] || []).length ? 'มีไฟล์' : 'ยังไม่แนบ' }}] {{ doc.label }}</span>
              <span class="small grow doc-files">@for (file of docs[doc.key] || []; track $index) { <span class="file-chip">{{ file.name }} @if (file.id) { <a href="#x" (click)="downloadDoc(file, $event)">ดาวน์โหลด</a> } @if (editable) { <a href="#x" (click)="removeDoc(doc.key, $index, $event)">นำออก</a> }</span> }</span>
              @if (editable) {
                <label class="btn sm file-pick" [class.disabled]="uploading">
                  <input type="file" multiple [disabled]="uploading" (change)="addDocs(doc.key, $event)" />
                  {{ uploading ? 'กำลังอัปโหลด…' : 'แนบไฟล์' }}
                </label>
              }
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
        <div class="row" style="margin-top:12px">
          @if (editable) { <button type="button" class="btn" [disabled]="busy" (click)="save()">บันทึกข้อมูลขั้นตอน</button> }
          @if (current && data.status === 'pending') { <button type="button" class="btn" [disabled]="busy" (click)="runAction('start')">เริ่มขั้นตอน</button> }
          @if (current && (data.status === 'doing' || data.status === 'pending')) { <button type="button" class="btn primary" [disabled]="busy" (click)="runAction('complete')">จบขั้นตอน</button> }
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
  docs: Record<string, (StoredFile & { at: string; by?: string })[]> = {};
  plannedDate = '';
  owner = '';
  notes = '';
  users: Option[] = [];
  busy = false;
  uploading = false;
  private readonly fileService = inject(FileService);
  readonly fmtDateTime = fmtDateTime;

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
        next: () => {
          this.busy = false;
          this.toast.show(action === 'complete' ? 'จบขั้นตอนแล้ว' : 'เริ่มขั้นตอนแล้ว');
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
