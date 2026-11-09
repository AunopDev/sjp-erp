import { InjectDrizzle } from '@nestjs/drizzle';
import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/database.service.js';
import { counters, records, users } from '../db/schema.js';
import type { SafeUser } from '../auth/user.types.js';
import { AccessService } from '../common/access.service.js';
import { ApprovalStoreService } from '../common/approvals.service.js';
import { AuditService } from '../common/audit.service.js';
import { nowIso, isDateOnly } from '../common/dates.js';
import { FieldValidationError, bad, notFound } from '../common/exceptions.js';
import { EventsService } from '../events/events.service.js';
import { getEntity, ENTITY_DEFS, LISTS, projectSteps, ENTITY_WORKFLOW_KEY, WORKFLOWS, type EntityDef, type FieldDef } from '../meta/entities.js';

export interface ListQuery {
  search?: string;
  page?: number | string;
  pageSize?: number | string;
  sort?: string;
  filters?: Record<string, string>;
}

export interface CreateOptions {
  system?: boolean;
  actor?: SafeUser | null;
  systemFields?: Record<string, unknown>;
  summary?: string;
}

export interface UpdateOptions {
  system?: boolean;
  actor?: SafeUser | null;
  summary?: string;
  changes?: unknown[];
}

export type RawRecord = typeof records.$inferSelect;
export type DecoratedRecord = Record<string, unknown> & {
  id: string;
  code: string;
  _createdAt: string;
  _updatedAt: string;
  _deleted: boolean;
  _labels: Record<string, string>;
  _rowLabels: Record<string, Array<Record<string, string>>>;
};

const isEmpty = (value: unknown): boolean =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

const SEARCHABLE: FieldDef['type'][] = ['text', 'textarea', 'select', 'email', 'phone', 'url'];

@Injectable()
export class RecordsService {
  constructor(
    @InjectDrizzle() private readonly db: Db,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalStoreService,
    private readonly events: EventsService,
  ) {}

  // ---------- reads ----------

  all(user: SafeUser, entityKey: string, options: { includeDeleted?: boolean } = {}): DecoratedRecord[] {
    const def = this.access.requireEntity(user, entityKey, 'view');
    return this.rawScoped(def, user, options.includeDeleted ?? false).map((row) => this.decorate(def, row));
  }

  rawAll(entityKey: string, includeDeleted = false): RawRecord[] {
    const def = getEntity(entityKey);
    if (!def) notFound('ไม่พบชนิดข้อมูล');
    const where = includeDeleted
      ? eq(records.entity, entityKey)
      : and(eq(records.entity, entityKey), eq(records.deleted, false));
    return this.db.select().from(records).where(where).all();
  }

  rawGet(entityKey: string, id: string): RawRecord | undefined {
    return this.db
      .select()
      .from(records)
      .where(and(eq(records.entity, entityKey), eq(records.id, id)))
      .all()[0];
  }

  list(user: SafeUser, entityKey: string, query: ListQuery = {}) {
    const def = this.access.requireEntity(user, entityKey, 'view');
    let rows = this.rawScoped(def, user, false).map((row) => this.decorate(def, row));

    const filters = query.filters ?? {};
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === '') continue;
      rows = rows.filter((row) => String(row[key] ?? '') === String(value));
    }

    const search = String(query.search ?? '').trim().toLowerCase();
    if (search) {
      const fields = def.fields.filter((f) => SEARCHABLE.includes(f.type));
      rows = rows.filter((row) => {
        const hay = [
          row.code,
          ...fields.map((f) => row[f.key]),
          ...Object.values(row._labels ?? {}),
        ];
        return hay.some((value) => value !== undefined && String(value).toLowerCase().includes(search));
      });
    }

    const sort = String(query.sort || '-_createdAt');
    const desc = sort.startsWith('-');
    const key = sort.replace(/^-/, '');
    rows = [...rows].sort((a, b) => {
      const x = a[key];
      const y = b[key];
      if (x === undefined || x === null || x === '') return 1;
      if (y === undefined || y === null || y === '') return -1;
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * (desc ? -1 : 1);
      return String(x).localeCompare(String(y), 'th', { numeric: true }) * (desc ? -1 : 1);
    });

    const pageSize = Math.min(Math.max(Number(query.pageSize) || 50, 1), 500);
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    const page = Math.min(Math.max(Number(query.page) || 1, 1), pages);
    return {
      total: rows.length,
      page,
      pageSize,
      items: rows.slice((page - 1) * pageSize, page * pageSize),
    };
  }

  get(user: SafeUser, entityKey: string, id: string): DecoratedRecord {
    const def = this.access.requireEntity(user, entityKey, 'view');
    const row = this.rawGet(entityKey, id);
    if (!row) notFound('ไม่พบรายการ');
    this.access.requireSee(user, def, row);
    return this.decorate(def, row);
  }

  rawScoped(def: EntityDef, user: SafeUser, includeDeleted = false): RawRecord[] {
    return this.rawAll(def.key, includeDeleted).filter((row) =>
      includeDeleted ? true : this.access.canSee(user, def, row),
    );
  }

  // ---------- writes ----------

  create(user: SafeUser, entityKey: string, values: Record<string, unknown>, options: CreateOptions = {}): DecoratedRecord {
    const def = getEntity(entityKey);
    if (!def) notFound('ไม่พบชนิดข้อมูล');
    if (!options.system) this.access.requireEntity(user, entityKey, 'create');
    if (def.system && !options.system) bad('ข้อมูลชนิดนี้สร้างได้จากขั้นตอนของระบบเท่านั้น');

    const data = this.sanitize(def, values);
    for (const [key, value] of Object.entries(this.defaultsFor(def))) {
      if (data[key] === undefined || data[key] === '') data[key] = value;
    }
    Object.assign(data, options.systemFields ?? {});
    this.validate(def, data, user, null);
    this.validateBusiness(def, data, null);

    const now = nowIso();
    const code = this.nextCode(def);
    const row: typeof records.$inferInsert = {
      id: crypto.randomUUID(),
      entity: def.key,
      code,
      data,
      deleted: false,
      createdBy: options.actor?.id ?? user?.id ?? null,
      createdAt: now,
      updatedBy: options.actor?.id ?? user?.id ?? null,
      updatedAt: now,
    };
    this.db.insert(records).values(row).run();
    const decorated = this.decorate(def, row as RawRecord);
    this.audit.log(options.actor ?? user, {
      action: 'create',
      entity: def.key,
      recordId: row.id,
      recordCode: code,
      summary: options.summary ?? `สร้าง${def.label} ${code}`,
    });
    this.events.publish({
      type: 'record.created',
      entity: def.key,
      recordId: row.id,
      code,
      actor: options.actor ?? user,
      summary: options.summary ?? `สร้าง${def.label} ${code}`,
      payload: { title: def.title === 'code' ? code : String(decorated[def.title] ?? '') },
    });
    return decorated;
  }

  update(
    user: SafeUser,
    entityKey: string,
    id: string,
    changes: Record<string, unknown>,
    options: UpdateOptions = {},
  ): DecoratedRecord {
    const def = getEntity(entityKey);
    if (!def) notFound('ไม่พบชนิดข้อมูล');
    if (!options.system) this.access.requireEntity(user, entityKey, 'edit');
    if (def.system && !options.system) bad('ข้อมูลชนิดนี้แก้ไขได้จากขั้นตอนของระบบเท่านั้น');
    const row = this.rawGet(entityKey, id);
    if (!row) notFound('ไม่พบรายการ');
    if (row.deleted) bad('รายการนี้ถูกยกเลิก/ซ่อนแล้ว');
    if (!options.system) this.access.requireSee(user, def, row);

    const before = { ...row.data };
    const next = { ...row.data, ...this.sanitize(def, changes) };
    this.validate(def, next, user, id);
    this.validateBusiness(def, next, id);
    const now = nowIso();
    this.db
      .update(records)
      .set({ data: next, updatedAt: now, updatedBy: options.actor?.id ?? user.id })
      .where(eq(records.id, id))
      .run();

    const after = this.decorate(def, { ...row, data: next, updatedAt: now } as RawRecord);
    const diff = options.changes ?? this.diff(def, before, next);
    if (diff.length) {
      this.audit.log(options.actor ?? user, {
        action: 'update',
        entity: def.key,
        recordId: id,
        recordCode: row.code,
        summary: options.summary ?? `แก้ไข${def.label} ${row.code}`,
        changes: diff,
      });
      this.events.publish({
        type: 'record.updated',
        entity: def.key,
        recordId: id,
        code: row.code,
        actor: options.actor ?? user,
        summary: options.summary ?? `แก้ไข${def.label} ${row.code}`,
        payload: { changes: diff.slice(0, 20) },
      });
    }
    return after;
  }

  /** Internal write for workflow/system fields (status, timeline, steps) — skips field whitelist. */
  patchSystem(
    actor: SafeUser | null,
    entityKey: string,
    id: string,
    patch: Record<string, unknown>,
    summary: string,
    changes: unknown[] = [],
  ): DecoratedRecord {
    const def = getEntity(entityKey);
    if (!def) notFound('ไม่พบชนิดข้อมูล');
    const row = this.rawGet(entityKey, id);
    if (!row) notFound('ไม่พบรายการ');
    const next = { ...row.data, ...patch };
    const now = nowIso();
    this.db
      .update(records)
      .set({ data: next, updatedAt: now, updatedBy: actor?.id ?? null })
      .where(eq(records.id, id))
      .run();
    this.audit.log(actor, {
      action: 'update',
      entity: def.key,
      recordId: id,
      recordCode: row.code,
      summary,
      changes,
    });
    this.events.publish({
      type: 'record.updated',
      entity: def.key,
      recordId: id,
      code: row.code,
      actor,
      summary,
      payload: { changes: changes.slice(0, 20) },
    });
    return this.decorate(def, { ...row, data: next, updatedAt: now } as RawRecord);
  }

  transition(
    user: SafeUser,
    entityKey: string,
    id: string,
    to: string,
    opts: { comment?: string; fields?: Record<string, unknown> } = {},
  ): DecoratedRecord {
    const def = this.access.requireEntity(user, entityKey, 'edit');
    const row = this.rawGet(entityKey, id);
    if (!row) notFound('ไม่พบรายการ');
    this.access.requireSee(user, def, row);
    if (row.deleted) bad('รายการนี้ถูกยกเลิก/ซ่อนแล้ว');
    const workflowKey = ENTITY_WORKFLOW_KEY[entityKey] ?? entityKey;
    const workflow = (WORKFLOWS as Record<string, { statuses?: { key: string; label: string; next?: string[]; requiredFields?: string[]; final?: boolean; enabled?: boolean; needClosePerm?: boolean; approverRole?: string; approverUser?: string }[] }>)[workflowKey];
    if (!workflow?.statuses?.length) bad('รายการนี้ไม่มี workflow สถานะ');
    const from = workflow.statuses.find((status) => status.key === String(row.data['status'] ?? ''));
    const target = workflow.statuses.find((status) => status.key === to);
    if (!target || target.enabled === false) bad('สถานะปลายทางไม่ถูกต้อง');
    if (from?.key === target.key) bad('อยู่ในสถานะนี้แล้ว');
    const allowed = !from || !!from.next?.includes(target.key);
    const reopen = !!from?.final && !target.final;
    if (from && !allowed && !reopen) bad(`ไม่สามารถเปลี่ยนจาก "${from.label ?? '–'}" เป็น "${target.label}"`);
    if (reopen && !String(opts.comment ?? '').trim()) bad('การเปิดรายการที่จบแล้วต้องระบุเหตุผล');
    if (reopen) this.access.require(user, def.resource, 'close');
    if (target.needClosePerm) this.access.require(user, def.resource, 'close');
    const fields = this.sanitize(def, opts.fields ?? {});
    const merged = { ...row.data, ...fields };
    for (const key of target.requiredFields ?? []) {
      if (isEmpty(merged[key])) {
        const label = def.fields.find((field) => field.key === key)?.label ?? key;
        bad(`ต้องกรอก "${label}" ก่อนเปลี่ยนเป็น "${target.label}"`);
      }
    }
    if ((target.approverRole || target.approverUser) && !this.access.isApprover(user, target)) {
      const request = this.approvals.create(user, {
        entity: entityKey,
        recordId: id,
        kind: 'transition',
        key: target.key,
        title: `${def.label} ${row.code}: ${from?.label ?? '–'} → ${target.label}`,
        payload: { to: target.key, fields, comment: opts.comment ?? '' },
        approverRole: target.approverRole,
        approverUser: target.approverUser,
      });
      return { ...this.get(user, entityKey, id), _pendingApproval: request };
    }
    const now = nowIso();
    const timeline = [...((row.data['timeline'] as Record<string, unknown>[] | undefined) ?? [])];
    timeline.push({ id: crypto.randomUUID(), at: now, by: user.id, type: 'status', text: `${from?.label ?? '–'} → ${target.label}${opts.comment ? ` — ${opts.comment}` : ''}` });
    return this.patchSystem(
      user,
      entityKey,
      id,
      { ...fields, status: target.key, timeline },
      `เปลี่ยนสถานะ ${row.code}: ${from?.label ?? '–'} → ${target.label}`,
      [{ field: 'สถานะ', from: from?.key, to: target.key }],
    );
  }

  related(user: SafeUser, entityKey: string, id: string) {
    const def = this.access.requireEntity(user, entityKey, 'view');
    const record = this.rawGet(entityKey, id);
    if (!record) notFound('ไม่พบรายการ');
    this.access.requireSee(user, def, record);
    const groups: Array<{
      entity: string;
      label: string;
      field: string;
      records: Array<{ id: string; code: string; title: string }>;
    }> = [];
    for (const other of Object.values(ENTITY_DEFS)) {
      if (other.key === entityKey) continue;
      if (!this.access.canEntity(user, other.key, 'view')) continue;
      const fields = other.fields.filter((field) => field.type === 'ref' && field.ref === entityKey && !field.hidden);
      if (!fields.length) continue;
      let rows;
      try {
        rows = this.rawScoped(other, user);
      } catch {
        continue;
      }
      for (const field of fields) {
        const linked = rows
          .filter((row) => !row.deleted && String(row.data[field.key] ?? '') === id)
          .slice(0, 20)
          .map((row) => {
            const refField = other.fields.find((item) => item.type === 'ref' && item.ref && row.data[item.key]);
            const refTitle = refField ? this.labelOf(refField.ref ?? '', String(row.data[refField.key] ?? '')) : '';
            const rawTitle =
              other.title === 'code'
                ? refTitle && !refTitle.startsWith('(') ? refTitle : row.code
                : row.data[other.title] ?? row.data[other.fields.find((item) => item.type === 'text')?.key ?? ''] ?? row.code;
            return { id: row.id, code: row.code, title: String(rawTitle) };
          });
        if (linked.length) groups.push({ entity: other.key, label: other.label, field: field.label, records: linked });
      }
    }
    return { entity: entityKey, id, groups };
  }

  approvalsForRecord(user: SafeUser, entityKey: string, id: string) {    const def = this.access.requireEntity(user, entityKey, 'view');
    const row = this.rawGet(entityKey, id);
    if (!row) notFound('ไม่พบรายการ');
    this.access.requireSee(user, def, row);
    return this.approvals.pendingForRecord(entityKey, id);
  }

  archive(user: SafeUser, entityKey: string, id: string, reason: string): DecoratedRecord {
    const def = this.access.requireEntity(user, entityKey, 'delete');
    const row = this.rawGet(entityKey, id);
    if (!row) notFound('ไม่พบรายการ');
    this.access.requireSee(user, def, row);
    if (!reason?.trim()) bad('ต้องระบุเหตุผล');
    const now = nowIso();
    this.db
      .update(records)
      .set({ deleted: true, deletedAt: now, deletedBy: user.id, deletedReason: reason.trim(), updatedAt: now, updatedBy: user.id })
      .where(eq(records.id, id))
      .run();
    const decorated = this.decorate(def, { ...row, deleted: true, deletedAt: now, deletedReason: reason.trim() } as RawRecord);
    this.audit.log(user, {
      action: 'archive',
      entity: def.key,
      recordId: id,
      recordCode: row.code,
      summary: `ยกเลิก/ซ่อน ${def.label} — ${reason.trim()}`,
    });
    this.events.publish({
      type: 'record.deleted',
      entity: def.key,
      recordId: id,
      code: row.code,
      actor: user,
      summary: `ยกเลิก/ซ่อน ${def.label} ${row.code}`,
      payload: { reason: reason.trim() },
    });
    return decorated;
  }

  restore(user: SafeUser, entityKey: string, id: string): DecoratedRecord {
    const def = this.access.requireEntity(user, entityKey, 'delete');
    const row = this.rawGet(entityKey, id);
    if (!row) notFound('ไม่พบรายการ');
    this.access.requireSee(user, def, row);
    const now = nowIso();
    this.db
      .update(records)
      .set({ deleted: false, deletedAt: null, deletedBy: null, deletedReason: null, updatedAt: now, updatedBy: user.id })
      .where(eq(records.id, id))
      .run();
    const decorated = this.decorate(def, { ...row, deleted: false, deletedAt: null, deletedReason: null } as RawRecord);
    this.audit.log(user, {
      action: 'restore',
      entity: def.key,
      recordId: id,
      recordCode: row.code,
      summary: `กู้คืน ${def.label}`,
    });
    this.events.publish({
      type: 'record.restored',
      entity: def.key,
      recordId: id,
      code: row.code,
      actor: user,
      summary: `กู้คืน ${def.label} ${row.code}`,
    });
    return decorated;
  }

  /** Existence check used by references; respects scope when a user is supplied. */
  refExists(entityKey: string, id: string, user?: SafeUser | null): boolean {
    if (entityKey === 'users') {
      const row = this.db.select().from(users).where(eq(users.id, id)).all()[0];
      return !!row && row.active;
    }
    const def = getEntity(entityKey);
    if (!def) return false;
    const row = this.rawGet(entityKey, id);
    if (!row || row.deleted) return false;
    return !user || this.access.canSee(user, def, row);
  }

  labelOf(entityKey: string, id: string): string {
    if (entityKey === 'users') {
      const user = this.db.select().from(users).where(eq(users.id, id)).all()[0];
      return user?.name ?? '(ไม่พบ)';
    }
    const def = getEntity(entityKey);
    if (!def) return '(ไม่พบ)';
    const row = this.rawGet(entityKey, id);
    if (!row) return '(ไม่พบ)';
    if (def.title === 'code' || !row.data[def.title]) return row.code;
    return String(row.data[def.title]);
  }

  // ---------- decoration / defaults ----------

  private decorate(def: EntityDef, row: RawRecord): DecoratedRecord {
    const data = { ...row.data };
    const labels: Record<string, string> = {};
    const rowLabels: Record<string, Array<Record<string, string>>> = {};
    for (const field of def.fields) {
      if (field.type === 'ref' && typeof data[field.key] === 'string' && data[field.key]) {
        labels[field.key] = this.labelOf(field.ref ?? '', data[field.key] as string);
      }
      if (field.type === 'rows' && Array.isArray(data[field.key])) {
        rowLabels[field.key] = (data[field.key] as Record<string, unknown>[]).map((line) => {
          const map: Record<string, string> = {};
          for (const col of field.cols ?? []) {
            if (col.type === 'ref' && typeof line[col.key] === 'string' && line[col.key]) {
              map[col.key] = this.labelOf(col.ref ?? '', line[col.key] as string);
            }
          }
          return map;
        });
      }
    }
    return {
      ...data,
      id: row.id,
      code: row.code,
      _createdAt: row.createdAt,
      _updatedAt: row.updatedAt,
      _createdBy: row.createdBy,
      _updatedBy: row.updatedBy,
      _createdByName: row.createdBy ? this.labelOf('users', row.createdBy) : 'ระบบ',
      _updatedByName: row.updatedBy ? this.labelOf('users', row.updatedBy) : 'ระบบ',
      _deleted: row.deleted,
      _deleteReason: row.deletedReason,
      _labels: labels,
      _rowLabels: rowLabels,
    };
  }

  private defaultsFor(def: EntityDef): Record<string, unknown> {
    if (def.key === 'tickets') {
      return { status: 'received', timeline: [], appointments: [], parts: [] };
    }
    if (def.key === 'purchaseOrders') return { status: 'draft' };
    if (def.key === 'projects') {
      const steps: Record<string, unknown> = {};
      for (const step of projectSteps()) steps[step.key] = { status: 'pending', values: {}, docs: {}, log: [] };
      return { steps, closed: false };
    }
    if (def.key === 'items') return { trackSerial: false };
    if (def.key === 'pmPlans') return { active: true };
    if (def.key === 'serials') return { status: 'ในคลัง' };
    const workflowKey = ENTITY_WORKFLOW_KEY[def.key] ?? def.key;
    const workflow = (WORKFLOWS as Record<string, { statuses?: { key: string; enabled?: boolean }[] }>)[workflowKey];
    if (workflow?.statuses?.length) {
      return { status: workflow.statuses.find((status) => status.enabled !== false)?.key ?? workflow.statuses[0].key };
    }
    return {};
  }

  private nextCode(def: EntityDef): string {
    const row = this.db.select().from(counters).where(eq(counters.entity, def.key)).all()[0];
    const value = (row?.value ?? 0) + 1;
    if (row) this.db.update(counters).set({ value }).where(eq(counters.entity, def.key)).run();
    else this.db.insert(counters).values({ entity: def.key, value }).run();
    return `${def.prefix}-${String(value).padStart(4, '0')}`;
  }

  private sanitize(def: EntityDef, values: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const field of def.fields) {
      if (field.readOnly || field.type === 'section' || field.type === 'formula') continue;
      if (!Object.prototype.hasOwnProperty.call(values, field.key)) continue;
      out[field.key] = this.coerce(field, values[field.key]);
    }
    return out;
  }

  private coerce(field: FieldDef, value: unknown): unknown {
    if (value === undefined) return undefined;
    if (value === null || value === '') return '';
    switch (field.type) {
      case 'number': {
        const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
        return Number.isFinite(n) ? n : value;
      }
      case 'boolean':
        return value === true || value === 'true' || value === 1 || value === '1';
      case 'multiselect':
        return Array.isArray(value) ? value.map(String) : [String(value)];
      case 'rows':
        return Array.isArray(value)
          ? value.map((line) => this.coerceRow(field, (line ?? {}) as Record<string, unknown>))
          : value;
      case 'file':
        return Array.isArray(value) ? value : [value];
      case 'text':
      case 'email':
      case 'phone':
      case 'url':
        return typeof value === 'string' ? value.trim() : String(value);
      case 'textarea':
      case 'select':
      case 'ref':
      case 'date':
      case 'datetime':
        return typeof value === 'string' ? value : String(value);
      default:
        return value;
    }
  }

  private coerceRow(field: FieldDef, line: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const col of field.cols ?? []) {
      if (!Object.prototype.hasOwnProperty.call(line, col.key)) continue;
      out[col.key] = this.coerce(col as FieldDef, line[col.key]);
    }
    return out;
  }

  // ---------- validation ----------

  private optionsOf(field: FieldDef): string[] {
    if (field.optionsFrom === 'teams') return LISTS.teams;
    if (field.optionsFrom === 'depts') return LISTS.depts;
    return field.options ?? [];
  }

  private visible(field: FieldDef, data: Record<string, unknown>): boolean {
    if (field.hidden || field.type === 'section' || field.type === 'formula') return false;
    return !field.showIf || data[field.showIf.field] === field.showIf.value;
  }

  private validateBusiness(def: EntityDef, data: Record<string, unknown>, selfId: string | null): void {
    const number = (value: unknown): number => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    if (def.key === 'invoices') {
      const subtotal = number(data['subtotal']);
      const vat = number(data['vat']);
      const total = number(data['total']);
      if (subtotal < 0 || vat < 0 || total < 0) bad('จำนวนเงินในใบแจ้งหนี้ต้องไม่ติดลบ');
      if (Math.abs(total - (subtotal + vat)) > 0.01) {
        bad(`ยอดรวมสุทธิ (${total}) ต้องเท่ากับยอดก่อน VAT + VAT (${subtotal + vat})`);
      }
      const issue = String(data['issueDate'] ?? '');
      const due = String(data['dueDate'] ?? '');
      if (issue && due && due < issue) bad('วันครบกำหนดชำระต้องไม่ก่อนวันที่ออกเอกสาร');
    }
    if (def.key === 'receipts') {
      const amount = number(data['amount']);
      if (amount <= 0) bad('จำนวนเงินรับชำระต้องมากกว่า 0');
      const invoiceId = String(data['invoice'] ?? '');
      const invoice = invoiceId ? this.rawGet('invoices', invoiceId) : undefined;
      if (!invoice || invoice.deleted) bad('ไม่พบใบแจ้งหนี้ที่อ้างอิง');
      const invoiceTotal = number(invoice.data['total']);
      const paid = this.rawAll('receipts')
        .filter((row) => !row.deleted && row.id !== selfId && String(row.data['invoice'] ?? '') === invoiceId)
        .reduce((sum, row) => sum + number(row.data['amount']), 0);
      if (paid + amount - invoiceTotal > 0.01) {
        bad(`รับชำระเกินยอดใบแจ้งหนี้ (คงเหลือ ${Math.max(0, invoiceTotal - paid)})`);
      }
    }
    if (def.key === 'expenses' && number(data['amount']) < 0) {
      bad('จำนวนเงินค่าใช้จ่ายต้องไม่ติดลบ');
    }
  }

  private validate(def: EntityDef, data: Record<string, unknown>, user: SafeUser, selfId: string | null): void {    const errors: Record<string, string> = {};
    for (const field of def.fields) {
      if (!this.visible(field, data)) continue;
      const value = data[field.key];
      const label = field.label;
      if (
        field.required &&
        (isEmpty(value) ||
          (field.type === 'rows' &&
            (!Array.isArray(value) ||
              !value.some((line) => Object.values(line as Record<string, unknown>).some((x) => !isEmpty(x))))))
      ) {
        errors[field.key] = `กรุณากรอก "${label}"`;
        continue;
      }
      if (value === '' || value === undefined || value === null) continue;
      switch (field.type) {
        case 'number': {
          const n = Number(value);
          if (!Number.isFinite(n)) errors[field.key] = `"${label}" ต้องเป็นตัวเลข`;
          else if (n < 0 && field.key !== 'lat' && field.key !== 'lng') errors[field.key] = `"${label}" ต้องไม่ติดลบ`;
          break;
        }
        case 'date':
          if (!isDateOnly(value)) errors[field.key] = `"${label}" ไม่ใช่วันที่ที่ถูกต้อง (YYYY-MM-DD)`;
          break;
        case 'datetime':
          if (Number.isNaN(new Date(String(value)).getTime())) errors[field.key] = `"${label}" ไม่ใช่วันเวลาที่ถูกต้อง`;
          break;
        case 'email':
          if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[field.key] = `"${label}" ไม่ใช่อีเมลที่ถูกต้อง`;
          break;
        case 'select': {
          const options = this.optionsOf(field);
          if (options.length && !options.includes(String(value))) errors[field.key] = `"${label}" เลือกค่าที่ไม่อยู่ในรายการ`;
          break;
        }
        case 'multiselect': {
          const options = this.optionsOf(field);
          const list = Array.isArray(value) ? value : [];
          if (options.length && list.some((v) => !options.includes(String(v)))) errors[field.key] = `"${label}" มีค่าที่ไม่อยู่ในรายการ`;
          break;
        }
        case 'ref':
          if (!this.refExists(field.ref ?? '', String(value), user)) errors[field.key] = `"${label}" ไม่พบรายการที่เลือก`;
          break;
        case 'rows': {
          const lines = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
          for (let i = 0; i < lines.length; i++) {
            for (const col of field.cols ?? []) {
              const line = lines[i];
              const raw = line[col.key];
              if (col.required && isEmpty(raw)) {
                errors[field.key] = `"${label}" แถวที่ ${i + 1}: กรุณากรอก "${col.label}"`;
                break;
              }
              if (raw === '' || raw === undefined || raw === null) continue;
              if (col.type === 'number') {
                const n = Number(raw);
                if (!Number.isFinite(n) || n < 0) {
                  errors[field.key] = `"${label}" แถวที่ ${i + 1}: "${col.label}" ต้องเป็นตัวเลขไม่ติดลบ`;
                  break;
                }
              }
              if (col.type === 'select' && col.options?.length && !col.options.includes(String(raw))) {
                errors[field.key] = `"${label}" แถวที่ ${i + 1}: "${col.label}" เลือกค่าที่ไม่อยู่ในรายการ`;
                break;
              }
              if (col.type === 'ref' && !this.refExists(col.ref ?? '', String(raw), user)) {
                errors[field.key] = `"${label}" แถวที่ ${i + 1}: ไม่พบ "${col.label}"`;
                break;
              }
            }
            if (errors[field.key]) break;
          }
          break;
        }
        default:
          break;
      }
      if (errors[field.key]) continue;
      if (field.unique && value !== undefined) {
        const dup = this.rawAll(def.key).find(
          (row) =>
            !row.deleted &&
            row.id !== selfId &&
            String(row.data[field.key] ?? '').trim().toLowerCase() === String(value).trim().toLowerCase(),
        );
        if (dup) errors[field.key] = `"${label}" ซ้ำกับรายการ ${dup.code}`;
      }
    }
    // Cross-document consistency: the site belongs to the selected customer.
    if (['tickets', 'projects', 'pmPlans', 'serials'].includes(def.key)) {
      const siteId = typeof data['site'] === 'string' ? data['site'] : '';
      const customerId = typeof data['customer'] === 'string' ? data['customer'] : '';
      if (siteId && customerId) {
        const site = this.rawGet('sites', siteId);
        const siteCustomer = site?.data['customer'];
        if (siteCustomer && siteCustomer !== customerId) {
          errors['site'] = `ไซต์ที่เลือกไม่ได้อยู่ในลูกค้ารายนี้ (ลูกค้าของไซต์: ${this.labelOf('customers', String(siteCustomer))})`;
        }
      }
    }

    const keys = Object.keys(errors);
    if (keys.length) {
      throw new FieldValidationError(errors[keys[0]] + (keys.length > 1 ? ` (และอีก ${keys.length - 1} ข้อ)` : ''), errors);
    }
  }

  private diff(def: EntityDef, before: Record<string, unknown>, after: Record<string, unknown>): unknown[] {
    const out: unknown[] = [];
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (key.startsWith('_') || key === 'timeline' || key === 'steps') continue;
      if (JSON.stringify(before[key] ?? null) === JSON.stringify(after[key] ?? null)) continue;
      out.push({
        field: def.fields.find((f) => f.key === key)?.label ?? key,
        from: before[key] ?? null,
        to: after[key] ?? null,
      });
    }
    return out;
  }
}
