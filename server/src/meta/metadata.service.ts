import { InjectDrizzle } from '@nestjs/drizzle';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/database.service.js';
import { records, roles, settings, approvals } from '../db/schema.js';
import { bad, notFound } from '../common/exceptions.js';
import {
  DEFAULT_ENTITY_DEFS,
  DEFAULT_LISTS,
  DEFAULT_RESOURCE_LABELS,
  DEFAULT_WORKFLOWS,
  ENTITY_DEFS,
  LISTS,
  RESOURCE_LABELS,
  WORKFLOWS,
  ENTITY_WORKFLOW_KEY,
  WORKFLOW_ENTITY_KEY,
  type EntityDef,
  type FieldDef,
  type ProjectStepDef,
} from './entities.js';

const SETTINGS_KEY = 'metadata';
const FIELD_TYPES = new Set([
  'text', 'textarea', 'number', 'date', 'datetime', 'select', 'multiselect', 'boolean',
  'ref', 'file', 'rows', 'formula', 'section', 'email', 'phone', 'url',
]);
const KEY = /^[a-zA-Z][A-Za-z0-9_]*$/;

export interface StoredMetadata {
  entities: Record<string, EntityDef>;
  workflows: Record<string, unknown>;
  lists: { teams: string[]; depts: string[] };
}

export interface RoleInput {
  name?: string;
  scope?: string;
  perms?: Record<string, Record<string, boolean>>;
}

@Injectable()
export class MetadataService implements OnApplicationBootstrap {
  constructor(@InjectDrizzle() private readonly db: Db) {}

  onApplicationBootstrap(): void {
    this.apply(this.read());
  }

  reload(): void {
    this.apply(this.read());
  }

  config() {
    return {
      entities: Object.fromEntries(
        Object.entries(ENTITY_DEFS).map(([key, def]) => [
          key,
          { ...def, workflowKey: ENTITY_WORKFLOW_KEY[key] ?? def.key },
        ]),
      ) as Record<string, EntityDef>,
      workflows: JSON.parse(JSON.stringify(WORKFLOWS)) as Record<string, unknown>,
      lists: JSON.parse(JSON.stringify(LISTS)) as { teams: string[]; depts: string[] },
      resources: { ...RESOURCE_LABELS },
    };
  }

  saveEntity(input: EntityDef, roleIds: string[] = []): EntityDef {
    if (!input || typeof input !== 'object') bad('ข้อมูลโมดูลไม่ถูกต้อง');
    const key = String(input.key ?? '').trim();
    if (!KEY.test(key)) bad('key ของโมดูลต้องเป็นภาษาอังกฤษ/ตัวเลข/ขีดล่าง และขึ้นต้นด้วยตัวอักษร');
    if (!String(input.label ?? '').trim()) bad('กรุณากรอกชื่อโมดูล/เอกสาร');
    const existing = ENTITY_DEFS[key];
    if (!existing && WORKFLOW_ENTITY_KEY[key]) bad(`key "${key}" เป็นชื่อสงวนของ workflow ระบบ`);
    if (existing?.system) bad('ข้อมูลระบบนี้แก้ไขโครงสร้างไม่ได้');
    if (existing && !existing.custom && input.custom) bad('ไม่สามารถเปลี่ยนโมดูลระบบเป็นโมดูลที่สร้างเองได้');
    if (existing && existing.custom === false && input.custom === false && input.resource !== existing.resource) {
      bad('ไม่สามารถเปลี่ยน resource ของโมดูลระบบได้');
    }

    const prefix = String(input.prefix ?? existing?.prefix ?? 'DOC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (!/^[A-Z][A-Z0-9]{0,7}$/.test(prefix || '')) bad('prefix ต้องเป็นตัวพิมพ์ใหญ่/ตัวเลข 1–8 ตัว');
    const fields = this.normalizeFields(input.fields ?? [], key);
    if (!fields.length) bad('โมดูลต้องมีอย่างน้อย 1 ฟิลด์');
    const title = String(input.title ?? existing?.title ?? fields.find((f) => f.type === 'text')?.key ?? 'name');
    if (title !== 'code' && !fields.some((f) => f.key === title)) bad(`ฟิลด์ชื่อรายการ "${title}" ไม่มีอยู่`);
    const workflowKey = ENTITY_WORKFLOW_KEY[key] ?? key;
    const hasWorkflow = !!((WORKFLOWS as Record<string, { statuses?: unknown[] }>)[workflowKey]?.statuses?.length);
    const allowedColumn = (column: string) =>
      column === 'code' ||
      column === 'stepLabel' ||
      (column === 'status' && hasWorkflow) ||
      fields.some((f) => f.key === column);
    const cols = (input.cols ?? existing?.cols ?? ['code', title]).filter(allowedColumn);
    const filters = (input.filters ?? existing?.filters ?? []).filter(allowedColumn);

    if (existing) {
      const oldKeys = new Set(existing.fields.map((f) => f.key));
      const newKeys = new Set(fields.map((f) => f.key));
      for (const fieldKey of oldKeys) {
        if (!newKeys.has(fieldKey) && this.fieldHasData(key, fieldKey)) {
          bad(`ลบฟิลด์ "${existing.fields.find((f) => f.key === fieldKey)?.label ?? fieldKey}" ไม่ได้ เพราะมีข้อมูลอยู่ — ใช้การซ่อนแทน`);
        }
      }
    }

    const isCustom = existing ? !!existing.custom : true;
    const resource = existing ? existing.resource : key;
    const def: EntityDef = {
      key,
      label: String(input.label).trim(),
      resource,
      prefix: prefix || 'DOC',
      title,
      cols: cols.length ? cols : ['code', title],
      filters,
      fields,
      scoped: input.scoped ?? existing?.scoped ?? false,
      custom: isCustom,
      system: existing?.system ?? false,
    };
    ENTITY_DEFS[key] = def;
    RESOURCE_LABELS[resource] = def.label;

    const stored = this.read();
    stored.entities[key] = JSON.parse(JSON.stringify(def));
    this.write(stored);

    if (isCustom && roleIds.length) {
      for (const roleId of roleIds) {
        const role = this.db.select().from(roles).where(eq(roles.id, roleId)).all()[0];
        if (!role) continue;
        const perms = { ...role.perms, [key]: { view: true, create: true, edit: true } };
        this.db.update(roles).set({ perms }).where(eq(roles.id, roleId)).run();
      }
    }
    return def;
  }

  renameField(entityKey: string, fromInput: unknown, toInput: unknown) {
    const def = ENTITY_DEFS[entityKey];
    if (!def) notFound('ไม่พบโมดูล');
    if (def.system) bad('ข้อมูลระบบนี้แก้ไขโครงสร้างไม่ได้');
    const from = String(fromInput ?? '').trim();
    const to = String(toInput ?? '').trim();
    const field = def.fields.find((item) => item.key === from);
    if (!field) notFound(`ไม่พบฟิลด์ "${from}"`);
    if (!KEY.test(to)) bad('key ใหม่ต้องเป็นภาษาอังกฤษ/ตัวเลข/ขีดล่าง และขึ้นต้นด้วยตัวอักษร');
    if (from === to) bad('key ใหม่ต้องต่างจาก key เดิม');
    if (def.fields.some((item) => item.key === to)) bad(`key "${to}" ถูกใช้อยู่แล้วในโมดูลนี้`);

    const rows = this.db.select().from(records).where(eq(records.entity, entityKey)).all();
    const hasValue = (value: unknown) => value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && !value.length);
    if (rows.some((row) => hasValue(row.data[to]))) bad(`key "${to}" มีข้อมูลเดิมอยู่แล้ว จึงเปลี่ยนทับไม่ได้`);

    let migrated = 0;
    this.db.transaction((tx) => {
      for (const row of rows) {
        if (!Object.prototype.hasOwnProperty.call(row.data, from)) continue;
        const data = { ...row.data, [to]: row.data[from] };
        delete data[from];
        tx.update(records).set({ data }).where(eq(records.id, row.id)).run();
        migrated++;
      }
    });

    const fields = def.fields.map((item) => {
      if (item.key === from) {
        return {
          ...item,
          key: to,
          formula: item.formula ? String(item.formula).split(`{${from}}`).join(`{${to}}`) : item.formula,
        };
      }
      const next: FieldDef = { ...item };
      if (next.showIf?.field === from) next.showIf = { ...next.showIf, field: to };
      if (next.formula) next.formula = String(next.formula).split(`{${from}}`).join(`{${to}}`);
      return next;
    });
    const updated: EntityDef = {
      ...def,
      fields,
      title: def.title === from ? to : def.title,
      cols: def.cols.map((column) => (column === from ? to : column)),
      filters: def.filters.map((column) => (column === from ? to : column)),
    };
    ENTITY_DEFS[entityKey] = updated;

    for (const row of this.db.select().from(approvals).where(eq(approvals.entity, entityKey)).all()) {
      const payload = row.payload as Record<string, unknown>;
      const fields = payload['fields'];
      if (!fields || typeof fields !== 'object' || Array.isArray(fields)) continue;
      const map = fields as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(map, from)) continue;
      const nextFields = { ...map, [to]: map[from] };
      delete nextFields[from];
      this.db.update(approvals).set({ payload: { ...payload, fields: nextFields } }).where(eq(approvals.id, row.id)).run();
    }

    const stored = this.read();
    stored.entities[entityKey] = JSON.parse(JSON.stringify(updated));

    const workflowKey = ENTITY_WORKFLOW_KEY[entityKey] ?? entityKey;
    const workflow = (WORKFLOWS as Record<string, { statuses?: { requiredFields?: string[] }[] } | undefined>)[workflowKey];
    if (workflow?.statuses?.length) {
      for (const status of workflow.statuses) {
        if (Array.isArray(status.requiredFields)) {
          status.requiredFields = status.requiredFields.map((key) => (key === from ? to : key));
        }
      }
      stored.workflows[workflowKey] = JSON.parse(JSON.stringify(workflow));
    }

    this.write(stored);
    return { entity: updated, from, to, migrated };
  }

  deleteEntity(key: string): void {
    const def = ENTITY_DEFS[key];
    if (!def) notFound('ไม่พบโมดูล');
    if (!def.custom) bad('ลบได้เฉพาะโมดูลที่สร้างเอง — โมดูลระบบใช้การซ่อน/ปิดใช้งานแทน');
    const count = this.db.select().from(records).where(eq(records.entity, key)).all().filter((r) => !r.deleted).length;
    if (count) bad(`ลบโมดูลไม่ได้ เพราะมีข้อมูล ${count} รายการ`);
    delete ENTITY_DEFS[key];
    delete RESOURCE_LABELS[key];
    delete (WORKFLOWS as Record<string, unknown>)[key];
    const stored = this.read();
    delete stored.entities[key];
    delete stored.workflows[key];
    this.write(stored);
    for (const role of this.db.select().from(roles).all()) {
      if (role.perms[key]) {
        const perms = { ...role.perms };
        delete perms[key];
        this.db.update(roles).set({ perms }).where(eq(roles.id, role.id)).run();
      }
    }
  }

  saveWorkflow(key: string, workflow: unknown): unknown {
    const entityKey = WORKFLOW_ENTITY_KEY[key] ?? key;
    const def = ENTITY_DEFS[entityKey];
    if (!def) notFound('ไม่พบโมดูล');
    if (key === 'project') return this.saveProjectWorkflow(workflow as { steps?: ProjectStepDef[] });
    const wf = workflow as { confirmed?: boolean; statuses?: Record<string, unknown>[] };
    const statuses = Array.isArray(wf?.statuses) ? wf.statuses : [];
    if (!statuses.length) bad('workflow ต้องมีอย่างน้อย 1 สถานะ');
    const keys = new Set<string>();
    const normalized = statuses.map((raw) => {
      const statusKey = String(raw['key'] ?? '').trim();
      if (!KEY.test(statusKey)) bad(`key สถานะ "${statusKey}" ไม่ถูกต้อง`);
      if (keys.has(statusKey)) bad(`key สถานะ "${statusKey}" ซ้ำ`);
      keys.add(statusKey);
      return {
        key: statusKey,
        label: String(raw['label'] ?? statusKey),
        color: String(raw['color'] ?? 'gray'),
        next: Array.isArray(raw['next']) ? raw['next'].map(String) : [],
        requiredFields: Array.isArray(raw['requiredFields']) ? raw['requiredFields'].map(String) : [],
        enabled: raw['enabled'] !== false,
        final: !!raw['final'],
        needClosePerm: !!raw['needClosePerm'],
        approverRole: String(raw['approverRole'] ?? ''),
        approverUser: String(raw['approverUser'] ?? ''),
      };
    });
    for (const status of normalized) {
      for (const next of status.next) if (!keys.has(next)) bad(`สถานะ "${status.label}" ชี้ไปสถานะถัดไป "${next}" ที่ไม่มี`);
      for (const field of status.requiredFields) if (!def.fields.some((f) => f.key === field)) bad(`ฟิลด์บังคับ "${field}" ไม่มีในโมดูล`);
    }
    const old = (WORKFLOWS as Record<string, { statuses?: { key: string }[] }>)[key];
    for (const status of old?.statuses ?? []) {
      if (!keys.has(status.key) && this.statusHasData(entityKey, status.key)) bad(`ลบสถานะ "${status.key}" ไม่ได้ เพราะมีข้อมูลใช้งานอยู่`);
    }
    const previous = ((WORKFLOWS as Record<string, unknown>)[key] ?? {}) as Record<string, unknown>;
    const incoming = wf as Record<string, unknown>;
    const { confirmed, statuses: _incomingStatuses, ...extra } = incoming;
    void _incomingStatuses;
    const savedWorkflow = { ...previous, ...extra, confirmed: !!confirmed, statuses: normalized };
    (WORKFLOWS as Record<string, unknown>)[key] = savedWorkflow;
    const stored = this.read();
    stored.workflows[key] = JSON.parse(JSON.stringify(savedWorkflow));
    this.write(stored);
    return (WORKFLOWS as Record<string, unknown>)[key];
  }

  saveProjectWorkflow(workflow: { steps?: ProjectStepDef[]; confirmed?: boolean }): unknown {
    const steps = Array.isArray(workflow?.steps) ? workflow.steps : [];
    if (!steps.length) bad('workflow โครงการต้องมีอย่างน้อย 1 ขั้นตอน');
    const keys = new Set<string>();
    const normalized = steps.map((raw) => {
      const key = String(raw.key ?? '').trim();
      if (!KEY.test(key)) bad(`key ขั้นตอน "${key}" ไม่ถูกต้อง`);
      if (keys.has(key)) bad(`key ขั้นตอน "${key}" ซ้ำ`);
      keys.add(key);
      return {
        key,
        label: String(raw.label ?? key),
        desc: String(raw.desc ?? ''),
        fields: this.normalizeFields(Array.isArray(raw.fields) ? raw.fields : [], 'project', false),
        docs: Array.isArray(raw.docs) ? raw.docs.map((d) => ({ key: String(d.key ?? ''), label: String(d.label ?? '') })) : [],
        enabled: raw.enabled !== false,
        requireDocs: !!raw.requireDocs,
        approvalRequired: !!raw.approvalRequired,
        approverRole: String(raw.approverRole ?? ''),
        approverUser: String(raw.approverUser ?? ''),
        source: raw.source ?? 'document',
      };
    });
    const old = WORKFLOWS.project.steps;
    for (const step of old) {
      if (!keys.has(step.key) && this.projectStepUsed(step.key)) bad(`ลบขั้นตอน "${step.label}" ไม่ได้ เพราะมีข้อมูลโครงการใช้งานอยู่`);
    }
    WORKFLOWS.project = { confirmed: !!workflow['confirmed'], steps: normalized as ProjectStepDef[] };
    const stored = this.read();
    stored.workflows['project'] = JSON.parse(JSON.stringify(WORKFLOWS.project));
    this.write(stored);
    return WORKFLOWS.project;
  }

  saveLists(input: { teams?: string[]; depts?: string[] }): { teams: string[]; depts: string[] } {
    const teams = (Array.isArray(input.teams) ? input.teams : LISTS.teams).map((s) => String(s).trim()).filter(Boolean);
    const depts = (Array.isArray(input.depts) ? input.depts : LISTS.depts).map((s) => String(s).trim()).filter(Boolean);
    LISTS.teams = [...new Set(teams)];
    LISTS.depts = [...new Set(depts)];
    const stored = this.read();
    stored.lists = { teams: LISTS.teams, depts: LISTS.depts };
    this.write(stored);
    return stored.lists;
  }

  resetEntity(key: string): void {
    const stored = this.read();
    delete stored.entities[key];
    this.write(stored);
    this.apply(stored);
  }

  saveRole(id: string, input: RoleInput): unknown {
    const role = this.db.select().from(roles).where(eq(roles.id, id)).all()[0];
    if (!role) notFound('ไม่พบบทบาท');
    if (role.isAdmin && input.perms) bad('บทบาทผู้ดูแลระบบแก้ไขสิทธิ์ไม่ได้');
    const next = {
      name: input.name !== undefined ? String(input.name).trim() : role.name,
      scope: input.scope ?? role.scope,
      perms: input.perms ?? role.perms,
    };
    if (!next.name) bad('กรุณากรอกชื่อบทบาท');
    if (!['all', 'dept', 'team', 'project', 'site', 'own'].includes(next.scope)) bad('ขอบเขตข้อมูลไม่ถูกต้อง');
    this.db.update(roles).set(next).where(eq(roles.id, id)).run();
    return { ...role, ...next };
  }

  private read(): StoredMetadata {
    const empty: StoredMetadata = { entities: {}, workflows: {}, lists: { ...DEFAULT_LISTS } };
    const row = this.db.select().from(settings).where(eq(settings.key, SETTINGS_KEY)).all()[0];
    if (!row) return empty;
    try {
      const parsed = row.value as Partial<StoredMetadata>;
      return {
        entities: parsed.entities && typeof parsed.entities === 'object' ? parsed.entities : {},
        workflows: parsed.workflows && typeof parsed.workflows === 'object' ? parsed.workflows : {},
        lists: {
          teams: Array.isArray(parsed.lists?.teams) ? parsed.lists!.teams : [...DEFAULT_LISTS.teams],
          depts: Array.isArray(parsed.lists?.depts) ? parsed.lists!.depts : [...DEFAULT_LISTS.depts],
        },
      };
    } catch {
      return empty;
    }
  }

  private write(stored: StoredMetadata): void {
    const value = JSON.stringify(stored);
    const row = this.db.select().from(settings).where(eq(settings.key, SETTINGS_KEY)).all()[0];
    if (row) this.db.update(settings).set({ value: stored }).where(eq(settings.key, SETTINGS_KEY)).run();
    else this.db.insert(settings).values({ key: SETTINGS_KEY, value: stored }).run();
    void value;
  }

  private apply(stored: StoredMetadata): void {
    for (const key of Object.keys(ENTITY_DEFS)) {
      if (!DEFAULT_ENTITY_DEFS[key]) delete ENTITY_DEFS[key];
    }
    for (const [key, def] of Object.entries(DEFAULT_ENTITY_DEFS)) ENTITY_DEFS[key] = JSON.parse(JSON.stringify(def));
    for (const [key, def] of Object.entries(stored.entities)) ENTITY_DEFS[key] = JSON.parse(JSON.stringify(def));

    for (const key of Object.keys(WORKFLOWS)) delete (WORKFLOWS as Record<string, unknown>)[key];
    Object.assign(WORKFLOWS, JSON.parse(JSON.stringify(DEFAULT_WORKFLOWS)));
    for (const [key, wf] of Object.entries(stored.workflows)) (WORKFLOWS as Record<string, unknown>)[key] = JSON.parse(JSON.stringify(wf));

    for (const key of Object.keys(RESOURCE_LABELS)) delete RESOURCE_LABELS[key];
    Object.assign(RESOURCE_LABELS, DEFAULT_RESOURCE_LABELS);
    for (const def of Object.values(ENTITY_DEFS)) RESOURCE_LABELS[def.resource] = def.label;

    LISTS.teams = [...stored.lists.teams];
    LISTS.depts = [...stored.lists.depts];
  }

  private normalizeFields(fields: FieldDef[], entityKey: string, requireLabel = true): FieldDef[] {
    const out: FieldDef[] = [];
    const keys = new Set<string>();
    for (const raw of fields) {
      const key = String(raw.key ?? '').trim();
      if (!KEY.test(key)) bad(`key ฟิลด์ "${key}" ไม่ถูกต้อง`);
      if (keys.has(key)) bad(`key ฟิลด์ "${key}" ซ้ำ`);
      keys.add(key);
      const type = String(raw.type ?? 'text') as FieldDef['type'];
      if (!FIELD_TYPES.has(type)) bad(`ชนิดฟิลด์ "${type}" ไม่รองรับ`);
      if (requireLabel && !String(raw.label ?? '').trim()) bad(`กรุณากรอกชื่อฟิลด์ "${key}"`);
      if (raw.required && raw.hidden) bad(`ฟิลด์ "${raw.label || key}" บังคับและซ่อนพร้อมกันไม่ได้`);
      const optionsFrom = raw.optionsFrom === 'teams' || raw.optionsFrom === 'depts' ? raw.optionsFrom : undefined;
      if (type === 'select' && !(raw.options ?? []).length && !optionsFrom) bad(`ฟิลด์ "${raw.label || key}" ต้องมีตัวเลือก`);
      if (type === 'ref' && !raw.ref) bad(`ฟิลด์ "${raw.label || key}" ต้องเลือกปลายทาง`);
      if (type === 'ref' && raw.ref !== 'users' && !ENTITY_DEFS[raw.ref ?? '']) bad(`ฟิลด์ "${raw.label || key}" ชี้ไปโมดูล "${raw.ref}" ที่ไม่มี`);
      if (type === 'rows' && !(raw.cols ?? []).length) bad(`ฟิลด์ "${raw.label || key}" ต้องมีคอลัมน์`);
      out.push({
        ...raw,
        key,
        label: String(raw.label ?? key),
        type,
        required: !!raw.required,
        hidden: !!raw.hidden,
        options: type === 'select' || type === 'multiselect' ? (raw.options ?? []).map(String) : undefined,
        optionsFrom,
        cols: type === 'rows' ? (raw.cols ?? []).map((c) => ({ ...c, key: String(c.key ?? ''), label: String(c.label ?? c.key ?? '') })) : undefined,
        showIf: raw.showIf?.field ? { field: String(raw.showIf.field), value: raw.showIf.value } : undefined,
      });
    }
    for (const field of out) {
      if (field.showIf && !out.some((f) => f.key === field.showIf!.field)) bad(`เงื่อนไขแสดงผลของ "${field.label}" ชี้ไปฟิลด์ที่ไม่มี`);
    }
    void entityKey;
    return out;
  }

  private fieldHasData(entity: string, field: string): boolean {
    return this.db
      .select()
      .from(records)
      .where(eq(records.entity, entity))
      .all()
      .filter((row) => !row.deleted)
      .some((row) => {
        const value = row.data[field];
        return value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && !value.length);
      });
  }

  private statusHasData(entity: string, status: string): boolean {
    return this.db
      .select()
      .from(records)
      .where(eq(records.entity, entity))
      .all()
      .filter((row) => !row.deleted)
      .some((row) => row.data['status'] === status);
  }

  private projectStepUsed(key: string): boolean {
    return this.db
      .select()
      .from(records)
      .where(eq(records.entity, 'projects'))
      .all()
      .some((row) => {
        const step = (row.data['steps'] as Record<string, { status?: string; values?: Record<string, unknown> }> | undefined)?.[key];
        return !!step && (step.status !== 'pending' || Object.keys(step.values ?? {}).length > 0);
      });
  }
}
