import { Injectable } from '@nestjs/common';
import { AccessService } from '../common/access.service.js';
import { addDays, nextDue, nowIso, todayStr } from '../common/dates.js';
import { bad } from '../common/exceptions.js';
import { ENTITY_DEFS } from '../meta/entities.js';
import type { SafeUser } from '../auth/user.types.js';
import { RecordsService } from '../records/records.service.js';

interface PmResult {
  label: string;
  result: string;
  note: string;
  action: string;
  ticket: string | null;
}

@Injectable()
export class PmService {
  constructor(
    private readonly records: RecordsService,
    private readonly access: AccessService,
  ) {}

  generate(user: SafeUser, upTo?: string) {
    this.access.require(user, 'pm', 'create');
    const limit = upTo || addDays(todayStr(), 7);
    const floor = addDays(todayStr(), -45);
    const plans = this.records.rawScoped(ENTITY_DEFS['pmPlans'], user);
    let created = 0;
    for (const planRow of plans) {
      const plan = planRow.data;
      if (!planRow.deleted && plan['active'] === false) continue;
      const templateRow = plan['template'] ? this.records.rawGet('pmTemplates', String(plan['template'])) : undefined;
      const items = (templateRow?.data['items'] as { label: string }[] | undefined) ?? [];
      let date = String(plan['startDate'] ?? limit);
      let guard = 0;
      while (date <= limit && guard++ < 5000) {
        if (date >= floor) {
          const exists = this.records
            .rawAll('pmRecords')
            .some((r) => !r.deleted && r.data['plan'] === planRow.id && r.data['dueDate'] === date);
          if (!exists) {
            const results: PmResult[] = items.map((item) => ({
              label: String(item.label ?? ''),
              result: '',
              note: '',
              action: '',
              ticket: null,
            }));
            this.records.create(
              user,
              'pmRecords',
              {},
              {
                system: true,
                actor: user,
                systemFields: {
                  plan: planRow.id,
                  site: plan['site'],
                  customer: plan['customer'],
                  team: plan['team'],
                  assignee: plan['assignee'],
                  dueDate: date,
                  status: 'รอดำเนินการ',
                  templateName: String(templateRow?.data['name'] ?? ''),
                  results,
                },
                summary: `สร้างงาน PM ตามรอบ ${date}`,
              },
            );
            created++;
          }
        }
        date = nextDue(date, String(plan['frequency'] ?? 'รายเดือน'));
      }
    }
    return { created, upTo: limit };
  }

  save(user: SafeUser, id: string, input: { results?: PmResult[]; summary?: string; finish?: boolean }) {
    this.access.require(user, 'pm', 'edit');
    const rec = this.records.get(user, 'pmRecords', id);
    if (rec['status'] === 'เสร็จ') bad('งาน PM นี้เสร็จแล้ว แก้ไขไม่ได้');
    const results = input.results;
    if (!Array.isArray(results)) bad('ไม่พบรายการตรวจ');
    if (input.finish) {
      if (results.some((r) => !r.result)) bad('กรุณาบันทึกผลตรวจให้ครบทุกรายการก่อนปิดงาน');
      const badRow = results.find((r) => r.result === 'ผิดปกติ' && !String(r.note ?? '').trim());
      if (badRow) bad(`รายการ "${badRow.label}" ผิดปกติ ต้องระบุรายละเอียด/วิธีแก้`);
    }
    const patch: Record<string, unknown> = {
      results,
      summary: String(input.summary ?? ''),
      status: input.finish ? 'เสร็จ' : 'กำลังตรวจ',
    };
    if (input.finish) {
      patch['doneAt'] = nowIso();
      patch['doneBy'] = user.id;
    }
    return this.records.patchSystem(user, 'pmRecords', id, patch, `${input.finish ? 'ปิดงาน' : 'บันทึก'} ${String(rec.code)}`);
  }

  saveTemplate(user: SafeUser, id: string | null, input: { name?: string; category?: string; items?: { label: string }[] }) {
    this.access.require(user, 'pm', 'edit');
    const items = (input.items ?? []).filter((i) => String(i.label ?? '').trim());
    if (!items.length) bad('ต้องมีรายการตรวจอย่างน้อย 1 รายการ');
    if (id) {
      const rec = this.records.update(user, 'pmTemplates', id, { name: input.name, category: input.category });
      return this.records.patchSystem(user, 'pmTemplates', id, { items }, `แก้ไขแม่แบบ ${String(rec.code)}`);
    }
    const rec = this.records.create(user, 'pmTemplates', { name: input.name, category: input.category });
    return this.records.patchSystem(user, 'pmTemplates', String(rec.id), { items }, `สร้างแม่แบบ ${rec.code}`);
  }
}

