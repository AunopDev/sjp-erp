import { Injectable } from '@nestjs/common';
import { AccessService } from '../common/access.service.js';
import { ApprovalStoreService } from '../common/approvals.service.js';
import { AuditService } from '../common/audit.service.js';
import { bad, notFound } from '../common/exceptions.js';
import type { SafeUser } from '../auth/user.types.js';
import { RecordsService } from '../records/records.service.js';
import { ProjectsService } from './projects.service.js';
import { PurchasingService } from './purchasing.service.js';
import { TicketsService } from './tickets.service.js';

@Injectable()
export class ApprovalDecisionService {
  constructor(
    private readonly approvals: ApprovalStoreService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly records: RecordsService,
    private readonly purchasing: PurchasingService,
    private readonly projects: ProjectsService,
    private readonly tickets: TicketsService,
  ) {}

  list(user: SafeUser) {
    return this.approvals.listFor(user);
  }

  decide(user: SafeUser, id: string, approve: boolean, note: string) {
    const row = this.approvals.find(id);
    if (!row) notFound('ไม่พบคำขออนุมัติ');
    if (row.status !== 'pending') bad('คำขอนี้ถูกพิจารณาแล้ว');
    const cfg = row.cfg as { approverRole?: string; approverUser?: string };
    if (!this.access.isApprover(user, cfg)) bad('คุณไม่มีสิทธิ์อนุมัติคำขอนี้');
    if (!approve && !note.trim()) bad('กรุณาระบุเหตุผลที่ไม่อนุมัติ');

    // Approval authority comes from the workflow configuration, not from the
    // approver's edit rights on the underlying module (e.g. an executive may
    // only have view access but is still the configured approver). Run the
    // approved action as the approver with the edit gate lifted; the original
    // user id is kept so audit trails still show who approved.
    const acting: SafeUser = { ...user, isAdmin: true };

    if (approve) {
      const payload = row.payload as Record<string, unknown>;
      if (row.kind === 'transition') {
        const opts = {
          comment: String(payload['comment'] ?? note ?? ''),
          fields: (payload['fields'] as Record<string, unknown> | undefined) ?? {},
        };
        if (row.entity === 'tickets') this.tickets.status(acting, row.recordId, row.key, opts);
        else this.records.transition(acting, row.entity, row.recordId, row.key, opts);
      } else if (row.kind === 'po-status') {
        this.purchasing.status(acting, row.recordId, row.key, String(payload['comment'] ?? '') || note || '');
      } else if (row.kind === 'project-step') {
        this.projects.transit(acting, row.recordId, String(payload['stepKey'] ?? row.key), 'complete', { reason: note });
      } else {
        bad('ชนิดคำขออนุมัติไม่รองรับ');
      }
    }

    const decided = this.approvals.decide(row, user, approve, note);
    this.audit.log(user, {
      action: 'approval',
      entity: row.entity,
      recordId: row.recordId,
      summary: `${approve ? 'อนุมัติ' : 'ไม่อนุมัติ'} — ${row.title}${note ? ` (${note})` : ''}`,
    });
    return decided;
  }
}
