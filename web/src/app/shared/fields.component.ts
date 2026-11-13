import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FileService, type StoredFile } from '../core/file.service';
import { MetaService } from '../core/meta.service';
import { toLocalInput } from '../core/util';
import { ToastService } from './toast.service';
import type { FieldDef, Option } from '../core/models';

@Component({
  selector: 'app-field',
  standalone: true,
  template: `
    @if (field.type === 'section') {
      <div class="section-title">{{ field.label }}</div>
    } @else {
      <div class="field" [class.wide]="isWide()" [class.has-error]="!!error">
        <label [attr.for]="'f-' + field.key">{{ field.label }}@if (field.required) {<b class="req"> *</b>}</label>
        @if (field.help) { <div class="muted small" style="margin-top:-3px">{{ field.help }}</div> }
        @switch (field.type) {
          @case ('textarea') {
            <textarea [id]="'f-' + field.key" rows="3" [value]="asText(value)" [disabled]="disabled" [attr.aria-invalid]="error ? 'true' : null" [attr.aria-describedby]="error ? 'err-' + field.key : null" [attr.aria-required]="field.required ? 'true' : null" (input)="emitText($event)"></textarea>
          }
          @case ('number') {
            <div class="with-suffix">
              <input [id]="'f-' + field.key" type="number" inputMode="decimal" step="any" [value]="asText(value)" [disabled]="disabled" [attr.aria-invalid]="error ? 'true' : null" [attr.aria-describedby]="error ? 'err-' + field.key : null" [attr.aria-required]="field.required ? 'true' : null" (input)="emitText($event)" />
              @if (field.suffix) { <span>{{ field.suffix }}</span> }
            </div>
          }
          @case ('date') {
            <input [id]="'f-' + field.key" type="date" [value]="asText(value)" [disabled]="disabled" [attr.aria-invalid]="error ? 'true' : null" [attr.aria-describedby]="error ? 'err-' + field.key : null" [attr.aria-required]="field.required ? 'true' : null" (input)="emitText($event)" />
          }
          @case ('datetime') {
            <input [id]="'f-' + field.key" type="datetime-local" [value]="toLocal(value)" [disabled]="disabled" [attr.aria-invalid]="error ? 'true' : null" [attr.aria-describedby]="error ? 'err-' + field.key : null" [attr.aria-required]="field.required ? 'true' : null" (input)="emitDateTime($event)" />
          }
          @case ('select') {
            <select [id]="'f-' + field.key" [value]="asText(value)" [disabled]="disabled" [attr.aria-invalid]="error ? 'true' : null" [attr.aria-describedby]="error ? 'err-' + field.key : null" [attr.aria-required]="field.required ? 'true' : null" (change)="emitText($event)">
              <option value="" [selected]="!asText(value)">– เลือก –</option>
              @for (option of options; track option.value) { <option [value]="option.value" [selected]="option.value === asText(value)">{{ option.label }}</option> }
              @if (value && !hasOption(asText(value))) { <option [value]="asText(value)" [selected]="true">{{ asText(value) }} (ค่าเดิม)</option> }
            </select>
          }
          @case ('ref') {
            <select [id]="'f-' + field.key" [value]="asText(value)" [disabled]="disabled" [attr.aria-invalid]="error ? 'true' : null" [attr.aria-describedby]="error ? 'err-' + field.key : null" [attr.aria-required]="field.required ? 'true' : null" (change)="emitText($event)">
              <option value="" [selected]="!asText(value)">– เลือก –</option>
              @for (option of options; track option.value) { <option [value]="option.value" [selected]="option.value === asText(value)">{{ option.label }}</option> }
              @if (value && !hasOption(asText(value))) { <option [value]="asText(value)" [selected]="true">(ไม่พบ/ไม่มีสิทธิ์ดู)</option> }
            </select>
            @if (!disabled && !options.length) {
              <div class="muted small field-hint">
                ยังไม่มีข้อมูล{{ refLabel() ? ' “' + refLabel() + '”' : '' }} ให้เลือก — เพิ่ม{{ refLabel() ? 'ที่เมนู “' + refLabel() + '” ก่อน' : 'ข้อมูลหลักก่อน' }} แล้วกลับมาเลือก
              </div>
            }
          }
          @case ('boolean') {
            <label class="check"><input [id]="'f-' + field.key" type="checkbox" [checked]="!!value" [disabled]="disabled" [attr.aria-invalid]="error ? 'true' : null" [attr.aria-describedby]="error ? 'err-' + field.key : null" (change)="emitBoolean($event)" /> ใช่</label>
          }
          @case ('multiselect') {
            <div class="row">
              @for (option of options; track option.value) {
                <label class="check"><input type="checkbox" [checked]="isMultiChecked(option.value)" [disabled]="disabled" (change)="toggleMulti(option.value, $event)" /> {{ option.label }}</label>
              }
            </div>
          }
          @case ('file') {
            <div>
              <div class="file-row">
                <label class="btn sm file-pick">
                  <input [id]="'f-' + field.key" type="file" multiple [disabled]="disabled || uploading" [attr.aria-invalid]="error ? 'true' : null" [attr.aria-describedby]="error ? 'err-' + field.key : null" (change)="addFiles($event)" />
                  {{ uploading ? 'กำลังอัปโหลด…' : 'แนบไฟล์' }}
                </label>
              </div>
              @for (file of asFiles(value); track $index) {
                <div class="file-chip">
                  {{ file.name }} <span class="muted">({{ Math.round((file.size || 0) / 1024) }} KB)</span>
                  @if (file.id) { <a href="#x" (click)="download(file, $event)">ดาวน์โหลด</a> }
                  @if (!disabled) { <button type="button" class="btn ghost sm" (click)="removeFile($index)">นำออก</button> }
                </div>
              }
              <div class="muted small">แนบไฟล์ได้สูงสุด 15 MB ต่อไฟล์</div>
            </div>
          }
          @case ('formula') {
            <div class="formula-box">– <span class="muted small">(คำนวณอัตโนมัติ)</span></div>
          }
          @case ('rows') {
            <div class="rows-input">
              <div class="table-wrap">
                <table class="mini">
                  <thead><tr>@for (col of field.cols; track col.key) { <th scope="col">{{ col.label }}@if (col.required) {<b class="req"> *</b>}</th> }<th scope="col"><span class="sr-only">จัดการ</span></th></tr></thead>
                  <tbody>
                    @for (line of asRows(value); track $index; let rowIndex = $index) {
                      <tr>
                        @for (col of field.cols; track col.key) {
                          <td [attr.data-label]="col.label">
                            @if (col.type === 'select') {
                              <select [value]="asText(line[col.key])" [disabled]="disabled" (change)="setRow(rowIndex, col.key, $any($event.target).value)">
                                <option value="" [selected]="!asText(line[col.key])">–</option>
                                @for (option of col.options ?? []; track option) { <option [value]="option" [selected]="option === asText(line[col.key])">{{ option }}</option> }
                              </select>
                            } @else if (col.type === 'ref') {
                              <select [value]="asText(line[col.key])" [disabled]="disabled" (change)="setRow(rowIndex, col.key, $any($event.target).value)">
                                <option value="" [selected]="!asText(line[col.key])">–</option>
                                @for (option of rowOptions[col.key] ?? []; track option.value) { <option [value]="option.value" [selected]="option.value === asText(line[col.key])">{{ option.label }}</option> }
                              </select>
                            } @else {
                              <input [type]="col.type === 'number' ? 'number' : 'text'" [value]="asText(line[col.key])" [disabled]="disabled" (input)="setRow(rowIndex, col.key, $any($event.target).value)" />
                            }
                          </td>
                        }
                        <td class="row-action">@if (!disabled) { <button type="button" class="btn ghost sm" (click)="removeRow(rowIndex)" aria-label="ลบแถว">ลบ</button> }</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (!disabled) { <button type="button" class="btn sm" (click)="addRow()">+ เพิ่มแถว</button> }
            </div>
          }
          @default {
            <input [id]="'f-' + field.key" [type]="field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'" [value]="asText(value)" [disabled]="disabled" [attr.aria-invalid]="error ? 'true' : null" [attr.aria-describedby]="error ? 'err-' + field.key : null" [attr.aria-required]="field.required ? 'true' : null" (input)="emitText($event)" />
          }
        }
        @if (error) { <div class="err" [id]="'err-' + field.key" role="alert">{{ error }}</div> }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldComponent {
  @Input({ required: true }) field!: FieldDef;
  @Input() value: unknown = '';
  @Input() error = '';
  @Input() disabled = false;
  @Input() options: Option[] = [];
  @Input() rowOptions: Record<string, Option[]> = {};
  @Output() valueChange = new EventEmitter<unknown>();

  private readonly fileService = inject(FileService);
  private readonly toast = inject(ToastService);
  private readonly meta = inject(MetaService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly Math = Math;
  readonly toLocal = toLocalInput;
  uploading = false;

  refLabel(): string {
    const key = this.field?.ref;
    if (!key) return '';
    return this.meta.entity(key)?.label ?? '';
  }

  isWide(): boolean {
    return ['textarea', 'rows', 'file', 'multiselect'].includes(this.field.type) || !!this.field.wide;
  }

  asText(value: unknown): string {
    return value === undefined || value === null ? '' : String(value);
  }

  asRows(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  }

  asFiles(value: unknown): StoredFile[] {
    return Array.isArray(value) ? (value as StoredFile[]) : [];
  }

  hasOption(value: string): boolean {
    return this.options.some((option) => option.value === value);
  }

  emitText(event: Event): void {
    this.valueChange.emit((event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value);
  }

  emitDateTime(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.valueChange.emit(value ? new Date(value).toISOString() : '');
  }

  emitBoolean(event: Event): void {
    this.valueChange.emit((event.target as HTMLInputElement).checked);
  }

  isMultiChecked(option: string): boolean {
    return Array.isArray(this.value) && (this.value as string[]).includes(option);
  }

  toggleMulti(option: string, event: Event): void {
    const current = Array.isArray(this.value) ? [...(this.value as string[])] : [];
    const checked = (event.target as HTMLInputElement).checked;
    this.valueChange.emit(checked ? [...current, option] : current.filter((x) => x !== option));
  }

  async addFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    this.uploading = true;
    const list = [...this.asFiles(this.value)];
    for (const file of files) {
      try {
        const uploaded = await firstValueFrom(this.fileService.upload(file));
        list.push(this.fileService.asStored(uploaded));
      } catch (error) {
        this.toast.error(error instanceof Error ? error.message : 'อัปโหลดไฟล์ไม่สำเร็จ');
      }
    }
    this.uploading = false;
    this.valueChange.emit(list);
    this.cdr.markForCheck();
  }

  download(file: StoredFile, event: Event): void {
    event.preventDefault();
    this.fileService.download(file);
  }

  removeFile(index: number): void {
    this.valueChange.emit(this.asFiles(this.value).filter((_, i) => i !== index));
  }

  addRow(): void {
    this.valueChange.emit([...this.asRows(this.value), {}]);
  }

  removeRow(index: number): void {
    this.valueChange.emit(this.asRows(this.value).filter((_, i) => i !== index));
  }

  setRow(index: number, key: string, value: unknown): void {
    const rows = this.asRows(this.value).map((row, i) => (i === index ? { ...row, [key]: value } : row));
    this.valueChange.emit(rows);
  }
}

@Component({
  selector: 'app-fields',
  standalone: true,
  imports: [FieldComponent],
  template: `
    <div class="form-grid">
      @for (field of visibleFields(); track field.key) {
        <app-field
          [field]="field"
          [value]="values[field.key]"
          [error]="errors[field.key] || ''"
          [disabled]="disabled"
          [options]="optionsFor(field)"
          [rowOptions]="rowOptionsFor(field)"
          (valueChange)="set(field.key, $event)"
        />
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DynamicFieldsComponent implements OnChanges {
  @Input() fields: FieldDef[] = [];
  @Input() values: Record<string, unknown> = {};
  @Input() errors: Record<string, string> = {};
  @Input() disabled = false;
  @Input() lists: { teams: string[]; depts: string[] } = { teams: [], depts: [] };
  @Output() valuesChange = new EventEmitter<Record<string, unknown>>();

  readonly options = new Map<string, Option[]>();
  private latest: Record<string, unknown> = {};

  constructor(
    private readonly meta: MetaService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['values']) this.latest = this.values ?? {};
    if (changes['fields'] || changes['lists']) this.loadOptions();
  }

  visibleFields(): FieldDef[] {
    return this.fields.filter(
      (field) => !field.hidden && (!field.showIf || this.values[field.showIf.field] === field.showIf.value),
    );
  }

  set(key: string, value: unknown): void {
    // Merge into the latest local copy so several fields changed in one tick
    // (paste, automation, fast tabbing) do not overwrite each other.
    this.latest = { ...this.latest, [key]: value };
    this.valuesChange.emit(this.latest);
  }

  optionsFor(field: FieldDef): Option[] {
    if (field.type === 'select' || field.type === 'multiselect') {
      if (field.optionsFrom === 'teams') return this.lists.teams.map((value) => ({ value, label: value }));
      if (field.optionsFrom === 'depts') return this.lists.depts.map((value) => ({ value, label: value }));
      return (field.options ?? []).map((value) => ({ value, label: value }));
    }
    return this.options.get(field.key) ?? [];
  }

  rowOptionsFor(field: FieldDef): Record<string, Option[]> {
    const out: Record<string, Option[]> = {};
    for (const col of field.cols ?? []) {
      if (col.type === 'ref') out[col.key] = this.options.get(`${field.key}.${col.key}`) ?? [];
    }
    return out;
  }

  private loadOptions(): void {
    for (const field of this.fields) {
      if (field.type === 'ref' && field.ref && !this.options.has(field.key)) {
        this.options.set(field.key, []);
        this.meta.options(field.ref).subscribe({
          next: (options) => {
            this.options.set(field.key, options);
            this.cdr.markForCheck();
          },
          error: () => this.cdr.markForCheck(),
        });
      }
      if (field.type === 'rows') {
        for (const col of field.cols ?? []) {
          if (col.type === 'ref' && col.ref) {
            const key = `${field.key}.${col.key}`;
            if (!this.options.has(key)) {
              this.options.set(key, []);
              this.meta.options(col.ref).subscribe({
                next: (options) => {
                  this.options.set(key, options);
                  this.cdr.markForCheck();
                },
                error: () => this.cdr.markForCheck(),
              });
            }
          }
        }
      }
    }
  }
}
