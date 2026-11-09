import { Injectable } from '@nestjs/common';
import { AccessService } from '../common/access.service.js';
import { nowIso, todayStr } from '../common/dates.js';
import { bad } from '../common/exceptions.js';
import type { SafeUser } from '../auth/user.types.js';
import { RecordsService } from '../records/records.service.js';

export const MOVE_TYPES: Record<string, string> = {
  receive: 'รับเข้า',
  issue: 'เบิกออก',
  transfer: 'โอนย้าย',
  return: 'รับคืน',
  adjust: 'ปรับยอด',
};

export interface MoveInput {
  type: string;
  item: string;
  qty: number | string;
  serials?: string[];
  from?: string | null;
  to?: string | null;
  project?: string | null;
  site?: string | null;
  ticket?: string | null;
  po?: string | null;
  recipient?: string;
  evidence?: unknown[];
  note?: string;
  date?: string;
}

@Injectable()
export class StockService {
  constructor(
    private readonly records: RecordsService,
    private readonly access: AccessService,
  ) {}

  balances(): Record<string, Record<string, number>> {
    const out: Record<string, Record<string, number>> = {};
    for (const move of this.records.rawAll('stockMoves')) {
      const data = move.data;
      const item = String(data['item'] ?? '');
      const qty = Number(data['qty'] ?? 0);
      const from = String(data['from'] ?? '');
      const to = String(data['to'] ?? '');
      if (from) {
        out[from] = out[from] ?? {};
        out[from][item] = (out[from][item] ?? 0) - qty;
      }
      if (to) {
        out[to] = out[to] ?? {};
        out[to][item] = (out[to][item] ?? 0) + qty;
      }
    }
    return out;
  }

  balanceOf(warehouse: string, item: string): number {
    return this.balances()[warehouse]?.[item] ?? 0;
  }

  list(user: SafeUser, query: Record<string, string> = {}) {
    this.access.require(user, 'warehouse', 'view');
    let filters: Record<string, string> = {};
    if (query['filters']) {
      try {
        const parsed = JSON.parse(query['filters']);
        if (parsed && typeof parsed === 'object') filters = parsed as Record<string, string>;
      } catch {
        filters = {};
      }
    }
    return this.records.list(user, 'stockMoves', {
      search: query['search'],
      page: query['page'],
      pageSize: query['pageSize'],
      sort: query['sort'] ?? '-date',
      filters,
    });
  }

  createMove(user: SafeUser, input: MoveInput, options: { system?: boolean; summary?: string } = {}) {
    if (!options.system) this.access.require(user, 'warehouse', 'create');
    const type = String(input.type ?? '');
    if (!MOVE_TYPES[type]) bad('ประเภทรายการไม่ถูกต้อง');
    const itemRow = this.records.rawGet('items', String(input.item ?? ''));
    if (!itemRow || itemRow.deleted) bad('กรุณาเลือกสินค้า');
    const item = itemRow.data;
    const qty = Number(input.qty);
    if (!Number.isFinite(qty) || qty <= 0) bad('จำนวนต้องมากกว่า 0');
    if (item['trackSerial'] && !Number.isInteger(qty)) bad('สินค้าที่ติดตาม Serial ต้องเป็นจำนวนเต็ม');

    const serials = (input.serials ?? []).filter(Boolean);
    if (item['trackSerial'] && serials.length !== qty) {
      bad(`ต้องระบุ Serial Number ให้ครบ ${qty} รายการ (ระบุแล้ว ${serials.length})`);
    }
    if (new Set(serials).size !== serials.length) bad('Serial ซ้ำกันในรายการ');
    if (['issue', 'transfer'].includes(type) && !input.from) bad('กรุณาเลือกคลังต้นทาง');
    if (['receive', 'transfer', 'return'].includes(type) && !input.to) bad('กรุณาเลือกคลังปลายทาง');
    if (type === 'transfer' && input.from === input.to) bad('คลังต้นทางและปลายทางต้องต่างกัน');
    if (type === 'issue' && !(input.project || input.site || input.ticket)) {
      bad('การเบิกต้องอ้างอิงโครงการ ไซต์ หรือ Ticket อย่างน้อยหนึ่งอย่าง');
    }
    if (type === 'adjust' && !String(input.note ?? '').trim()) bad('การปรับยอดต้องระบุเหตุผล');
    if (type === 'adjust' && !input.from && !input.to) bad('เลือกคลังที่ปรับยอด');
    if (type === 'adjust' && item['trackSerial']) bad('ปรับยอดสินค้าที่ติดตาม Serial ทำไม่ได้ — ใช้รับเข้า/เบิก/รับคืนแทน');
    if (input.from) {
      const have = this.balanceOf(String(input.from), String(input.item));
      if (qty > have) bad(`ยอดคงเหลือไม่พอ (มี ${have} ต้องการ ${qty})`);
    }

    const serialRows = serials.map((sid) => {
      const row = this.records.rawGet('serials', sid);
      if (!row || row.deleted) bad('ไม่พบ Serial ที่เลือก');
      if (String(row.data['item'] ?? '') !== String(input.item)) bad('Serial ไม่ตรงกับสินค้า');
      if (['issue', 'transfer'].includes(type) && String(row.data['warehouse'] ?? '') !== String(input.from)) {
        bad(`Serial ${String(row.data['serialNo'] ?? '')} ไม่ได้อยู่ในคลังต้นทาง`);
      }
      return row;
    });

    const project = input.project ? this.records.rawGet('projects', String(input.project)) : undefined;
    const site =
      input.site
        ? this.records.rawGet('sites', String(input.site))
        : project?.data['site']
          ? this.records.rawGet('sites', String(project.data['site']))
          : undefined;

    const move = this.records.create(
      user,
      'stockMoves',
      {},
      {
        system: true,
        actor: user,
        systemFields: {
          type,
          item: input.item,
          qty,
          serials,
          from: input.from || null,
          to: input.to || null,
          project: input.project || null,
          site: input.site || null,
          ticket: input.ticket || null,
          po: input.po || null,
          recipient: input.recipient ?? '',
          evidence: input.evidence ?? [],
          note: input.note ?? '',
          date: input.date || nowIso(),
        },
        summary: options.summary ?? `${MOVE_TYPES[type]} ${String(item['name'] ?? '')} จำนวน ${qty}`,
      },
    );

    for (const row of serialRows) {
      const data = { ...row.data };
      const history = [...((data['history'] as Record<string, unknown>[] | undefined) ?? [])];
      const ref = { entity: 'stockMoves', id: move.id };
      if (type === 'receive' || type === 'return') {
        data['warehouse'] = input.to;
        data['status'] = 'ในคลัง';
        data['receivedDate'] = data['receivedDate'] || todayStr();
        history.push({ id: crypto.randomUUID(), at: nowIso(), by: user.id, type, text: `${MOVE_TYPES[type]}เข้า ${this.records.labelOf('warehouses', String(input.to))} (${move.code})`, ref });
      } else if (type === 'transfer') {
        data['warehouse'] = input.to;
        history.push({ id: crypto.randomUUID(), at: nowIso(), by: user.id, type, text: `โอนจาก ${this.records.labelOf('warehouses', String(input.from))} ไป ${this.records.labelOf('warehouses', String(input.to))} (${move.code})`, ref });
      } else if (type === 'issue') {
        data['warehouse'] = null;
        data['status'] = 'ส่งออกไปหน้างาน';
        if (input.project) data['project'] = input.project;
        if (site) {
          data['site'] = site.id;
          data['customer'] = data['customer'] || site.data['customer'];
        }
        history.push({
          id: crypto.randomUUID(),
          at: nowIso(),
          by: user.id,
          type,
          text: `เบิกไป ${input.project ? this.records.labelOf('projects', String(input.project)) : ''} ${site ? this.records.labelOf('sites', site.id) : ''} ${input.ticket ? `(Ticket ${this.records.labelOf('tickets', String(input.ticket))})` : ''} ผู้รับ: ${input.recipient || '–'} (${move.code})`,
          ref,
        });
      }
      data['history'] = history;
      this.records.patchSystem(user, 'serials', row.id, data, `อัปเดต Serial ${String(data['serialNo'] ?? '')} จาก ${move.code}`);
    }

    return move;
  }

  receiveManual(
    user: SafeUser,
    input: { item: string; qty: number | string; to: string; serialNos?: string[]; note?: string; recipient?: string; evidence?: unknown[] },
  ) {
    this.access.require(user, 'warehouse', 'create');
    const item = this.records.rawGet('items', input.item);
    if (!item || item.deleted) bad('กรุณาเลือกสินค้า');
    if (!input.to) bad('กรุณาเลือกคลังปลายทาง');
    let qty = Number(input.qty);
    const ids: string[] = [];
    if (item.data['trackSerial']) {
      const numbers = (input.serialNos ?? []).map((n) => String(n).trim()).filter(Boolean);
      if (!numbers.length) bad('กรุณาระบุ Serial Number');
      qty = numbers.length;
      for (const serialNo of numbers) {
        const created = this.records.create(
          user,
          'serials',
          { serialNo, item: item.id, status: 'ในคลัง', warehouse: input.to, receivedDate: todayStr() },
          { system: true, actor: user, summary: `รับเข้า Serial ${serialNo}` },
        );
        ids.push(String(created.id));
      }
    }
    return this.createMove(
      user,
      { type: 'receive', item: input.item, qty, serials: ids, to: input.to, note: input.note || 'รับเข้าโดยไม่มี PO', recipient: input.recipient, evidence: input.evidence },
      { system: true, summary: `รับเข้า ${String(item.data['name'] ?? '')} จำนวน ${qty}` },
    );
  }

  moveTypes() {
    return MOVE_TYPES;
  }
}

