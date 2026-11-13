import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { MetaService } from '../core/meta.service';
import { fmtDateTime, fmtDuration } from '../core/util';
import { IconComponent } from '../shared/icon.component';
import type { DashboardData, WorkspaceWidgetDef } from '../core/dashboard.models';

interface Shortcut {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-workspace-widget',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    @switch (widget().key) {
      @case ('kpi') {
        <section class="dash-kpis" aria-label="ตัวชี้วัดสำคัญ">
          @if (auth.can('tickets', 'view') || auth.can('pm', 'view') || auth.can('projects', 'view')) {
            <a class="dash-kpi" routerLink="/my">
              <span class="dash-kpi-label"><app-icon name="check" [size]="13" /> งานของฉัน</span>
              <span class="dash-kpi-value">{{ data().tickets.mine }}</span>
              <span class="dash-kpi-meta">เคสที่มอบหมายให้คุณ</span>
            </a>
          }
          @if (auth.can('tickets', 'view') || auth.can('purchase', 'view') || auth.can('accounting', 'view')) {
            <a class="dash-kpi" [class.alert]="data().pendingApprovals > 0" routerLink="/approvals">
              <span class="dash-kpi-label"><app-icon name="bell" [size]="13" /> รออนุมัติ</span>
              <span class="dash-kpi-value">{{ data().pendingApprovals }}</span>
              <span class="dash-kpi-meta">คำขอที่ยังไม่ตัดสินใจ</span>
            </a>
          }
          @if (auth.can('tickets', 'view')) {
            <a class="dash-kpi" [class.alert]="data().tickets.urgent > 0" routerLink="/tickets">
              <span class="dash-kpi-label"><app-icon name="ticket" [size]="13" /> เคสค้าง</span>
              <span class="dash-kpi-value">{{ data().tickets.open }}</span>
              <span class="dash-kpi-meta">{{ data().tickets.urgent ? data().tickets.urgent + ' เคสสูง/เร่งด่วน' : 'ไม่มีเคสเร่งด่วน' }}</span>
            </a>
          }
          @if (auth.can('pm', 'view')) {
            <a class="dash-kpi" [class.alert]="data().pm.overdue > 0" routerLink="/pm">
              <span class="dash-kpi-label"><app-icon name="wrench" [size]="13" /> PM เกินกำหนด</span>
              <span class="dash-kpi-value">{{ data().pm.overdue }}</span>
              <span class="dash-kpi-meta">แผนงานในสัปดาห์นี้ {{ data().pm.week }}</span>
            </a>
          }
          @if (auth.can('warehouse', 'view')) {
            <a class="dash-kpi" [class.alert]="data().stock.low > 0" routerLink="/warehouse">
              <span class="dash-kpi-label"><app-icon name="box" [size]="13" /> สินค้าต่ำ</span>
              <span class="dash-kpi-value">{{ data().stock.low }}</span>
              <span class="dash-kpi-meta">{{ stockMeta() }}</span>
            </a>
          }
          @if (auth.can('assets', 'view')) {
            <a class="dash-kpi" routerLink="/entities/serials">
              <span class="dash-kpi-label"><app-icon name="tag" [size]="13" /> ใกล้หมดประกัน</span>
              <span class="dash-kpi-value">{{ data().warranty }}</span>
              <span class="dash-kpi-meta">อุปกรณ์ภายใน 30 วัน</span>
            </a>
          }
        </section>
      }

      @case ('queue') {
        <section class="panel">
          <div class="panel-head">
            <h2>คิวงานที่ต้องจัดการ</h2>
            <span class="badge gray">{{ data().oldest.length }}</span>
            <a class="link" routerLink="/tickets">ดูทั้งหมด</a>
          </div>
          <div class="panel-body">
            @if (!data().oldest.length) {
              <div class="panel-empty">ไม่มีเคสค้าง — เยี่ยมมาก</div>
            } @else {
              @for (ticket of data().oldest.slice(0, 7); track ticket.id) {
                <a class="queue-row" [routerLink]="['/tickets', ticket.id]">
                  <span class="queue-code">{{ ticket.code }}</span>
                  <span class="queue-main">
                    <b>{{ ticket['title'] }}</b>
                    <span>{{ ticket._labels?.['site'] }} · {{ ticket._labels?.['assignee'] || 'ยังไม่มอบหมาย' }}</span>
                  </span>
                  <span class="queue-age">{{ fmtDuration(ticket.ageH) }}</span>
                </a>
              }
            }
          </div>
        </section>
      }

      @case ('activity') {
        <section class="panel">
          <div class="panel-head">
            <h2>ความเคลื่อนไหวล่าสุด</h2>
            @if (auth.can('settings', 'view')) { <a class="link" routerLink="/settings">ทั้งหมด</a> }
          </div>
          <div class="panel-body">
            @if (!data().activity.length) {
              <div class="panel-empty">ยังไม่มีความเคลื่อนไหว</div>
            } @else {
              @for (entry of data().activity.slice(0, 6); track entry.id) {
                <div class="activity-row">
                  <span class="act-avatar">{{ entry.userName.charAt(0) }}</span>
                  <span class="act-main">{{ entry.summary }}<span>{{ entry.userName }}</span></span>
                  <span class="act-time">{{ fmtDateTime(entry.at) }}</span>
                </div>
              }
            }
          </div>
        </section>
      }

      @case ('finance') {
        @if (auth.can('accounting', 'view') && data().finance; as fin) {
          <section class="panel finance-panel">
            <div class="panel-head">
              <h2>ภาพรวมการเงิน</h2>
              <a class="link" routerLink="/entities/invoices">ดูใบแจ้งหนี้ทั้งหมด</a>
            </div>
            <div class="finance-strip">
              <a class="fin-item" routerLink="/entities/invoices">
                <div class="fin-label">ยอดค้างชำระ</div>
                <div class="fin-value">{{ money(fin.invoices.outstanding) }}</div>
                <div class="fin-meta">{{ fin.invoices.open }} ใบ · ครบใน 7 วัน {{ fin.invoices.dueSoon }} ใบ</div>
              </a>
              <a class="fin-item" routerLink="/entities/invoices">
                <div class="fin-label">ใบแจ้งหนี้เกินกำหนด</div>
                <div class="fin-value" [class.alert]="fin.invoices.overdue > 0">{{ fin.invoices.overdue }}</div>
                <div class="fin-meta">รวม {{ money(fin.invoices.overdueAmount) }}</div>
              </a>
              <a class="fin-item" routerLink="/entities/receipts">
                <div class="fin-label">รับชำระเดือนนี้</div>
                <div class="fin-value">{{ money(fin.receipts.month) }}</div>
                <div class="fin-meta">{{ fin.receipts.count }} รายการ</div>
              </a>
              <a class="fin-item" routerLink="/entities/expenses">
                <div class="fin-label">ค่าใช้จ่ายเดือนนี้</div>
                <div class="fin-value">{{ money(fin.expenses.month) }}</div>
                <div class="fin-meta">รออนุมัติ {{ fin.expenses.pending }} รายการ</div>
              </a>
            </div>
          </section>
        }
      }

      @case ('status') {
        <section class="panel">
          <div class="panel-head"><h2>เคสตามสถานะ</h2></div>
          <div class="panel-body">
            @if (!data().byStatus.length) {
              <div class="panel-empty">ไม่มีเคสค้าง</div>
            } @else {
              @for (row of data().byStatus; track row.key) {
                <div class="bar-row">
                  <span class="bar-label">{{ row.label }}</span>
                  <span class="bar-track"><span class="bar-fill" [style.width.%]="barWidth(row.count, maxStatus())"></span></span>
                  <span class="bar-count">{{ row.count }}</span>
                </div>
              }
            }
          </div>
        </section>
      }

      @case ('team') {
        <section class="panel">
          <div class="panel-head"><h2>เคสตามทีม</h2></div>
          <div class="panel-body">
            @if (!data().byTeam.length) {
              <div class="panel-empty">ไม่มีเคสค้าง</div>
            } @else {
              @for (row of data().byTeam; track row.label) {
                <div class="bar-row">
                  <span class="bar-label">{{ row.label }}</span>
                  <span class="bar-track"><span class="bar-fill" [style.width.%]="barWidth(row.count, maxTeam())"></span></span>
                  <span class="bar-count">{{ row.count }}</span>
                </div>
              }
            }
          </div>
        </section>
      }

      @case ('assignee') {
        <section class="panel">
          <div class="panel-head"><h2>เคสตามผู้รับผิดชอบ</h2></div>
          <div class="panel-body">
            @if (!data().byAssignee.length) {
              <div class="panel-empty">ไม่มีเคสค้าง</div>
            } @else {
              @for (row of data().byAssignee; track row.id) {
                <div class="bar-row">
                  <span class="bar-label">{{ row.label }}</span>
                  <span class="bar-track"><span class="bar-fill" [style.width.%]="barWidth(row.count, maxAssignee())"></span></span>
                  <span class="bar-count">{{ row.count }}</span>
                </div>
              }
            }
          </div>
        </section>
      }

      @case ('project-steps') {
        <section class="panel">
          <div class="panel-head">
            <h2>โครงการตามขั้นตอน</h2>
            <a class="link" routerLink="/projects">ดูทั้งหมด</a>
          </div>
          <div class="panel-body">
            @if (!projectSteps().length) {
              <div class="panel-empty">ไม่มีโครงการที่ดำเนินการ</div>
            } @else {
              @for (row of projectSteps(); track row[0]) {
                <div class="bar-row">
                  <span class="bar-label">{{ row[0] }}</span>
                  <span class="bar-track"><span class="bar-fill" [style.width.%]="barWidth(row[1], maxStep())"></span></span>
                  <span class="bar-count">{{ row[1] }}</span>
                </div>
              }
            }
          </div>
        </section>
      }

      @case ('my-work') {
        <section class="panel">
          <div class="panel-head">
            <h2>งานของฉัน</h2>
            <a class="link" routerLink="/my">ดูทั้งหมด</a>
          </div>
          <div class="panel-body ws-mywork">
            @if (data().myTickets.length) {
              <div class="ws-mywork-title"><app-icon name="ticket" [size]="14" /> Ticket</div>
              @for (row of data().myTickets.slice(0, 4); track row.id) {
                <a class="ws-mini-row" [routerLink]="['/tickets', row.id]">
                  <span class="ws-mini-code">{{ row['code'] }}</span>
                  <span class="ws-mini-title">{{ row['title'] }}</span>
                  <span class="badge gray">{{ ticketStatus(row['status']) }}</span>
                </a>
              }
            }
            @if (data().myPm.length) {
              <div class="ws-mywork-title"><app-icon name="wrench" [size]="14" /> PM</div>
              @for (row of data().myPm.slice(0, 4); track row.id) {
                <a class="ws-mini-row" [routerLink]="['/pm/records', row.id]">
                  <span class="ws-mini-code">{{ row['code'] }}</span>
                  <span class="ws-mini-title">{{ row['planLabel'] || row['templateName'] || row['code'] }}</span>
                  <span class="badge gray">{{ row['status'] }}</span>
                </a>
              }
            }
            @if (data().myProjects.length) {
              <div class="ws-mywork-title"><app-icon name="folder" [size]="14" /> โครงการ</div>
              @for (row of data().myProjects.slice(0, 4); track row.id) {
                <a class="ws-mini-row" [routerLink]="['/projects', row.id]">
                  <span class="ws-mini-code">{{ row['code'] }}</span>
                  <span class="ws-mini-title">{{ row['name'] }}</span>
                  <span class="badge gray">{{ row['stepLabel'] || (row['closed'] ? 'ปิดแล้ว' : 'ดำเนินการ') }}</span>
                </a>
              }
            }
            @if (!data().myTickets.length && !data().myPm.length && !data().myProjects.length) {
              <div class="panel-empty">ยังไม่มีงานที่มอบหมายให้คุณ</div>
            }
          </div>
        </section>
      }

      @case ('approvals') {
        <section class="panel">
          <div class="panel-head">
            <h2>คำขออนุมัติ</h2>
            <a class="link" routerLink="/approvals">เปิดรายการ</a>
          </div>
          <div class="panel-body ws-approval-body">
            <span class="ws-big" [class.alert]="data().pendingApprovals > 0">{{ data().pendingApprovals }}</span>
            <span class="muted small">รายการรอตัดสินใจ</span>
          </div>
        </section>
      }

      @case ('pm') {
        <section class="panel">
          <div class="panel-head">
            <h2>งาน PM</h2>
            <a class="link" routerLink="/pm">ดูแผนงาน</a>
          </div>
          <div class="panel-body ws-metrics">
            <div class="ws-metric">
              <span class="ws-big" [class.alert]="data().pm.overdue > 0">{{ data().pm.overdue }}</span>
              <span class="muted small">เกินกำหนด</span>
            </div>
            <div class="ws-metric">
              <span class="ws-big">{{ data().pm.week }}</span>
              <span class="muted small">ในสัปดาห์นี้</span>
            </div>
            @for (row of data().myPm.slice(0, 3); track row.id) {
              <a class="ws-mini-row" [routerLink]="['/pm/records', row.id]">
                <span class="ws-mini-code">{{ row['code'] }}</span>
                <span class="ws-mini-title">{{ row['planLabel'] || row['templateName'] || row['code'] }}</span>
                <span class="badge gray">{{ row['status'] }}</span>
              </a>
            }
          </div>
        </section>
      }

      @case ('shortcuts') {
        <section class="panel">
          <div class="panel-head"><h2>ทางลัด</h2></div>
          <div class="panel-body ws-shortcuts">
            @for (link of shortcuts(); track link.path) {
              <a class="ws-shortcut" [routerLink]="link.path">
                <app-icon [name]="link.icon" [size]="16" />
                <span>{{ link.label }}</span>
              </a>
            }
          </div>
        </section>
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceWidgetComponent {
  readonly auth = inject(AuthService);
  private readonly meta = inject(MetaService);

  readonly widget = input.required<WorkspaceWidgetDef>();
  readonly data = input.required<DashboardData>();

  readonly fmtDuration = fmtDuration;
  readonly fmtDateTime = fmtDateTime;

  readonly stockMeta = computed(() => {
    const stock = this.data().stock;
    if (!stock.names.length) return 'สต็อกอยู่ในระดับปกติ';
    const joined = stock.names.join(', ');
    return joined.length > 42 ? `สินค้าต่ำ ${stock.low} รายการ` : joined;
  });

  readonly shortcuts = computed<Shortcut[]>(() => {
    const links: Shortcut[] = [];
    if (this.auth.can('tickets', 'create')) links.push({ path: '/tickets/new', label: 'เปิดเคสใหม่', icon: 'ticket' });
    if (this.auth.can('purchase', 'create')) links.push({ path: '/purchase-orders', label: 'ใบสั่งซื้อ', icon: 'receipt' });
    if (this.auth.can('projects', 'create')) links.push({ path: '/projects', label: 'โครงการ', icon: 'folder' });
    if (this.auth.can('vehicleBookings', 'create')) links.push({ path: '/vehicles', label: 'จองรถ', icon: 'calendar' });
    if (this.auth.can('warehouse', 'view')) links.push({ path: '/warehouse', label: 'คลังสินค้า', icon: 'box' });
    if (this.auth.can('pm', 'view')) links.push({ path: '/pm', label: 'งาน PM', icon: 'wrench' });
    if (this.auth.can('reports', 'view')) links.push({ path: '/reports', label: 'รายงาน', icon: 'chart' });
    links.push({ path: '/calendar', label: 'ปฏิทิน', icon: 'calendar' });
    links.push({ path: '/approvals', label: 'คำขออนุมัติ', icon: 'bell' });
    return links;
  });

  money(value: unknown): string {
    const number = Number(value);
    return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(Number.isFinite(number) ? number : 0);
  }

  ticketStatus(value: unknown): string {
    return this.meta.ticketWorkflow().find((status) => status.key === value)?.label ?? String(value ?? '–');
  }

  projectSteps(): [string, number][] {
    return Object.entries(this.data().projects.byStep ?? {}).sort((a, b) => b[1] - a[1]);
  }

  maxStatus(): number {
    return Math.max(1, ...this.data().byStatus.map((row) => row.count));
  }

  maxTeam(): number {
    return Math.max(1, ...this.data().byTeam.map((row) => row.count));
  }

  maxAssignee(): number {
    return Math.max(1, ...this.data().byAssignee.map((row) => row.count));
  }

  maxStep(): number {
    return Math.max(1, ...this.projectSteps().map((row) => row[1]));
  }

  barWidth(value: number, max: number): number {
    return Math.min(100, (value / Math.max(1, max)) * 100);
  }
}


