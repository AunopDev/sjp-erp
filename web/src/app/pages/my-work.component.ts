import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { fmtDate, fmtDuration } from '../core/util';
import { ToastService } from '../shared/toast.service';
import type { RecordRow } from '../core/models';

@Component({
  selector: 'app-my-work',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>งานของฉัน</h1><div class="muted">{{ auth.user()?.name }}</div></div></div>
      @if (loading()) {
        <div class="state"><div class="spinner"></div>กำลังโหลดข้อมูล…</div>
      } @else if (data()) {
        <div class="card">
          <h2>Ticket ที่รับผิดชอบ ({{ data()!.myTickets.length }})</h2>
          @if (!data()!.myTickets.length) { <div class="state empty">ไม่มีเคสค้างที่มอบหมายให้คุณ</div> }
          @else {
            @for (ticket of data()!.myTickets; track ticket.id) {
              <div style="padding:4px 0"><a [routerLink]="['/tickets', ticket.id]">{{ ticket.code }}</a> {{ ticket['title'] }} <span class="badge gray">{{ ticket._labels?.['status'] || ticket['status'] }}</span> <span class="muted small">{{ fmtDuration(age(ticket)) }}</span></div>
            }
          }
        </div>
        <div class="grid c2">
          <div class="card"><h2>งาน PM ที่ต้องทำ ({{ data()!.myPm.length }})</h2>
            @if (!data()!.myPm.length) { <div class="state empty">ไม่มีงาน PM ค้าง</div> }
            @else { @for (row of data()!.myPm; track row.id) { <div style="padding:4px 0"><a [routerLink]="['/pm/records', row.id]">{{ row.code }}</a> {{ row._labels?.['site'] }} · กำหนด {{ fmtDate(row['dueDate']) }}</div> } }
          </div>
          <div class="card"><h2>โครงการที่ดูแล ({{ data()!.myProjects.length }})</h2>
            @if (!data()!.myProjects.length) { <div class="state empty">ไม่มีโครงการที่คุณเป็นผู้จัดการ</div> }
            @else { @for (project of data()!.myProjects; track project.id) { <div style="padding:4px 0"><a [routerLink]="['/projects', project.id]">{{ project.code }} {{ project['name'] }}</a></div> } }
          </div>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyWorkComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly loading = signal(true);
  readonly data = signal<{ myTickets: RecordRow[]; myPm: RecordRow[]; myProjects: RecordRow[] } | null>(null);
  readonly fmtDate = fmtDate;
  readonly fmtDuration = fmtDuration;

  ngOnInit(): void {
    this.api.get<{ myTickets: RecordRow[]; myPm: RecordRow[]; myProjects: RecordRow[] }>('/dashboard').subscribe({
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

  age(ticket: RecordRow): number {
    return ticket['ageH'] as number ?? 0;
  }
}
