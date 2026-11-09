import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { fmtDateTime, fmtDuration } from '../core/util';
import { IconComponent } from '../shared/icon.component';
import { StateComponent } from '../shared/state.component';
import { ToastService } from '../shared/toast.service';
import type { RecordRow } from '../core/models';

interface DashboardData {
  tickets: { open: number; urgent: number; mine: number };
  projects: { active: number; closed: number; byStep: Record<string, number> };
  pm: { overdue: number; week: number };
  stock: { low: number; names: string[] };
  warranty: number;
  pendingApprovals: number;
  finance: {
    invoices: { open: number; outstanding: number; overdue: number; overdueAmount: number; dueSoon: number };
    receipts: { count: number; month: number };
    expenses: { month: number; pending: number; pendingAmount: number };
  } | null;
  oldest: (RecordRow & { ageH: number })[];
  myTickets: RecordRow[];
  myPm: RecordRow[];
  myProjects: RecordRow[];
  byStatus: { key: string; label: string; count: number }[];
  byTeam: { label: string; count: number }[];
  byAssignee: { id: string; label: string; count: number }[];
  activity: { id: string; at: string; userName: string; action: string; summary: string }[];
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, IconComponent, StateComponent],
  template: `
    <div class="page">
      <div class="page-head dashboard-head">
        <div class="dash-copy">
          <span class="eyebrow">ศูนย์ปฏิบัติการ · {{ todayText }}</span>
          <h1>{{ greeting }}, {{ firstName }}</h1>
          <div class="muted">ภาพรวมงานที่ต้องดูแลวันนี้ และทางลัดไปยังงานด่วน</div>
          <div class="dash-actions">
            <a class="btn primary" routerLink="/tickets/new"><app-icon name="plus" [size]="16" /> แจ้งซ่อม</a>
            <a class="btn" routerLink="/projects"><app-icon name="folder" [size]="16" /> โครงการ</a>
            <a class="btn" routerLink="/my"><app-icon name="check" [size]="16" /> งานของฉัน</a>
          </div>
        </div>
        <div class="dash-mini">
          <a routerLink="/my" class="dash-mini-item"><span class="dm-n">{{ data()?.tickets?.mine ?? 0 }}</span><span class="dm-l">งานของฉัน</span><span class="dm-s">เคสที่มอบหมาย</span></a>
          <a routerLink="/approvals" class="dash-mini-item"><span class="dm-n">{{ data()?.pendingApprovals ?? 0 }}</span><span class="dm-l">รออนุมัติ</span><span class="dm-s">คำขอค้าง</span></a>
          <a routerLink="/pm" class="dash-mini-item"><span class="dm-n">{{ data()?.pm?.overdue ?? 0 }}</span><span class="dm-l">PM เกินกำหนด</span><span class="dm-s">ต้องติดตาม</span></a>
        </div>
      </div>

      @if (loading()) {
        <app-state kind="loading" message="กำลังโหลดข้อมูล…" />
      } @else if (data()) {
        <div class="tiles">
          <a class="tile" routerLink="/tickets"><span class="tile-ic"><app-icon name="ticket" [size]="22" /></span><span class="tile-body"><span class="tile-n">{{ data()!.tickets.open }}</span><span class="tile-l">เคสค้าง</span><span class="tile-s">{{ data()!.tickets.urgent ? data()!.tickets.urgent + ' เคสสูง/เร่งด่วน' : 'ไม่มีเคสเร่งด่วน' }}</span></span></a>
          <a class="tile" routerLink="/projects"><span class="tile-ic"><app-icon name="folder" [size]="22" /></span><span class="tile-body"><span class="tile-n">{{ data()!.projects.active }}</span><span class="tile-l">โครงการที่ดำเนินการ</span><span class="tile-s">ปิดแล้ว {{ data()!.projects.closed }}</span></span></a>
          <a class="tile" routerLink="/warehouse"><span class="tile-ic"><app-icon name="box" [size]="22" /></span><span class="tile-body"><span class="tile-n">{{ data()!.stock.low }}</span><span class="tile-l">สินค้าต่ำกว่าขั้นต่ำ</span><span class="tile-s">{{ data()!.stock.names.join(', ') || 'สต็อกปกติ' }}</span></span></a>
          <a class="tile" routerLink="/entities/serials"><span class="tile-ic"><app-icon name="tag" [size]="22" /></span><span class="tile-body"><span class="tile-n">{{ data()!.warranty }}</span><span class="tile-l">ใกล้หมดประกัน (30 วัน)</span><span class="tile-s">อุปกรณ์ที่ติดตั้งแล้ว</span></span></a>
        </div>

        @if (data()!.finance; as fin) {
          <div class="finance-head">
            <h2>ภาพรวมการเงิน</h2>
            <span class="grow"></span>
            <a routerLink="/entities/invoices">ดูใบแจ้งหนี้ทั้งหมด</a>
          </div>
          <div class="tiles finance-tiles">
            <a class="tile" routerLink="/entities/invoices"><span class="tile-ic"><app-icon name="doc" [size]="22" /></span><span class="tile-body"><span class="tile-n">{{ money(fin.invoices.outstanding) }}</span><span class="tile-l">ยอดค้างชำระ</span><span class="tile-s">{{ fin.invoices.open }} ใบ · ครบใน 7 วัน {{ fin.invoices.dueSoon }} ใบ</span></span></a>
            <a class="tile" routerLink="/entities/invoices"><span class="tile-ic warn"><app-icon name="chart" [size]="22" /></span><span class="tile-body"><span class="tile-n">{{ fin.invoices.overdue }}</span><span class="tile-l">ใบแจ้งหนี้เกินกำหนด</span><span class="tile-s">รวม {{ money(fin.invoices.overdueAmount) }}</span></span></a>
            <a class="tile" routerLink="/entities/receipts"><span class="tile-ic ok"><app-icon name="receipt" [size]="22" /></span><span class="tile-body"><span class="tile-n">{{ money(fin.receipts.month) }}</span><span class="tile-l">รับชำระเดือนนี้</span><span class="tile-s">{{ fin.receipts.count }} รายการ</span></span></a>
            <a class="tile" routerLink="/entities/expenses"><span class="tile-ic"><app-icon name="chart" [size]="22" /></span><span class="tile-body"><span class="tile-n">{{ money(fin.expenses.month) }}</span><span class="tile-l">ค่าใช้จ่ายเดือนนี้</span><span class="tile-s">รออนุมัติ {{ fin.expenses.pending }} รายการ</span></span></a>
          </div>
        }

        <div class="grid c2">
          <div class="card">
            <div class="row"><h2 style="margin:0">เคสที่ค้างนานที่สุด</h2><span class="grow"></span><a routerLink="/tickets">ดูทั้งหมด</a></div>
            @if (!data()!.oldest.length) {
              <div class="state empty">ไม่มีเคสค้าง — เยี่ยมมาก</div>
            } @else {
              @for (ticket of data()!.oldest; track ticket.id) {
                <a class="list-row" [routerLink]="['/tickets', ticket.id]">
                  <span class="mono muted">{{ ticket.code }}</span>
                  <span class="lr-main"><b>{{ ticket['title'] }}</b><span class="sub">{{ ticket._labels?.['site'] }} · {{ ticket._labels?.['assignee'] || 'ยังไม่มอบหมาย' }}</span></span>
                  <span class="lr-age">{{ fmtDuration(ticket.ageH) }}</span>
                </a>
              }
            }
          </div>
          <div class="card">
            <div class="row"><h2 style="margin:0">ความเคลื่อนไหวล่าสุด</h2><span class="grow"></span>@if (auth.can('settings','view')) { <a routerLink="/settings">ประวัติทั้งหมด</a> }</div>
            @if (!data()!.activity.length) {
              <div class="state empty">ยังไม่มีความเคลื่อนไหว</div>
            } @else {
              @for (entry of data()!.activity; track entry.id) {
                <div class="list-row static">
                  <span class="avatar sm">{{ entry.userName.charAt(0) }}</span>
                  <span class="lr-main"><span>{{ entry.summary }}</span><span class="sub">{{ entry.userName }}</span></span>
                  <span class="lr-age muted">{{ fmtDateTime(entry.at) }}</span>
                </div>
              }
            }
          </div>
        </div>

        <div class="grid c2">
          <div class="card"><h2>สัดส่วนเคสค้างตามสถานะ</h2>
            @if (!data()!.byStatus.length) { <div class="state empty">ไม่มีเคสค้าง</div> }
            @else { @for (row of data()!.byStatus; track row.key) { <div class="hbar"><span>{{ row.label }}</span><div class="bar"><div [style.width.%]="barWidth(row.count, maxStatus())"></div></div><b>{{ row.count }}</b></div> } }
          </div>
          <div class="card"><h2>เคสค้างตามทีม</h2>
            @if (!data()!.byTeam.length) { <div class="state empty">ไม่มีเคสค้าง</div> }
            @else { @for (row of data()!.byTeam; track row.label) { <div class="hbar"><span>{{ row.label }}</span><div class="bar"><div [style.width.%]="barWidth(row.count, maxTeam())"></div></div><b>{{ row.count }}</b></div> } }
          </div>
          <div class="card"><h2>เคสค้างตามผู้รับผิดชอบ</h2>
            @if (!data()!.byAssignee.length) { <div class="state empty">ไม่มีเคสค้าง</div> }
            @else { @for (row of data()!.byAssignee; track row.id) { <div class="hbar"><span>{{ row.label }}</span><div class="bar"><div [style.width.%]="barWidth(row.count, maxAssignee())"></div></div><b>{{ row.count }}</b></div> } }
          </div>
          <div class="card"><h2>โครงการตามขั้นตอนปัจจุบัน</h2>
            @if (!projectSteps().length) { <div class="state empty">ไม่มีโครงการที่ดำเนินการ</div> }
            @else { @for (row of projectSteps(); track row[0]) { <div class="hbar"><span>{{ row[0] }}</span><div class="bar"><div [style.width.%]="barWidth(row[1], maxStep())"></div></div><b>{{ row[1] }}</b></div> } }
          </div>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly data = signal<DashboardData | null>(null);
  readonly fmtDuration = fmtDuration;
  readonly fmtDateTime = fmtDateTime;
  readonly Math = Math;

  money(value: unknown): string {
    const n = Number(value);
    return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);
  }

  get firstName(): string {
    return (this.auth.user()?.name ?? '').replace(/\s*\(.*\)/, '');
  }

  get greeting(): string {
    const h = new Date().getHours();
    return h < 12 ? 'สวัสดีตอนเช้า' : h < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';
  }

  get todayText(): string {
    return new Intl.DateTimeFormat('th-TH-u-ca-gregory', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  }

  ngOnInit(): void {
    this.api.get<DashboardData>('/dashboard').subscribe({
      next: (data) => {
        this.data.set(data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.toast.error(apiErrorMessage(error));
      },
    });
  }

  projectSteps(): [string, number][] {
    return Object.entries(this.data()?.projects.byStep ?? {}).sort((a, b) => b[1] - a[1]);
  }

  maxStatus(): number {
    return Math.max(1, ...(this.data()?.byStatus ?? []).map((row) => row.count));
  }

  maxTeam(): number {
    return Math.max(1, ...(this.data()?.byTeam ?? []).map((row) => row.count));
  }

  maxAssignee(): number {
    return Math.max(1, ...(this.data()?.byAssignee ?? []).map((row) => row.count));
  }

  maxStep(): number {
    return Math.max(1, ...this.projectSteps().map((row) => row[1]));
  }

  barWidth(value: number, max: number): number {
    return Math.min(100, (value / Math.max(1, max)) * 100);
  }
}
