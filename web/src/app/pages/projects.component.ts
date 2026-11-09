import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { MetaService } from '../core/meta.service';
import { fmtDate } from '../core/util';
import type { ColumnDef, TabDef } from '../shared/data-table.component';
import { DataTableComponent } from '../shared/data-table.component';
import { RecordFormComponent } from '../shared/record-form.component';
import { ToastService } from '../shared/toast.service';
import type { ListResponse, ProjectStepDef, RecordRow } from '../core/models';

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [DataTableComponent, RecordFormComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>โครงการ</h1><div class="muted">โครงการภาครัฐและโครงการติดตั้งระบบ</div></div>
        <div class="page-actions">@if (auth.can('projects', 'create')) { <button type="button" class="btn primary" (click)="formOpen.set(true)">+ สร้างโครงการ</button> }</div>
      </div>
      <app-data-table
        [columns]="columns()"
        [rows]="rows()"
        [tabs]="tabs"
        [exportName]="'projects'"
        [canExport]="auth.can('projects', 'export')"
        [emptyText]="'ยังไม่มีโครงการ — กด “สร้างโครงการ”'"
        [emptyActionLabel]="auth.can('projects', 'create') ? '+ สร้างโครงการ' : ''"
        [rowClass]="rowClass"
        (rowClick)="open($event)"
        (emptyAction)="formOpen.set(true)"
      />
    </div>
    @if (formOpen()) {
      <app-record-form entity="projects" entityLabel="โครงการ" createUrl="/projects" [fields]="fields()" [lists]="meta.lists()" (saved)="saved($event)" (closed)="formOpen.set(false)" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly meta = inject(MetaService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly rows = signal<RecordRow[]>([]);
  readonly formOpen = signal(false);
  readonly fields = computed(() => this.meta.entity('projects')?.fields ?? []);
  readonly tabs: TabDef[] = [
    { key: 'active', label: 'ดำเนินการ', test: (row) => !row['closed'] },
    { key: 'closed', label: 'ปิดแล้ว', test: (row) => !!row['closed'] },
    { key: 'all', label: 'ทั้งหมด' },
  ];
  readonly rowClass = () => '';

  ngOnInit(): void {
    this.meta.load();
    this.load();
  }

  load(): void {
    this.api.get<ListResponse<RecordRow>>('/records/projects', { pageSize: 500, sort: '-_createdAt' }).subscribe({
      next: (result) => this.rows.set(result.items),
      error: (error: unknown) => this.toast.error(apiErrorMessage(error)),
    });
  }

  columns(): ColumnDef[] {
    return [
      { key: 'code', label: 'รหัส' },
      { key: 'name', label: 'ชื่อโครงการ', value: (row) => `${row['name']}\n${row._labels?.['customer'] ?? ''}` },
      { key: 'customer', label: 'ลูกค้า', value: (row) => row._labels?.['customer'] ?? '–' },
      { key: 'type', label: 'ประเภท' },
      { key: 'manager', label: 'ผู้จัดการ', value: (row) => row._labels?.['manager'] ?? '–' },
      { key: 'step', label: 'ขั้นตอนปัจจุบัน', value: (row) => this.stepLabel(row), badge: (row) => (row['closed'] ? 'red' : 'blue') },
      { key: 'progress', label: 'ความคืบหน้า', value: (row) => `${this.done(row)}/${this.steps().length} ขั้นตอน` },
    ];
  }

  steps(): ProjectStepDef[] {
    return this.meta.projectSteps().filter((step) => step.enabled);
  }

  private done(row: Record<string, any>): number {
    const steps = (row['steps'] as Record<string, { status?: string }> | undefined) ?? {};
    return this.steps().filter((step) => ['done', 'skipped'].includes(steps[step.key]?.status ?? 'pending')).length;
  }

  private stepLabel(row: Record<string, any>): string {
    if (row['closed']) return `ปิดโครงการ: ${row['closeReason'] ?? ''}`;
    const steps = (row['steps'] as Record<string, { status?: string }> | undefined) ?? {};
    return this.steps().find((step) => !['done', 'skipped'].includes(steps[step.key]?.status ?? 'pending'))?.label ?? 'ครบทุกขั้นตอน';
  }

  open(row: Record<string, unknown>): void {
    void this.router.navigate(['/projects', String(row['id'])]);
  }

  saved(record: RecordRow): void {
    void this.router.navigate(['/projects', record.id]);
  }
}
