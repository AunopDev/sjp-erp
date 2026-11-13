import { Injectable } from '@nestjs/common';
import { AccessService } from '../common/access.service.js';
import { dateKeyOf, isDateOnly, timeKeyOf, todayStr } from '../common/dates.js';
import type { SafeUser } from '../auth/user.types.js';
import { projectSteps } from '../meta/entities.js';
import { RecordsService } from '../records/records.service.js';

export interface CalendarEvent {
  id: string;
  type: 'appointment' | 'pm' | 'project' | 'po' | 'vehicle';
  date: string;
  time: string;
  title: string;
  subtitle: string;
  status: string;
  link: string;
}


@Injectable()
export class CalendarService {
  constructor(
    private readonly records: RecordsService,
    private readonly access: AccessService,
  ) {}

  list(user: SafeUser, fromInput?: string, toInput?: string) {
    const base = todayStr();
    const [year, month] = base.split('-').map(Number);
    const from = isDateOnly(fromInput) ? fromInput : `${year}-${String(month).padStart(2, '0')}-01`;
    const to = isDateOnly(toInput) ? toInput : new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const events: CalendarEvent[] = [];
    const inRange = (date: unknown) => {
      const value = String(date ?? '').slice(0, 10);
      return isDateOnly(value) && value >= from && value <= to;
    };

    if (this.access.canEntity(user, 'tickets', 'view')) {
      for (const ticket of this.records.all(user, 'tickets')) {
        const appointments = Array.isArray(ticket['appointments']) ? (ticket['appointments'] as Record<string, unknown>[]) : [];
        for (const appointment of appointments) {
          if (!inRange(appointment['date'])) continue;
          const tech = appointment['tech'] ? this.records.labelOf('users', String(appointment['tech']), user) : 'ยังไม่ระบุช่าง';
          events.push({
            id: `ticket-${ticket.id}-${String(appointment['id'] ?? appointment['date'])}`,
            type: 'appointment',
            date: String(appointment['date']).slice(0, 10),
            time: String(appointment['time'] ?? ''),
            title: `นัดหมาย: ${String(ticket['title'] ?? ticket.code)}`,
            subtitle: `${String(ticket.code)} · ${tech}`,
            status: String(appointment['status'] ?? 'นัดหมาย'),
            link: `/tickets/${ticket.id}`,
          });
        }
      }
    }

    if (this.access.canEntity(user, 'pmRecords', 'view')) {
      for (const record of this.records.all(user, 'pmRecords')) {
        if (record['status'] === 'เสร็จ' || !inRange(record['dueDate'])) continue;
        const plan = record['plan'] ? this.records.labelOf('pmPlans', String(record['plan']), user) : 'งาน PM';
        const site = record['site'] ? this.records.labelOf('sites', String(record['site']), user) : '';
        events.push({
          id: `pm-${record.id}`,
          type: 'pm',
          date: String(record['dueDate']).slice(0, 10),
          time: '',
          title: `PM: ${plan}`,
          subtitle: [String(record.code), site].filter(Boolean).join(' · '),
          status: String(record['status'] ?? ''),
          link: `/pm/records/${record.id}`,
        });
      }
    }

    if (this.access.canEntity(user, 'projects', 'view')) {
      for (const project of this.records.all(user, 'projects')) {
        if (project['closed']) continue;
        const steps = (project['steps'] as Record<string, { status?: string; plannedDate?: string }> | undefined) ?? {};
        for (const step of projectSteps().filter((item) => item.enabled)) {
          const current = steps[step.key];
          if (!current?.plannedDate || !inRange(current.plannedDate)) continue;
          if (['done', 'skipped'].includes(current.status ?? 'pending')) continue;
          events.push({
            id: `project-${project.id}-${step.key}`,
            type: 'project',
            date: String(current.plannedDate).slice(0, 10),
            time: '',
            title: `${String(project['name'] ?? project.code)}: ${step.label}`,
            subtitle: String(project.code),
            status: current.status ?? 'pending',
            link: `/projects/${project.id}`,
          });
        }
      }
    }

    if (this.access.canEntity(user, 'vehicleBookings', 'view')) {
      for (const booking of this.records.all(user, 'vehicleBookings')) {
        if (['ยกเลิก', 'ไม่อนุมัติ'].includes(String(booking['status'] ?? ''))) continue;
        const start = dateKeyOf(booking['startAt']);
        if (!inRange(start)) continue;
        const vehicle = booking['vehicle'] ? this.records.labelOf('vehicles', String(booking['vehicle']), user) : 'รถบริษัท';
        events.push({
          id: `vehicle-${booking.id}`,
          type: 'vehicle',
          date: start,
          time: timeKeyOf(booking['startAt']),
          title: `จองรถ: ${String(booking['title'] ?? booking.code)}`,
          subtitle: [vehicle, String(booking['requester'] ?? '')].filter(Boolean).join(' · '),
          status: String(booking['status'] ?? ''),
          link: `/vehicles?date=${start}&booking=${booking.id}`,
        });
      }
    }

    if (this.access.canEntity(user, 'purchaseOrders', 'view')) {
      for (const po of this.records.all(user, 'purchaseOrders')) {
        if (['received', 'closed', 'cancelled'].includes(String(po['status'] ?? ''))) continue;
        if (!inRange(po['dueDate'])) continue;
        const vendor = po['vendor'] ? this.records.labelOf('vendors', String(po['vendor']), user) : '';
        events.push({
          id: `po-${po.id}`,
          type: 'po',
          date: String(po['dueDate']).slice(0, 10),
          time: '',
          title: `กำหนดส่ง ${String(po.code)}`,
          subtitle: [vendor, String(po['status'] ?? '')].filter(Boolean).join(' · '),
          status: String(po['status'] ?? ''),
          link: `/purchase-orders/${po.id}`,
        });
      }
    }

    events.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    return { from, to, events };
  }
}
