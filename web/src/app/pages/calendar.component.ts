import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { ToastService } from '../shared/toast.service';
import { IconComponent } from '../shared/icon.component';

interface CalendarEvent {
  id: string;
  type: 'appointment' | 'pm' | 'project' | 'po';
  date: string;
  time: string;
  title: string;
  subtitle: string;
  status: string;
  link: string;
}

interface CalendarCell {
  date: string;
  day: number;
  inMonth: boolean;
  today: boolean;
  events: CalendarEvent[];
}

interface CalendarResponse {
  from: string;
  to: string;
  events: CalendarEvent[];
}

const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const TYPE_LABEL: Record<string, string> = { appointment: 'นัดหมาย', pm: 'PM', project: 'โครงการ', po: 'ใบสั่งซื้อ' };

const ymd = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1><app-icon name="calendar" [size]="28" class="h1-ic" />ปฏิทินงาน</h1>
          <div class="muted">นัดหมาย Ticket · งาน PM · ขั้นตอนโครงการ · กำหนดส่งใบสั่งซื้อ</div>
        </div>
        <div class="page-actions calendar-actions">
          <button type="button" class="btn" (click)="move(-1)" aria-label="เดือนก่อนหน้า">‹</button>
          <button type="button" class="btn" (click)="today()">วันนี้</button>
          <button type="button" class="btn" (click)="move(1)" aria-label="เดือนถัดไป">›</button>
        </div>
      </div>

      <div class="calendar-head">
        <h2>{{ monthLabel() }}</h2>
        <span class="badge gray">{{ events().length }} รายการในเดือนนี้</span>
        <span class="grow"></span>
        <div class="calendar-legend">
          <span><i class="ev-dot t-ticket"></i> นัดหมาย</span>
          <span><i class="ev-dot t-pm"></i> PM</span>
          <span><i class="ev-dot t-project"></i> โครงการ</span>
          <span><i class="ev-dot t-po"></i> ใบสั่งซื้อ</span>
        </div>
      </div>

      @if (error()) { <div class="state error">{{ error() }}</div> }

      <div class="cal">
        @for (day of weekdays; track day) { <div class="dow">{{ day }}</div> }
        @for (cell of cells(); track cell.date) {
          <button type="button" class="day" [class.other]="!cell.inMonth" [class.today]="cell.today" [class.selected]="selectedDate() === cell.date" (click)="selectedDate.set(cell.date)">
            <span class="day-num">{{ cell.day }}</span>
            <span class="day-events">
              @for (event of cell.events.slice(0, 3); track event.id) {
                <span class="ev {{ eventClass(event) }}" [title]="event.title" (click)="open(event, $event)">{{ event.time ? event.time + ' ' : '' }}{{ event.title }}</span>
              }
              @if (cell.events.length > 3) { <span class="ev-more">+{{ cell.events.length - 3 }}</span> }
            </span>
          </button>
        }
      </div>

      <div class="card calendar-list">
        <div class="row" style="margin-bottom:10px">
          <h2 style="margin:0">{{ selectedDate() ? 'งานวันที่ ' + fmtDay(selectedDate()!) : 'งานทั้งหมดในเดือนนี้' }}</h2>
          <span class="grow"></span>
          @if (selectedDate()) { <button type="button" class="btn sm" (click)="selectedDate.set(null)">ดูทั้งเดือน</button> }
        </div>
        @if (loading()) {
          <div class="state"><div class="spinner"></div>กำลังโหลด…</div>
        } @else if (!agenda().length) {
          <div class="state empty">ไม่มีงานในช่วงนี้</div>
        } @else {
          @for (event of agenda(); track event.id) {
            <button type="button" class="agenda-row" (click)="open(event, $event)">
              <span class="ev-dot {{ eventClass(event) }}"></span>
              <span class="agenda-main"><b>{{ event.title }}</b><span class="sub">{{ event.subtitle }}</span></span>
              <span class="agenda-date">{{ fmtDay(event.date) }} {{ event.time }}</span>
              <span class="badge gray">{{ typeLabel(event.type) }}</span>
            </button>
          }
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly viewDate = signal(new Date());
  readonly events = signal<CalendarEvent[]>([]);
  readonly selectedDate = signal<string | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly weekdays = WEEKDAYS;

  readonly monthLabel = computed(() => `${MONTHS[this.viewDate().getMonth()]} ${this.viewDate().getFullYear()}`);
  readonly cells = computed<CalendarCell[]>(() => {
    const date = this.viewDate();
    const year = date.getFullYear();
    const month = date.getMonth();
    const first = new Date(year, month, 1);
    const start = new Date(year, month, 1 - first.getDay());
    const today = ymd(new Date());
    const eventsByDate = new Map<string, CalendarEvent[]>();
    for (const event of this.events()) {
      const list = eventsByDate.get(event.date) ?? [];
      list.push(event);
      eventsByDate.set(event.date, list);
    }
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const key = ymd(day);
      return {
        date: key,
        day: day.getDate(),
        inMonth: day.getMonth() === month,
        today: key === today,
        events: (eventsByDate.get(key) ?? []).sort((a, b) => a.time.localeCompare(b.time)),
      };
    });
  });
  readonly agenda = computed(() => {
    const selected = this.selectedDate();
    return this.events()
      .filter((event) => !selected || event.date === selected)
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const date = this.viewDate();
    const from = ymd(new Date(date.getFullYear(), date.getMonth(), 1));
    const to = ymd(new Date(date.getFullYear(), date.getMonth() + 1, 0));
    this.loading.set(true);
    this.error.set('');
    this.api.get<CalendarResponse>('/calendar', { from, to }).subscribe({
      next: (result) => {
        this.events.set(result.events ?? []);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(error));
      },
    });
  }

  move(delta: number): void {
    const current = this.viewDate();
    this.selectedDate.set(null);
    this.viewDate.set(new Date(current.getFullYear(), current.getMonth() + delta, 1));
    this.load();
  }

  today(): void {
    this.selectedDate.set(null);
    this.viewDate.set(new Date());
    this.load();
  }

  eventClass(event: CalendarEvent): string {
    if (event.type === 'appointment') return 't-ticket';
    return `t-${event.type}`;
  }

  typeLabel(type: string): string {
    return TYPE_LABEL[type] ?? type;
  }

  fmtDay(date: string): string {
    const value = new Date(`${date}T00:00:00`);
    return `${value.getDate()} ${MONTHS[value.getMonth()]}`;
  }

  open(event: CalendarEvent, click: Event): void {
    click.stopPropagation();
    const [path] = event.link.split('?');
    void this.router.navigateByUrl(path);
    if (!path) this.toast.error('ไม่พบลิงก์ของรายการนี้');
  }
}
