import { Injectable } from '@nestjs/common';
import type { SafeUser } from '../auth/user.types.js';
import { AccessService } from '../common/access.service.js';
import { projectSteps, WORKFLOWS } from '../meta/entities.js';
import { RecordsService } from '../records/records.service.js';
import { StockService } from './stock.service.js';
import { DashboardService } from './dashboard.service.js';

@Injectable()
export class ReportsService {
  constructor(
    private readonly records: RecordsService,
    private readonly access: AccessService,
    private readonly stock: StockService,
    private readonly dashboard: DashboardService,
  ) {}

  tickets(user: SafeUser) {
    return this.records.all(user, 'tickets').map((t) => ({
      ...t,
      ...this.dashboard.ticketMetrics(t),
      statusLabel: WORKFLOWS.ticket.statuses.find((s) => s.key === t['status'])?.label ?? String(t['status'] ?? ''),
      open: this.dashboard.isOpen(t),
    }));
  }

  projects(user: SafeUser) {
    return this.records.all(user, 'projects').map((project) => {
      const steps = (project['steps'] as Record<string, { status?: string }> | undefined) ?? {};
      const current = projectSteps().find((s) => s.enabled && !['done', 'skipped'].includes(steps[s.key]?.status ?? 'pending'));
      const done = projectSteps().filter((s) => s.enabled && ['done', 'skipped'].includes(steps[s.key]?.status ?? 'pending')).length;
      return {
        ...project,
        stepLabel: project['closed'] ? `ปิดโครงการ: ${String(project['closeReason'] ?? '')}` : current?.label ?? 'ครบทุกขั้นตอน',
        done,
        total: projectSteps().filter((s) => s.enabled).length,
      };
    });
  }

  serials(user: SafeUser) {
    return this.records.all(user, 'serials').map((s) => {
      const end = s['warrantyEnd'] ? new Date(`${String(s['warrantyEnd'])}T00:00:00Z`).getTime() : null;
      const days = end === null ? null : Math.ceil((end - Date.now()) / 86400000);
      return {
        ...s,
        warranty: end === null ? 'ไม่ระบุ' : days! < 0 ? 'หมดประกัน' : days! <= 30 ? 'ใกล้หมด' : 'อยู่ในประกัน',
      };
    });
  }

  stockReport(user: SafeUser) {
    const balances = this.stock.balances();
    const warehouses = this.access.can(user, 'warehouse', 'view') ? this.records.all(user, 'warehouses') : [];
    const items = this.records.all(user, 'items');
    return items.map((item) => {
      const per = Object.fromEntries(warehouses.map((w) => [w.id, balances[String(w.id)]?.[String(item.id)] ?? 0]));
      return {
        ...item,
        per,
        total: Object.values(per).reduce((sum, value) => sum + value, 0),
      };
    });
  }

  boq(user: SafeUser) {
    const projects = this.records.all(user, 'projects');
    const canPurchase = this.access.can(user, 'purchase', 'view');
    const canWarehouse = this.access.can(user, 'warehouse', 'view');
    const canAssets = this.access.can(user, 'assets', 'view');
    const pos = canPurchase ? this.records.rawAll('purchaseOrders') : [];
    const moves = canWarehouse ? this.records.rawAll('stockMoves') : [];
    const serials = canAssets ? this.records.rawAll('serials') : [];
    return projects.flatMap((project) => {
      const lines = Array.isArray(project['boq']) ? (project['boq'] as Record<string, unknown>[]) : [];
      return lines
        .filter((line) => line['item'])
        .map((line) => {
          const itemId = String(line['item']);
          const ordered = pos
            .filter((p) => !p.deleted && p.data['project'] === project.id && p.data['status'] !== 'cancelled')
            .flatMap((p) => (p.data['lines'] as Record<string, unknown>[] | undefined) ?? [])
            .filter((l) => String(l['item'] ?? '') === itemId)
            .reduce((sum, l) => sum + Number(l['qty'] ?? 0), 0);
          const received = moves
            .filter((m) => !m.deleted && m.data['project'] === project.id && m.data['type'] === 'receive' && String(m.data['item'] ?? '') === itemId)
            .reduce((sum, m) => sum + Number(m.data['qty'] ?? 0), 0);
          const issued = moves
            .filter((m) => !m.deleted && m.data['project'] === project.id && m.data['type'] === 'issue' && String(m.data['item'] ?? '') === itemId)
            .reduce((sum, m) => sum + Number(m.data['qty'] ?? 0), 0);
          const installed = serials.filter(
            (s) => !s.deleted && s.data['project'] === project.id && s.data['item'] === itemId && s.data['status'] === 'ติดตั้งแล้ว',
          ).length;
          return {
            id: `${project.id}-${itemId}`,
            projectId: project.id,
            projectCode: project.code,
            item: itemId,
            itemLabel: this.records.labelOf('items', itemId),
            desc: line['desc'] ?? '',
            qty: Number(line['qty'] ?? 0),
            ordered,
            received,
            issued,
            installed,
          };
        });
    });
  }
}

