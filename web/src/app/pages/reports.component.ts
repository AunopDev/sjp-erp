import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { fmtDate, fmtDuration, fmtMoney } from '../core/util';
import type { ColumnDef } from '../shared/data-table.component';
import { DataTableComponent } from '../shared/data-table.component';
import { ToastService } from '../shared/toast.service';
import type { RecordRow } from '../core/models';

type ReportName = 'tickets' | 'projects' | 'serials' | 'stock' | 'boq';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [DataTableComponent],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>รายงานและส่งออกข้อมูล</h1><div class="muted">ทุกแถวเปิดย้อนไปยังเอกสารต้นทางได้ · ส่งออกเป็น CSV (เปิดใน Excel ได้)</div></div></div>
      <div class="tabs">
        @for (tab of tabs; track tab[0]) { <button type="button" [class.active]="active() === tab[0]" (click)="select(tab[0])">{{ tab[1] }}</button> }
      </div>
      @if (loading()) { <div class="state"><div class="spinner"></div>กำลังโหลดรายงาน…</div> }
      @else {
        <app-data-table [columns]="columns()" [rows]="rows()" [exportName]="active()" [canExport]="auth.can('reports','export')" (rowClick)="open($event)" />
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly active = signal<ReportName>('tickets');
  readonly rows = signal<RecordRow[]>([]);
  readonly loading = signal(false);
  readonly tabs: [ReportName, string][] = [
    ['tickets', 'Ticket ทั้งหมด'],
    ['projects', 'โครงการ'],
    ['boq', 'BOQ เทียบจริง'],
    ['serials', 'Serial/รับประกัน'],
    ['stock', 'ยอดสต็อก'],
  ];
  readonly fmtDate = fmtDate;
  readonly fmtDuration = fmtDuration;
  readonly fmtMoney = fmtMoney;

  ngOnInit(): void {
    this.load();
  }

  select(name: ReportName): void {
    this.active.set(name);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.get<RecordRow[]>(`/reports/${this.active()}`).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.toast.error(apiErrorMessage(error));
      },
    });
  }

  columns(): ColumnDef[] {
    switch (this.active()) {
      case 'tickets':
        return [
          { key: 'code', label: 'เลขที่' },
          { key: 'title', label: 'หัวข้อ' },
          { key: 'customer', label: 'ลูกค้า', value: (row) => row._labels?.['customer'] ?? '–' },
          { key: 'site', label: 'ไซต์', value: (row) => row._labels?.['site'] ?? '–' },
          { key: 'statusLabel', label: 'สถานะ' },
          { key: 'team', label: 'ทีม' },
          { key: 'assignee', label: 'ผู้รับผิดชอบ', value: (row) => row._labels?.['assignee'] ?? '–' },
          { key: 'responseH', label: 'ตอบสนอง', value: (row) => fmtDuration(row['responseH'] as number) },
          { key: 'ageH', label: 'อายุเคส/ใช้เวลา', value: (row) => fmtDuration(row['ageH'] as number) },
        ];
      case 'projects':
        return [
          { key: 'code', label: 'รหัส' }, { key: 'name', label: 'โครงการ' },
          { key: 'customer', label: 'ลูกค้า', value: (row) => row._labels?.['customer'] ?? '–' },
          { key: 'manager', label: 'ผู้จัดการ', value: (row) => row._labels?.['manager'] ?? '–' },
          { key: 'stepLabel', label: 'ขั้นตอนปัจจุบัน/สถานะ' },
          { key: 'done', label: 'ขั้นตอนที่เสร็จ' },
          { key: 'value', label: 'มูลค่า', value: (row) => fmtMoney(row['value']) },
        ];
      case 'boq':
        return [
          { key: 'projectCode', label: 'โครงการ' },
          { key: 'itemLabel', label: 'สินค้า' },
          { key: 'qty', label: 'ต้องใช้' }, { key: 'ordered', label: 'สั่งซื้อ' }, { key: 'received', label: 'รับเข้า' }, { key: 'issued', label: 'เบิกไปหน้างาน' }, { key: 'installed', label: 'ติดตั้งแล้ว' },
        ];
      case 'serials':
        return [
          { key: 'serialNo', label: 'Serial' },
          { key: 'item', label: 'สินค้า', value: (row) => row._labels?.['item'] ?? '–' },
          { key: 'status', label: 'สถานะ' },
          { key: 'site', label: 'ไซต์', value: (row) => row._labels?.['site'] ?? '–' },
          { key: 'location', label: 'จุดติดตั้ง' },
          { key: 'installedDate', label: 'ติดตั้ง', value: (row) => fmtDate(row['installedDate']) },
          { key: 'warrantyEnd', label: 'รับประกันถึง', value: (row) => fmtDate(row['warrantyEnd']) },
          { key: 'warranty', label: 'สถานะประกัน', badge: (row) => row['warranty'] === 'หมดประกัน' ? 'red' : row['warranty'] === 'ใกล้หมด' ? 'amber' : 'green' },
        ];
      default:
        return [
          { key: 'sku', label: 'SKU' }, { key: 'name', label: 'สินค้า' },
          { key: 'total', label: 'คงเหลือรวม' },
          { key: 'minStock', label: 'ขั้นต่ำ' },
        ];
    }
  }

  open(row: Record<string, unknown>): void {
    if (this.active() === 'tickets') void this.router.navigate(['/tickets', String(row['id'])]);
    if (this.active() === 'projects') void this.router.navigate(['/projects', String(row['id'])]);
    if (this.active() === 'serials') void this.router.navigate(['/entities/serials', String(row['id'])]);
    if (this.active() === 'boq' && row['projectId']) void this.router.navigate(['/projects', String(row['projectId'])]);
  }
}
