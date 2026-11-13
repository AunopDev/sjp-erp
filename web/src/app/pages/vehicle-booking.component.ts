import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { MetaService } from '../core/meta.service';
import { displayValue, downloadCsv, fmtDate, todayStr } from '../core/util';
import { IconComponent } from '../shared/icon.component';
import { RecordFormComponent } from '../shared/record-form.component';
import { StateComponent } from '../shared/state.component';
import { ToastService } from '../shared/toast.service';
import type { ListResponse, RecordRow } from '../core/models';

const SLOT_FROM = 6;
const SLOT_TO = 21;
const INACTIVE = ['ยกเลิก', 'ไม่อนุมัติ', 'เสร็จสิ้น'];
const WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

const STATUS_TONE: Record<string, string> = {
  'รออนุมัติ': 'amber',
  'อนุมัติแล้ว': 'green',
  'ไม่อนุมัติ': 'gray',
  'ยกเลิก': 'gray',
  'เสร็จสิ้น': 'blue',
};

const pad = (value: number): string => String(value).padStart(2, '0');

const dayKey = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const timeLabel = (date: Date): string => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

const parseDate = (value: unknown): Date | null => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

const isDateOnly = (value: string | null): value is string =>
  !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

@Component({
  selector: 'app-vehicle-booking',
  standalone: true,
  imports: [IconComponent, RecordFormComponent, StateComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>จองรถบริษัท</h1>
          <div class="muted">ตรวจช่วงเวลาว่างของรถแต่ละคัน แล้วจองล่วงหน้าได้ทันที</div>
        </div>
        <div class="page-actions vb-date-actions">
          <div class="vb-date-control">
            <button type="button" class="btn" (click)="shift(-1)" aria-label="วันก่อนหน้า">‹</button>
            <input class="vb-date" type="date" [value]="date()" (change)="setDate($any($event.target).value)" aria-label="เลือกวันที่" />
            <button type="button" class="btn" (click)="shift(1)" aria-label="วันถัดไป">›</button>
          </div>
          <button type="button" class="btn" (click)="goToday()">วันนี้</button>
          @if (canCreateBooking()) {
            <button type="button" class="btn primary" (click)="openCreate()"><app-icon name="plus" [size]="15" /> จองรถ</button>
          }
        </div>
      </div>

      @if (error()) { <div class="state error">{{ error() }}</div> }

      <section class="vb-stats" aria-label="สรุปการใช้รถ">
        <div class="vb-stat">
          <span class="vb-stat-label">รถทั้งหมด</span>
          <span class="vb-stat-value">{{ vehicles().length }}</span>
          <span class="vb-stat-meta">พร้อมใช้ {{ readyVehicles().length }} คัน</span>
        </div>
        <div class="vb-stat">
          <span class="vb-stat-label">ว่างทั้งวัน</span>
          <span class="vb-stat-value">{{ freeToday() }}</span>
          <span class="vb-stat-meta">ไม่มีคิวจองในวันที่เลือก</span>
        </div>
        <div class="vb-stat">
          <span class="vb-stat-label">จองในวัน</span>
          <span class="vb-stat-value">{{ activeBookings().length }}</span>
          <span class="vb-stat-meta">{{ dayBookings().length }} รายการทั้งหมด</span>
        </div>
        <div class="vb-stat" [class.alert]="pendingCount() > 0">
          <span class="vb-stat-label">รออนุมัติ</span>
          <span class="vb-stat-value">{{ pendingCount() }}</span>
          <span class="vb-stat-meta">{{ pendingCount() ? 'ต้องพิจารณาก่อนใช้งาน' : 'ไม่มีคำขอค้าง' }}</span>
        </div>
      </section>

      <div class="vb-week" role="group" aria-label="เลือกวันในสัปดาห์">
        @for (day of weekDays(); track day.key) {
          <button
            type="button"
            class="vb-week-day"
            [class.today]="day.today"
            [class.selected]="day.selected"
            [attr.aria-current]="day.selected ? 'date' : null"
            (click)="setDate(day.key)"
          >
            <span>{{ day.label }}</span>
            <b>{{ day.day }}</b>
            <small>{{ day.count ? day.count + ' จอง' : 'ว่าง' }}</small>
          </button>
        }
      </div>

      @if (loading()) {
        <app-state kind="loading" message="กำลังโหลดตารางการใช้รถ…" />
      } @else {
        @if (canViewVehicles() && canViewBookings()) {
          <section class="panel vb-finder">
            <div class="panel-head">
              <h2>หารถว่าง</h2>
              <span class="badge {{ quickAvailable().length ? 'green' : 'gray' }}">{{ quickAvailable().length }} คันว่าง</span>
              <span class="grow"></span>
              <span class="muted small">{{ fmtDate(date()) }}</span>
            </div>
            <div class="vb-finder-body">
              <div class="vb-finder-form">
                <div class="field"><label for="lf-vehicle-booking-component-1">เริ่ม</label><input id="lf-vehicle-booking-component-1" type="time" min="06:00" max="21:00" [value]="quickStart()" (change)="setQuickStart($any($event.target).value)" /></div>
                <div class="field"><label for="lf-vehicle-booking-component-2">ถึง</label><input id="lf-vehicle-booking-component-2" type="time" min="06:00" max="21:00" [value]="quickEnd()" (change)="setQuickEnd($any($event.target).value)" /></div>
                <div class="field"><label for="lf-vehicle-booking-component-3">ผู้โดยสาร</label><input id="lf-vehicle-booking-component-3" type="number" min="1" inputMode="numeric" [value]="quickPassengers()" (input)="setQuickPassengers($any($event.target).value)" placeholder="ไม่ระบุ" /></div>
                <div class="field">
                  <label for="lf-vehicle-booking-component-4">ประเภทรถ</label>
                  <select id="lf-vehicle-booking-component-4" [value]="quickType()" (change)="setQuickType($any($event.target).value)">
                    <option value="">ทุกประเภท</option>
                    @for (type of vehicleTypes(); track type) { <option [value]="type" [selected]="type === quickType()">{{ type }}</option> }
                  </select>
                </div>
              </div>
              @if (quickError()) {
                <div class="notice warn small">{{ quickError() }}</div>
              } @else if (!vehicles().length) {
                <div class="vb-av-empty">
                  ยังไม่มีรถในระบบ
                  @if (canCreateVehicle()) { <button type="button" class="btn sm primary" (click)="openVehicle()">+ เพิ่มรถคันแรก</button> }
                </div>
              } @else if (!quickAvailable().length) {
                <div class="vb-av-empty">
                  ไม่มีรถว่างในช่วงเวลานี้
                  <button type="button" class="btn sm" (click)="view.set('grid')">ดูตารางการใช้รถ</button>
                  @if (quickType() || quickPassengers()) {
                    <button type="button" class="btn sm" (click)="clearQuickFilters()">ล้างตัวกรอง</button>
                  }
                </div>
              } @else {
                <div class="vb-av-grid">
                  @for (vehicle of quickAvailable(); track vehicle.id) {
                    <div class="vb-av-card">
                      <div class="vb-av-head">
                        <span class="vb-av-ic"><app-icon name="truck" [size]="17" /></span>
                        <div class="vb-av-main">
                          <b>{{ vehicleTitle(vehicle) }}</b>
                          <span>{{ display(vehicle['plateNo']) }} · {{ display(vehicle['type']) }}@if (vehicle['seats']) { · {{ display(vehicle['seats']) }} ที่นั่ง }</span>
                        </div>
                      </div>
                      <div class="vb-av-foot">
                        <span class="vb-av-slot">ว่าง {{ quickStart() }}–{{ quickEnd() }}</span>
                        <span class="grow"></span>
                        @if (canCreateBooking()) {
                          <button type="button" class="btn sm primary" (click)="bookQuick(vehicle)">จองคันนี้</button>
                        }
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          </section>

          <div class="tabs" role="group" aria-label="มุมมองรถ">
            <button type="button" [attr.aria-pressed]="view() === 'bookings'" [class.active]="view() === 'bookings'" (click)="view.set('bookings')">รายการจอง <span class="tab-count">{{ filteredBookings().length }}</span></button>
            <button type="button" [attr.aria-pressed]="view() === 'grid'" [class.active]="view() === 'grid'" (click)="view.set('grid')">ตารางการใช้รถ <span class="tab-count">{{ activeBookings().length }}</span></button>
          </div>
        }

        @if (view() === 'grid' && canViewVehicles() && canViewBookings()) {
          <section class="panel vb-board">
            <div class="panel-head">
              <h2>ตารางการใช้รถ · {{ fmtDate(date()) }}</h2>
              <span class="badge gray">{{ activeBookings().length }} คิวจอง</span>
              <span class="grow"></span>
              <label class="check vb-toggle">
                <input type="checkbox" [checked]="onlyReady()" (change)="onlyReady.set($any($event.target).checked)" />
                ซ่อนรถที่ไม่พร้อมใช้
              </label>
            </div>
            @if (!vehicles().length) {
              <div class="panel-empty">
                ยังไม่มีรถในระบบ
                @if (canCreateVehicle()) {
                  <div style="margin-top:8px"><button type="button" class="btn sm primary" (click)="openVehicle()">+ เพิ่มรถคันแรก</button></div>
                }
              </div>
            } @else {
              <div class="vb-grid-scroll">
                <table class="vb-grid">
                  <thead>
                    <tr>
                      <th scope="col" class="vb-veh">รถ</th>
                      @for (slot of slots; track slot; let i = $index) { <th scope="col" [class.now]="isNowSlot(i)">{{ slotLabel(i) }}</th> }
                    </tr>
                  </thead>
                  <tbody>
                    @for (vehicle of visibleVehicles(); track vehicle.id) {
                      <tr [class.off]="!isReady(vehicle)">
                        <th scope="col" class="vb-veh" [title]="vehicleTitle(vehicle) + ' · ' + display(vehicle['plateNo']) + ' · ' + display(vehicle['type'])">
                          <span class="vb-veh-name">{{ vehicleTitle(vehicle) }}</span>
                          <span class="vb-veh-meta">{{ display(vehicle['plateNo']) }} · {{ display(vehicle['type']) }}</span>
                        </th>
                        @for (slot of slots; track slot; let i = $index) {
                          @if (cellBooking(idOf(vehicle['id']), i); as booking) {
                            <td [class]="'vb-cell booked tone-' + statusTone(booking)" [title]="cellTitle(booking)">
                              @if (isBookingStart(booking, i)) {
                                <button type="button" class="vb-block" (click)="openEdit(booking)">{{ bookingRangeShort(booking) }}</button>
                              } @else {
                                <span class="vb-block" aria-hidden="true"></span>
                              }
                            </td>
                          } @else {
                            <td class="vb-cell" [class.disabled]="!isReady(vehicle)">
                              <button
                                type="button"
                                class="vb-free"
                                [disabled]="!canCreateBooking() || !isReady(vehicle)"
                                [attr.aria-label]="'จอง ' + vehicleTitle(vehicle) + ' เวลา ' + slotLabel(i)"
                                (click)="openCreate(vehicle, i)"
                              ><span>+</span></button>
                            </td>
                          }
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="vb-legend">
                <span><i class="vb-swatch free"></i> ว่าง — คลิกเพื่อจอง</span>
                <span><i class="vb-swatch pending"></i> รออนุมัติ</span>
                <span><i class="vb-swatch approved"></i> อนุมัติแล้ว</span>
                <span><i class="vb-swatch done"></i> เสร็จสิ้น</span>
                <span class="muted">มุมมองรายชั่วโมง {{ slotLabel(0) }}–{{ slotLabel(slots.length) }} · เลื่อนตารางแนวนอนได้</span>
              </div>
            }
          </section>
        } @else {

        <div class="vb-layout" [class.single]="!canViewVehicles() || !canViewBookings()">
          @if (canViewBookings()) {
            <section class="panel">
              <div class="panel-head">
                <h2>รายการจอง {{ fmtDate(date()) }}</h2>
                <span class="badge gray">{{ filteredBookings().length }}/{{ dayBookings().length }}</span>
                <span class="grow"></span>
                @if (canCreateBooking()) {
                  <button type="button" class="btn sm" (click)="openCreate()">+ เพิ่มการจอง</button>
                }
              </div>
              <div class="vb-filters">
                <input
                  class="vb-search"
                  type="search"
                  [value]="search()"
                  (input)="search.set($any($event.target).value)"
                  placeholder="ค้นหาการจอง ผู้จอง ปลายทาง…"
                  aria-label="ค้นหาการจอง"
                />
                <select class="vb-status-filter" [value]="statusFilter()" (change)="statusFilter.set($any($event.target).value)" aria-label="กรองตามสถานะ">
                  <option value="">ทุกสถานะ</option>
                  @for (status of statuses; track status) { <option [value]="status" [selected]="status === statusFilter()">{{ status }}</option> }
                </select>
                <label class="check"><input type="checkbox" [checked]="mineOnly()" (change)="mineOnly.set($any($event.target).checked)" /> เฉพาะของฉัน</label>
                <span class="grow"></span>
                @if (canExport()) {
                  <button type="button" class="btn sm" [disabled]="!filteredBookings().length" (click)="exportCsv()">ส่งออก CSV</button>
                }
              </div>
              @if (!filteredBookings().length) {
                <div class="panel-empty">
                  @if (!dayBookings().length) {
                    ยังไม่มีการจองในวันนี้ — ใช้ช่อง “หารถว่าง” ด้านบน หรือกดเพิ่มการจอง
                  } @else {
                    ไม่พบรายการที่ตรงกับตัวกรอง
                  }
                </div>
              } @else {
                @for (booking of filteredBookings(); track booking.id) {
                  <div class="vb-booking" [class.muted-row]="!isActive(booking)" [class.live]="bookingState(booking) === 'in-use'">
                    <div class="vb-time">
                      <b>{{ startTime(booking) }}</b>
                      <span>{{ endTime(booking) }}</span>
                    </div>
                    <div class="vb-b-main">
                      <b>{{ display(booking['title']) }}</b>
                      <span>{{ bookingVehicle(booking) }} · {{ display(booking['destination']) }}</span>
                      <span class="sub">{{ display(booking['requester']) }}@if (booking['department']) { · {{ display(booking['department']) }} }</span>
                    </div>
                    <div class="vb-b-side">
                      <span class="badge {{ statusTone(booking) }}">{{ statusLabel(booking) }}</span>
                      <span class="vb-b-actions">
                        @if (isPending(booking) && canApprove()) {
                          <button type="button" class="btn sm primary" (click)="decide(booking, 'approve')">อนุมัติ</button>
                          <button type="button" class="btn sm danger" (click)="decide(booking, 'reject')">ไม่อนุมัติ</button>
                        }
                        @if (canEditBooking() && isActive(booking)) {
                          <button type="button" class="btn sm" (click)="openEdit(booking)">แก้ไข</button>
                          @if (statusOf(booking) === 'อนุมัติแล้ว') {
                            <button type="button" class="btn sm" (click)="completeBooking(booking)">เสร็จสิ้น</button>
                          }
                          @if (statusOf(booking) !== 'เสร็จสิ้น') {
                            <button type="button" class="btn sm danger" (click)="cancelBooking(booking)">ยกเลิก</button>
                          }
                        }
                      </span>
                    </div>
                  </div>
                }
              }
            </section>
          }

          @if (canViewVehicles()) {
            <section class="panel">
              <div class="panel-head">
                <h2>รถบริษัท</h2>
                <span class="badge gray">{{ vehicles().length }}</span>
                <span class="grow"></span>
                @if (canCreateVehicle()) {
                  <button type="button" class="btn sm" (click)="openVehicle()">+ เพิ่มรถ</button>
                }
              </div>
              @if (!vehicles().length) {
                <div class="panel-empty">ยังไม่มีข้อมูลรถ</div>
              } @else {
                @for (vehicle of vehicles(); track vehicle.id) {
                  <div class="vb-vehicle">
                    <span class="vb-vehicle-ic"><app-icon name="truck" [size]="17" /></span>
                    <span class="vb-vehicle-main">
                      <b>{{ vehicleTitle(vehicle) }}</b>
                      <span>{{ display(vehicle['plateNo']) }} · {{ display(vehicle['type']) }}@if (vehicle['seats']) { · {{ display(vehicle['seats']) }} ที่นั่ง }</span>
                      <span class="vb-vehicle-live">
                        @if (currentBooking(vehicle); as current) {
                          <span class="vb-live-dot"></span> มีคิวจองถึง {{ endTime(current) }}
                        } @else if (isReady(vehicle)) {
                          ว่างตอนนี้
                        } @else {
                          ยังใช้งานไม่ได้
                        }
                      </span>
                    </span>
                    <span class="badge {{ vehicleTone(vehicle) }}">{{ display(vehicle['status']) }}</span>
                    @if (canEditVehicle()) {
                      <button type="button" class="btn ghost sm" (click)="openVehicle(vehicle)" aria-label="แก้ไขรถ">แก้ไข</button>
                    }
                  </div>
                }
              }
            </section>
          }
        </div>
        }
      }
    </div>

    @if (formOpen() && bookingDef(); as def) {
      <app-record-form
        [entity]="def.key"
        [entityLabel]="def.label"
        [fields]="def.fields"
        [record]="editing()"
        [defaults]="defaults()"
        [lists]="lists()"
        (saved)="onBookingSaved()"
        (closed)="closeBookingForm()"
      />
    }

    @if (vehicleFormOpen() && vehicleDef(); as def) {
      <app-record-form
        [entity]="def.key"
        [entityLabel]="def.label"
        [fields]="def.fields"
        [record]="editingVehicle()"
        [defaults]="vehicleDefaults()"
        [lists]="lists()"
        (saved)="onVehicleSaved()"
        (closed)="vehicleFormOpen.set(false)"
      />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VehicleBookingComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  readonly meta = inject(MetaService);
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly date = signal(todayStr());
  readonly bookings = signal<RecordRow[]>([]);
  readonly vehicles = signal<RecordRow[]>([]);
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal('');
  readonly onlyReady = signal(false);
  readonly view = signal<'bookings' | 'grid'>('bookings');
  readonly quickStart = signal('09:00');
  readonly quickEnd = signal('11:00');
  readonly quickPassengers = signal('');
  readonly quickType = signal('');
  readonly search = signal('');
  readonly statusFilter = signal('');
  readonly mineOnly = signal(false);
  readonly statuses = ['รออนุมัติ', 'อนุมัติแล้ว', 'เสร็จสิ้น', 'ไม่อนุมัติ', 'ยกเลิก'];
  readonly now = signal(Date.now());

  readonly formOpen = signal(false);
  readonly editing = signal<RecordRow | null>(null);
  readonly defaults = signal<Record<string, unknown>>({});
  readonly vehicleFormOpen = signal(false);
  readonly editingVehicle = signal<RecordRow | null>(null);
  readonly vehicleDefaults = signal<Record<string, unknown>>({ status: 'พร้อมใช้' });

  readonly slots = Array.from({ length: SLOT_TO - SLOT_FROM }, (_, i) => SLOT_FROM + i);
  readonly fmtDate = fmtDate;

  readonly bookingDef = computed(() => this.meta.entity('vehicleBookings'));
  readonly vehicleDef = computed(() => this.meta.entity('vehicles'));
  readonly lists = computed(() => this.meta.lists());

  readonly canViewBookings = computed(() => this.auth.can('vehicleBookings', 'view'));
  readonly canViewVehicles = computed(() => this.auth.can('vehicles', 'view'));
  readonly canCreateBooking = computed(() => this.auth.can('vehicleBookings', 'create'));
  readonly canEditBooking = computed(() => this.auth.can('vehicleBookings', 'edit'));
  readonly canCreateVehicle = computed(() => this.auth.can('vehicles', 'create'));
  readonly canEditVehicle = computed(() => this.auth.can('vehicles', 'edit'));
  readonly canApprove = computed(() => this.auth.can('vehicleBookings', 'approve'));
  readonly canExport = computed(() => this.auth.can('vehicleBookings', 'export'));

  readonly readyVehicles = computed(() => this.vehicles().filter((vehicle) => this.isReady(vehicle)));
  readonly visibleVehicles = computed(() => (this.onlyReady() ? this.readyVehicles() : this.vehicles()));
  readonly vehicleTypes = computed(() =>
    [...new Set(this.vehicles().map((vehicle) => String(vehicle['type'] ?? '')).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'th'),
    ),
  );
  readonly quickRange = computed<{ start: Date; end: Date } | null>(() => {
    const startParts = this.quickStart().split(':').map(Number);
    const endParts = this.quickEnd().split(':').map(Number);
    if (startParts.length !== 2 || endParts.length !== 2) return null;
    if (!startParts.every(Number.isFinite) || !endParts.every(Number.isFinite)) return null;
    const start = new Date(`${this.date()}T00:00:00`);
    start.setHours(startParts[0], startParts[1], 0, 0);
    const end = new Date(`${this.date()}T00:00:00`);
    end.setHours(endParts[0], endParts[1], 0, 0);
    if (end <= start) return null;
    return { start, end };
  });
  readonly quickError = computed(() => {
    const range = this.quickRange();
    if (!range) return 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม';
    if (this.quickStart() < '06:00' || this.quickEnd() > '21:00') return 'เวลาให้บริการ 06:00–21:00';
    if (range.end.getTime() <= this.now()) return 'ช่วงเวลานี้ผ่านมาแล้ว — เลือกวันหรือเวลาใหม่';
    return '';
  });
  readonly quickAvailable = computed(() => {
    const range = this.quickRange();
    if (!range || this.quickError()) return [];
    const passengers = Number(this.quickPassengers()) || 0;
    const type = this.quickType();
    return this.readyVehicles()
      .filter((vehicle) => {
        if (type && String(vehicle['type'] ?? '') !== type) return false;
        const seats = Number(vehicle['seats'] ?? 0);
        if (passengers > 0 && seats > 0 && seats < passengers) return false;
        return !this.activeBookings().some((booking) => {
          if (String(booking['vehicle'] ?? '') !== String(vehicle['id'])) return false;
          const bookingRange = this.bookingRange(booking);
          return !!bookingRange && bookingRange.start < range.end && bookingRange.end > range.start;
        });
      })
      .sort((a, b) => this.vehicleTitle(a).localeCompare(this.vehicleTitle(b), 'th'));
  });

  readonly dayBookings = computed(() => {
    const range = this.dayRange();
    return this.bookings()
      .filter((booking) => {
        const bookingRange = this.bookingRange(booking);
        return !!bookingRange && bookingRange.start < range.end && bookingRange.end > range.start;
      })
      .sort((a, b) => {
        const left = this.bookingRange(a)?.start.getTime() ?? 0;
        const right = this.bookingRange(b)?.start.getTime() ?? 0;
        return left - right;
      });
  });

  readonly activeBookings = computed(() => this.dayBookings().filter((booking) => this.isActive(booking)));
  readonly pendingCount = computed(() => this.activeBookings().filter((booking) => this.statusOf(booking) === 'รออนุมัติ').length);
  readonly freeToday = computed(() => {
    const busy = new Set(this.activeBookings().map((booking) => String(booking['vehicle'] ?? '')));
    return this.readyVehicles().filter((vehicle) => !busy.has(String(vehicle['id']))).length;
  });

  readonly filteredBookings = computed(() => {
    const query = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    const mine = this.mineOnly();
    const myName = this.auth.user()?.name ?? '';
    return this.dayBookings().filter((booking) => {
      if (status && this.statusOf(booking) !== status) return false;
      if (mine && String(booking['requester'] ?? '') !== myName) return false;
      if (!query) return true;
      const haystack = [
        booking.code,
        String(booking['title'] ?? ''),
        String(booking['destination'] ?? ''),
        String(booking['requester'] ?? ''),
        String(booking['department'] ?? ''),
        this.bookingVehicle(booking),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  });

  readonly weekDays = computed(() => {
    const selected = new Date(`${this.date()}T00:00:00`);
    const monday = new Date(selected);
    monday.setDate(monday.getDate() - ((selected.getDay() + 6) % 7));
    const today = todayStr();
    const active = this.bookings().filter((booking) => this.isActive(booking));
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      const key = todayStr(date);
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const count = active.filter((booking) => {
        const range = this.bookingRange(booking);
        return !!range && range.start < end && range.end > start;
      }).length;
      return {
        key,
        day: date.getDate(),
        label: WEEKDAYS[date.getDay()],
        count,
        today: key === today,
        selected: key === this.date(),
      };
    });
  });

  private pendingBookingId = '';
  private pendingNew = false;
  private pendingVehicleId = '';
  private clock: ReturnType<typeof setInterval> | null = null;

  constructor() {
    effect(() => {
      if (this.meta.meta()) this.load();
    });
  }

  ngOnInit(): void {
    this.meta.load();
    this.syncQuickTimes();
    this.clock = setInterval(() => this.now.set(Date.now()), 60000);
    this.route.queryParamMap.subscribe((params) => {
      const date = params.get('date');
      if (isDateOnly(date)) this.setDate(date);
      if (params.get('new') === '1') this.pendingNew = true;
      const vehicle = params.get('vehicle');
      if (vehicle) this.pendingVehicleId = vehicle;
      const booking = params.get('booking');
      if (booking) this.pendingBookingId = booking;
      this.applyPending();
    });
  }

  ngOnDestroy(): void {
    if (this.clock) clearInterval(this.clock);
  }

  load(): void {
    if (!this.canViewBookings() && !this.canViewVehicles()) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.loaded.set(false);
    this.error.set('');
    forkJoin({
      vehicles: this.canViewVehicles()
        ? this.api.get<ListResponse<RecordRow>>('/records/vehicles', { pageSize: 500 })
        : of(null),
      bookings: this.canViewBookings()
        ? this.api.get<ListResponse<RecordRow>>('/records/vehicleBookings', { pageSize: 500 })
        : of(null),
    }).subscribe({
      next: (result) => {
        this.vehicles.set(result.vehicles?.items ?? []);
        this.bookings.set(result.bookings?.items ?? []);
        this.loading.set(false);
        this.loaded.set(true);
        this.applyPending();
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.loaded.set(true);
        this.error.set(apiErrorMessage(error));
      },
    });
  }

  slotLabel(index: number): string {
    return `${pad(SLOT_FROM + index)}:00`;
  }

  display(value: unknown): string {
    return displayValue(value);
  }

  idOf(value: unknown): string {
    return value === undefined || value === null ? '' : String(value);
  }

  vehicleTitle(vehicle: RecordRow): string {
    return displayValue(vehicle['name'] ?? vehicle.code);
  }

  isReady(vehicle: RecordRow): boolean {
    return String(vehicle['status'] ?? 'พร้อมใช้') === 'พร้อมใช้';
  }

  vehicleTone(vehicle: RecordRow): string {
    const status = String(vehicle['status'] ?? '');
    if (status === 'พร้อมใช้') return 'green';
    if (status === 'ซ่อมบำรุง') return 'amber';
    return 'red';
  }

  statusOf(booking: RecordRow): string {
    return String(booking['status'] ?? '');
  }

  isActive(booking: RecordRow): boolean {
    return !INACTIVE.includes(this.statusOf(booking));
  }

  bookingState(booking: RecordRow): 'in-use' | 'overdue' | 'normal' {
    if (this.statusOf(booking) !== 'อนุมัติแล้ว') return 'normal';
    const range = this.bookingRange(booking);
    if (!range) return 'normal';
    const now = this.now();
    if (range.end.getTime() < now) return 'overdue';
    if (range.start.getTime() <= now && now < range.end.getTime()) return 'in-use';
    return 'normal';
  }

  statusLabel(booking: RecordRow): string {
    const state = this.bookingState(booking);
    if (state === 'in-use') return 'กำลังใช้งาน';
    if (state === 'overdue') return 'เลยเวลาคืน';
    return this.statusOf(booking) || '–';
  }

  statusTone(booking: RecordRow): string {
    const state = this.bookingState(booking);
    if (state === 'in-use') return 'blue';
    if (state === 'overdue') return 'red';
    return STATUS_TONE[this.statusOf(booking)] ?? 'gray';
  }

  isPending(booking: RecordRow): boolean {
    return this.statusOf(booking) === 'รออนุมัติ';
  }

  isNowSlot(index: number): boolean {
    if (this.date() !== todayStr()) return false;
    return new Date(this.now()).getHours() === SLOT_FROM + index;
  }

  currentBooking(vehicle: RecordRow): RecordRow | null {
    const now = this.now();
    return (
      this.activeBookings().find((booking) => {
        if (String(booking['vehicle'] ?? '') !== String(vehicle['id'])) return false;
        const range = this.bookingRange(booking);
        return !!range && range.start.getTime() <= now && now < range.end.getTime();
      }) ?? null
    );
  }

  bookingVehicle(booking: RecordRow): string {
    const label = booking._labels?.['vehicle'];
    if (label) return label;
    const vehicle = this.vehicles().find((item) => String(item['id']) === String(booking['vehicle'] ?? ''));
    return vehicle ? this.vehicleTitle(vehicle) : 'ไม่ระบุรถ';
  }

  private dayRange(): { start: Date; end: Date } {
    const start = new Date(`${this.date()}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  private bookingRange(booking: RecordRow): { start: Date; end: Date } | null {
    const start = parseDate(booking['startAt']);
    const end = parseDate(booking['endAt']);
    if (!start || !end || end <= start) return null;
    return { start, end };
  }

  private slotStart(index: number): Date {
    const date = new Date(`${this.date()}T00:00:00`);
    date.setHours(SLOT_FROM + index, 0, 0, 0);
    return date;
  }

  cellBooking(vehicleId: string, slotIndex: number): RecordRow | null {
    const start = this.slotStart(slotIndex);
    const end = new Date(start.getTime() + 3600000);
    return (
      this.activeBookings().find((booking) => {
        if (String(booking['vehicle'] ?? '') !== vehicleId) return false;
        const range = this.bookingRange(booking);
        return !!range && range.start < end && range.end > start;
      }) ?? null
    );
  }

  isBookingStart(booking: RecordRow, slotIndex: number): boolean {
    const range = this.bookingRange(booking);
    if (!range) return false;
    const start = this.slotStart(slotIndex);
    const end = new Date(start.getTime() + 3600000);
    return range.start >= start && range.start < end;
  }

  cellTitle(booking: RecordRow): string {
    return `${this.display(booking['title'])} · ${this.bookingVehicle(booking)} · ${this.rangeText(booking)} · ${this.statusLabel(booking)}`;
  }

  bookingRangeShort(booking: RecordRow): string {
    const range = this.bookingRange(booking);
    if (!range) return '–';
    return `${timeLabel(range.start)}–${timeLabel(range.end)}`;
  }

  rangeText(booking: RecordRow): string {
    const range = this.bookingRange(booking);
    if (!range) return '–';
    if (dayKey(range.start) === dayKey(range.end)) {
      return `${timeLabel(range.start)} – ${timeLabel(range.end)}`;
    }
    return `${fmtDate(range.start)} ${timeLabel(range.start)} – ${fmtDate(range.end)} ${timeLabel(range.end)}`;
  }

  startTime(booking: RecordRow): string {
    const range = this.bookingRange(booking);
    return range ? timeLabel(range.start) : '–';
  }

  endTime(booking: RecordRow): string {
    const range = this.bookingRange(booking);
    return range ? timeLabel(range.end) : '–';
  }

  setDate(value: string): void {
    if (!isDateOnly(value)) return;
    this.date.set(value);
    this.syncQuickTimes();
  }

  shift(days: number): void {
    const date = new Date(`${this.date()}T00:00:00`);
    date.setDate(date.getDate() + days);
    this.date.set(todayStr(date));
    this.syncQuickTimes();
  }

  goToday(): void {
    this.date.set(todayStr());
    this.syncQuickTimes();
  }

  setQuickStart(value: string): void {
    this.quickStart.set(value);
  }

  setQuickEnd(value: string): void {
    this.quickEnd.set(value);
  }

  setQuickPassengers(value: string): void {
    this.quickPassengers.set(value);
  }

  setQuickType(value: string): void {
    this.quickType.set(value);
  }

  clearQuickFilters(): void {
    this.quickPassengers.set('');
    this.quickType.set('');
  }

  bookQuick(vehicle: RecordRow): void {
    const range = this.quickRange();
    if (!range || this.quickError()) {
      this.toast.error(this.quickError() || 'เลือกช่วงเวลาใหม่');
      return;
    }
    this.openCreate(vehicle, undefined, range);
  }

  private syncQuickTimes(): void {
    const now = new Date();
    if (this.date() === todayStr() && now.getHours() < SLOT_TO) {
      const startHour = Math.min(SLOT_TO - 1, Math.max(SLOT_FROM, now.getHours() + 1));
      this.quickStart.set(`${pad(startHour)}:00`);
      this.quickEnd.set(`${pad(Math.min(SLOT_TO, startHour + 2))}:00`);
      return;
    }
    this.quickStart.set('09:00');
    this.quickEnd.set('11:00');
  }

  openCreate(vehicle?: RecordRow, slotIndex?: number, range?: { start: Date; end: Date }): void {
    if (!this.canCreateBooking()) {
      this.toast.error('คุณไม่มีสิทธิ์สร้างการจอง');
      return;
    }
    let start: Date;
    let end: Date;
    if (range) {
      start = new Date(range.start);
      end = new Date(range.end);
    } else {
      const preset = this.quickError() === '' ? this.quickRange() : null;
      if (preset) {
        start = new Date(preset.start);
        end = new Date(preset.end);
      } else {
        start = this.slotStart(slotIndex ?? 3);
        end = new Date(start);
        const room = SLOT_TO - (SLOT_FROM + (slotIndex ?? 3));
        end.setHours(end.getHours() + Math.max(1, Math.min(2, room)));
      }
    }
    const user = this.auth.user();
    this.editing.set(null);
    this.defaults.set({
      status: 'รออนุมัติ',
      requester: user?.name ?? '',
      department: user?.dept ?? '',
      vehicle: vehicle ? String(vehicle['id']) : '',
      startAt: start.toISOString(),
      endAt: end.toISOString(),
    });
    this.formOpen.set(true);
  }

  openEdit(booking: RecordRow): void {
    if (!this.canEditBooking()) {
      void this.router.navigate(['/entities', 'vehicleBookings', booking.id]);
      return;
    }
    this.editing.set(booking);
    this.defaults.set({});
    this.formOpen.set(true);
  }

  closeBookingForm(): void {
    this.formOpen.set(false);
    this.editing.set(null);
    this.defaults.set({});
  }

  onBookingSaved(): void {
    this.closeBookingForm();
    this.load();
  }

  cancelBooking(booking: RecordRow): void {
    if (!this.canEditBooking()) return;
    const title = this.display(booking['title']);
    if (!confirm(`ยกเลิกการจอง “${title}” หรือไม่?`)) return;
    this.api.patch<RecordRow>(`/records/vehicleBookings/${booking.id}`, { status: 'ยกเลิก' }).subscribe({
      next: () => {
        this.toast.show('ยกเลิกการจองแล้ว');
        this.load();
      },
      error: (error: unknown) => this.toast.error(apiErrorMessage(error)),
    });
  }

  decide(booking: RecordRow, decision: 'approve' | 'reject'): void {
    if (!this.canApprove()) {
      this.toast.error('คุณไม่มีสิทธิ์อนุมัติการจอง');
      return;
    }
    const title = this.display(booking['title']);
    let note = '';
    if (decision === 'approve') {
      if (!confirm(`อนุมัติการจอง “${title}” หรือไม่?`)) return;
    } else {
      const reason = prompt(`เหตุผลที่ไม่อนุมัติ “${title}” (ไม่บังคับ)`);
      if (reason === null) return;
      note = reason;
    }
    this.api.post<RecordRow>(`/records/vehicleBookings/${booking.id}/decision`, { decision, note }).subscribe({
      next: () => {
        this.toast.show(decision === 'approve' ? 'อนุมัติการจองแล้ว' : 'ไม่อนุมัติการจองแล้ว');
        this.load();
      },
      error: (error: unknown) => this.toast.error(apiErrorMessage(error)),
    });
  }

  completeBooking(booking: RecordRow): void {
    if (!this.canEditBooking()) return;
    const title = this.display(booking['title']);
    if (!confirm(`ทำเครื่องหมายว่าคืนรถแล้วสำหรับ “${title}” หรือไม่?`)) return;
    this.api.patch<RecordRow>(`/records/vehicleBookings/${booking.id}`, { status: 'เสร็จสิ้น' }).subscribe({
      next: () => {
        this.toast.show('ปิดงานการจองแล้ว');
        this.load();
      },
      error: (error: unknown) => this.toast.error(apiErrorMessage(error)),
    });
  }

  exportCsv(): void {
    if (!this.canExport()) return;
    const rows = this.filteredBookings().map((booking) => [
      booking.code,
      booking['title'],
      this.bookingVehicle(booking),
      booking['requester'],
      booking['department'],
      booking['destination'],
      this.startTime(booking),
      this.endTime(booking),
      booking['passengers'],
      this.statusLabel(booking),
    ]);
    downloadCsv(
      `vehicle-bookings-${this.date()}.csv`,
      ['เลขที่', 'วัตถุประสงค์', 'รถ', 'ผู้จอง', 'แผนก', 'ปลายทาง', 'เริ่ม', 'สิ้นสุด', 'ผู้โดยสาร', 'สถานะ'],
      rows,
    );
  }

  openVehicle(vehicle?: RecordRow): void {
    if (vehicle ? !this.canEditVehicle() : !this.canCreateVehicle()) {
      this.toast.error('คุณไม่มีสิทธิ์แก้ไขข้อมูลรถ');
      return;
    }
    this.editingVehicle.set(vehicle ?? null);
    this.vehicleDefaults.set({ status: 'พร้อมใช้' });
    this.vehicleFormOpen.set(true);
  }

  onVehicleSaved(): void {
    this.vehicleFormOpen.set(false);
    this.editingVehicle.set(null);
    this.load();
  }

  private applyPending(): void {
    if (!this.meta.meta() || !this.loaded()) return;
    if (this.pendingBookingId) {
      const booking = this.bookings().find((item) => item.id === this.pendingBookingId);
      this.pendingBookingId = '';
      if (booking) {
        this.openEdit(booking);
        return;
      }
    }
    if (this.pendingNew) {
      this.pendingNew = false;
      const vehicle = this.vehicles().find((item) => String(item['id']) === this.pendingVehicleId);
      this.pendingVehicleId = '';
      this.openCreate(vehicle);
    }
  }
}
