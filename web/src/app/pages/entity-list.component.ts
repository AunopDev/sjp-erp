import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { MetaService } from '../core/meta.service';
import { displayValue, fmtDate, fmtDateTime } from '../core/util';
import type { ColumnDef, FilterDef } from '../shared/data-table.component';
import { DataTableComponent } from '../shared/data-table.component';
import { RecordFormComponent } from '../shared/record-form.component';
import { StateComponent } from '../shared/state.component';
import { ToastService } from '../shared/toast.service';
import type { EntityDef, FieldDef, ListResponse, RecordRow } from '../core/models';

@Component({
  selector: 'app-entity-list',
  standalone: true,
  imports: [DataTableComponent, RecordFormComponent, StateComponent],
  template: `
    @if (def(); as entity) {
      <div class="page">
        <div class="page-head">
          <div><h1>{{ entity.label }}</h1><div class="muted">{{ rows().length }} รายการ</div></div>
          <div class="page-actions">
            @if (auth.can(entity.resource, 'create')) {
              <button type="button" class="btn primary" (click)="formOpen.set(true)">+ เพิ่ม{{ entity.label }}</button>
            }
          </div>
        </div>
        <app-data-table
          [columns]="columns()"
          [rows]="rows()"
          [filters]="filters()"
          [exportName]="entity.key"
          [canExport]="auth.can(entity.resource, 'export')"
          [emptyText]="'ยังไม่มี' + entity.label"
          [emptyActionLabel]="auth.can(entity.resource, 'create') ? '+ เพิ่มรายการแรก' : ''"
          [rowClass]="rowClass"
          (rowClick)="open($event)"
          (emptyAction)="formOpen.set(true)"
        />
      </div>
      @if (formOpen()) {
        <app-record-form
          [entity]="entity.key"
          [entityLabel]="entity.label"
          [fields]="entity.fields"
          [lists]="lists()"
          [defaults]="defaultsFor(entity.key)"
          (saved)="onSaved($event)"
          (closed)="formOpen.set(false)"
        />
      }
    } @else if (meta.loading()) {
      <app-state kind="loading" message="กำลังโหลดข้อมูล…" />
    } @else {
      <app-state kind="error" message="ไม่พบชนิดข้อมูลนี้" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntityListComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly meta = inject(MetaService);
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly rows = signal<RecordRow[]>([]);
  readonly formOpen = signal(false);
  readonly filters = signal<FilterDef[]>([]);
  readonly def = computed(() => this.meta.entity(this.route.snapshot.paramMap.get('entity') ?? ''));
  readonly lists = computed(() => this.meta.lists());
  readonly fmtDate = fmtDate;
  readonly fmtDateTime = fmtDateTime;
  readonly rowClass = () => '';

  constructor() {
    effect(() => {
      if (this.meta.meta()) {
        this.load();
        this.buildFilters();
      }
    });
  }

  ngOnInit(): void {
    this.meta.load();
  }

  load(): void {
    const entity = this.def();
    if (!entity) return;
    this.api.get<ListResponse<RecordRow>>(`/records/${entity.key}`, { pageSize: 500 }).subscribe({
      next: (result) => this.rows.set(result.items),
      error: (error: unknown) => this.toast.error(apiErrorMessage(error)),
    });
  }

  open(row: Record<string, unknown>): void {
    const entity = this.def();
    if (entity) void this.router.navigate(['/entities', entity.key, String(row['id'])]);
  }

  onSaved(record: RecordRow): void {
    this.load();
    const entity = this.def();
    if (entity && record?.id) void this.router.navigate(['/entities', entity.key, record.id]);
  }

  defaultsFor(entity: string): Record<string, unknown> {
    return entity === 'serials' ? { status: 'ในคลัง' } : {};
  }

  columns(): ColumnDef[] {
    const entity = this.def();
    if (!entity) return [];
    const fields = new Map(entity.fields.map((field) => [field.key, field]));
    const columns: ColumnDef[] = [];
    for (const key of entity.cols) {
      if (key === 'code') {
        columns.push({ key: 'code', label: 'รหัส' });
        continue;
      }
      if (key === 'stepLabel') {
        columns.push({ key: 'stepLabel', label: 'ขั้นตอนปัจจุบัน', value: (row) => this.projectStep(row) });
        continue;
      }
      if (key === 'status' && !fields.has('status') && this.meta.workflowFor(entity).length) {
        columns.push({ key: 'status', label: 'สถานะ', value: (row) => this.statusLabel(entity, row['status']), badge: (row) => this.statusColor(entity, row['status']) });
        continue;
      }
      const field = fields.get(key);
      if (!field || field.hidden) continue;
      columns.push(this.columnFor(field, entity));
    }
    if (entity.key === 'serials') {
      columns.push({ key: 'warranty', label: 'ประกัน', value: (row) => this.warranty(row), badge: (row) => this.warrantyColor(row) });
    }
    if (!columns.some((column) => column.key === 'status') && !fields.has('status') && this.meta.workflowFor(entity).length) {
      columns.push({ key: 'status', label: 'สถานะ', value: (row) => this.statusLabel(entity, row['status']), badge: (row) => this.statusColor(entity, row['status']) });
    }
    return columns;
  }

  private columnFor(field: FieldDef, entity: EntityDef): ColumnDef {
    if (field.key === 'status' && this.meta.workflowFor(entity).length) {
      return {
        key: field.key,
        label: field.label,
        value: (row) => this.statusLabel(entity, row[field.key]),
        badge: (row) => this.statusColor(entity, row[field.key]),
      };
    }
    return {
      key: field.key,
      label: field.label,
      value: (row) => {
        const value = row[field.key];
        if (field.type === 'ref') return row._labels?.[field.key] ?? '–';
        if (field.type === 'boolean') return value ? 'ใช่' : 'ไม่';
        if (field.type === 'date') return fmtDate(value);
        if (field.type === 'datetime') return fmtDateTime(value);
        if (field.type === 'number') return this.number(value);
        if (field.type === 'rows') return Array.isArray(value) ? `${value.length} แถว` : '–';
        if (field.type === 'file') return Array.isArray(value) ? (value as { name: string }[]).map((f) => f.name).join(', ') : '–';
        return displayValue(value);
      },
    };
  }

  private number(value: unknown): string {
    const n = Number(value);
    if (!Number.isFinite(n)) return '–';
    return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(n);
  }

  private buildFilters(): void {
    const entity = this.def();
    if (!entity) return;
    const fields = new Map(entity.fields.map((field) => [field.key, field]));
    const out: FilterDef[] = [];
    const apply = () => this.filters.set([...out]);
    for (const key of entity.filters) {
      const field = fields.get(key);
      if (!field) {
        if (key === 'status') {
          const statuses = this.meta.workflowFor(entity);
          out.push({ key, label: 'สถานะ', options: statuses.map((s) => [s.key, s.label]), get: (row) => row[key] });
          apply();
        }
        continue;
      }
      if (field.type === 'select' || field.type === 'boolean') {
        const options =
          field.type === 'boolean'
            ? [['true', 'ใช่'], ['false', 'ไม่']] as [string, string][]
            : field.optionsFrom === 'teams'
              ? this.lists().teams.map((o) => [o, o] as [string, string])
              : field.optionsFrom === 'depts'
                ? this.lists().depts.map((o) => [o, o] as [string, string])
                : (field.options ?? []).map((o) => [o, o] as [string, string]);
        out.push({
          key,
          label: field.label,
          options,
          get: (row) => (field.type === 'boolean' ? String(!!row[key]) : row[key]),
        });
        apply();
      } else if (field.type === 'ref' && field.ref) {
        const filter: FilterDef = { key, label: field.label, options: [], get: (row) => row[key] };
        out.push(filter);
        apply();
        this.meta.options(field.ref).subscribe((options) => {
          filter.options = options.map((o) => [o.value, o.label]);
          apply();
        });
      }
    }
    this.filters.set(out);
  }

  private statusLabel(entity: EntityDef, value: unknown): string {
    return this.meta.workflowFor(entity).find((s) => s.key === value)?.label ?? displayValue(value);
  }

  private statusColor(entity: EntityDef, value: unknown): string {
    return this.meta.workflowFor(entity).find((s) => s.key === value)?.color ?? 'gray';
  }

  private projectStep(row: Record<string, unknown>): string {
    const steps = (row['steps'] as Record<string, { status?: string }> | undefined) ?? {};
    const next = this.meta.projectSteps().find((step) => step.enabled && !['done', 'skipped'].includes(steps[step.key]?.status ?? 'pending'));
    return next?.label ?? 'ครบทุกขั้นตอน';
  }

  private warranty(row: Record<string, unknown>): string {
    const end = row['warrantyEnd'] ? new Date(`${String(row['warrantyEnd'])}T00:00:00`) : null;
    if (!end) return 'ไม่ระบุ';
    const days = Math.ceil((end.getTime() - Date.now()) / 86400000);
    return days < 0 ? 'หมดประกัน' : days <= 30 ? `ใกล้หมด (${days} วัน)` : 'อยู่ในประกัน';
  }

  private warrantyColor(row: Record<string, unknown>): string {
    const text = this.warranty(row);
    return text === 'หมดประกัน' ? 'red' : text.startsWith('ใกล้') ? 'amber' : text === 'ไม่ระบุ' ? 'gray' : 'green';
  }
}
