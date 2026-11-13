import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { ApiService, apiErrorMessage, apiFieldErrors } from '../core/api.service';
import { MetaService } from '../core/meta.service';
import { ToastService } from './toast.service';
import { DynamicFieldsComponent } from './fields.component';
import { ModalComponent } from './modal.component';
import type { FieldDef, RecordRow } from '../core/models';

@Component({
  selector: 'app-record-form',
  standalone: true,
  imports: [ModalComponent, DynamicFieldsComponent],
  template: `
    @if (inline) {
      <div class="card record-form-page">
        @if (errorCount()) {
          <div class="notice bad" role="alert">มี {{ errorCount() }} ช่องที่ต้องแก้ไข — ตรวจสอบข้อความใต้ช่องนั้น</div>
        } @else if (message) {
          <div class="notice bad" role="alert">{{ message }}</div>
        }
        <app-fields
          [fields]="fields"
          [values]="values"
          [errors]="errors"
          [lists]="lists"
          (valuesChange)="values = $event"
        />
        <div class="record-form-actions">
          <button type="button" class="btn" (click)="closed.emit()">ยกเลิก</button>
          <button type="button" class="btn primary" [disabled]="saving" (click)="save()">{{ saving ? 'กำลังบันทึก…' : 'บันทึก' }}</button>
        </div>
      </div>
    } @else {
      <app-modal [title]="title || (record ? 'แก้ไข' : 'เพิ่ม') + ' ' + entityLabel" [wide]="true" (closed)="closed.emit()">
        @if (errorCount()) {
          <div class="notice bad" role="alert">มี {{ errorCount() }} ช่องที่ต้องแก้ไข — ตรวจสอบข้อความใต้ช่องนั้น</div>
        } @else if (message) {
          <div class="notice bad" role="alert">{{ message }}</div>
        }
        <app-fields
          [fields]="fields"
          [values]="values"
          [errors]="errors"
          [lists]="lists"
          (valuesChange)="values = $event"
        />
        <div modal-footer>
          <button type="button" class="btn" (click)="closed.emit()">ยกเลิก</button>
          <button type="button" class="btn primary" [disabled]="saving" (click)="save()">{{ saving ? 'กำลังบันทึก…' : 'บันทึก' }}</button>
        </div>
      </app-modal>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordFormComponent implements OnChanges {
  @Input({ required: true }) entity = '';
  @Input() entityLabel = '';
  @Input({ required: true }) fields: FieldDef[] = [];
  @Input() record: RecordRow | null = null;
  @Input() title = '';
  @Input() defaults: Record<string, unknown> = {};
  @Input() inline = false;
  @Input() lists: { teams: string[]; depts: string[] } = { teams: [], depts: [] };
  @Input() createUrl = '';
  @Input() updateUrl = '';

  @Output() saved = new EventEmitter<RecordRow>();
  @Output() closed = new EventEmitter<void>();

  values: Record<string, unknown> = {};
  errors: Record<string, string> = {};
  message = '';
  saving = false;

  constructor(
    private readonly api: ApiService,
    private readonly meta: MetaService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['record'] || changes['fields'] || changes['defaults']) {
      const source = this.record ?? { ...this.defaults };
      this.values = this.pick(source);
    }
  }

  errorCount(): number {
    return Object.keys(this.errors).length;
  }

  save(): void {
    if (this.saving) return;
    this.saving = true;
    this.message = '';
    this.errors = {};
    const payload = this.pick(this.values);
    const request = this.record?.id
      ? this.api.patch<RecordRow>(this.updateUrl || `/records/${this.entity}/${this.record.id}`, payload)
      : this.api.post<RecordRow>(this.createUrl || `/records/${this.entity}`, payload);
    request.subscribe({
      next: (record) => {
        this.saving = false;
        this.meta.clearOptions();
        this.toast.show(this.record ? 'บันทึกการแก้ไขแล้ว' : 'สร้างรายการแล้ว');
        this.saved.emit(record);
        this.closed.emit();
        this.cdr.markForCheck();
      },
      error: (error: unknown) => {
        this.saving = false;
        this.errors = apiFieldErrors(error);
        this.message = this.errorCount() ? '' : apiErrorMessage(error);
        if (!this.errorCount()) this.toast.error(this.message);
        this.cdr.markForCheck();
        const first = Object.keys(this.errors)[0];
        if (first) {
          setTimeout(() => document.getElementById('f-' + first)?.focus());
        }
      },
    });
  }

  private pick(source: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const field of this.fields) {
      if (field.type === 'section' || field.type === 'formula') continue;
      if (source[field.key] !== undefined) out[field.key] = source[field.key];
    }
    return out;
  }
}
