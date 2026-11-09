import { InjectDrizzle } from '@nestjs/drizzle';
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/database.service.js';
import { approvals, audit, counters, events, records, roles, settings, users, webhookDeliveries, webhooks } from '../db/schema.js';
import type { SafeUser } from '../auth/user.types.js';
import { AccessService } from '../common/access.service.js';
import { AuditService } from '../common/audit.service.js';
import { nowIso } from '../common/dates.js';
import { bad } from '../common/exceptions.js';
import { FilesService } from '../files/files.service.js';
import { ENTITY_DEFS } from '../meta/entities.js';
import { MetadataService } from '../meta/metadata.service.js';

interface BackupPayload {
  app: string;
  version: number;
  exportedAt: string;
  users: unknown[];
  roles: unknown[];
  records: unknown[];
  counters: unknown[];
  audit: unknown[];
  settings: unknown[];
  approvals: unknown[];
  events?: unknown[];
  files?: unknown[];
  webhooks?: unknown[];
  webhookDeliveries?: unknown[];
}

@Injectable()
export class BackupService {
  constructor(
    @InjectDrizzle() private readonly db: Db,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly metadata: MetadataService,
    private readonly files: FilesService,
  ) {}

  exportAll(user: SafeUser) {
    this.access.require(user, 'settings', 'edit');
    return {
      app: 'sjp-erp',
      version: 1,
      exportedAt: nowIso(),
      users: this.db.select().from(users).all(),
      roles: this.db.select().from(roles).all(),
      records: this.db.select().from(records).all(),
      counters: this.db.select().from(counters).all(),
      audit: this.db.select().from(audit).all(),
      settings: this.db.select().from(settings).all(),
      approvals: this.db.select().from(approvals).all(),
      events: this.db.select().from(events).all(),
      files: this.files.exportAll(),
      webhooks: this.db.select().from(webhooks).all(),
      webhookDeliveries: this.db.select().from(webhookDeliveries).all(),
    } satisfies BackupPayload;
  }

  restore(user: SafeUser, payload: BackupPayload | undefined, confirm: string) {
    this.access.require(user, 'settings', 'edit');
    if (confirm !== 'RESTORE') bad('ต้องพิมพ์ RESTORE เพื่อยืนยันการกู้คืนข้อมูล');
    if (!payload || payload.app !== 'sjp-erp' || !Array.isArray(payload.users) || !payload.users.length) {
      bad('ไฟล์สำรองไม่ถูกต้องหรือไม่มีข้อมูลผู้ใช้');
    }
    const tables = ['users', 'roles', 'records', 'counters', 'audit', 'settings', 'approvals'] as const;
    for (const key of tables) {
      if (!Array.isArray(payload[key])) bad(`ไฟล์สำรองขาดส่วน ${key}`);
    }
    const adminRoles = new Set(
      (payload.roles as { id?: unknown; isAdmin?: unknown }[])
        .filter((role) => role?.isAdmin === true)
        .map((role) => String(role.id ?? '')),
    );
    const hasActiveAdmin = (payload.users as { roleId?: unknown; active?: unknown }[]).some(
      (user) => user?.active !== false && adminRoles.has(String(user?.roleId ?? '')),
    );
    if (!hasActiveAdmin) bad('ไฟล์สำรองต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน');

    this.db.transaction((tx) => {
      tx.delete(approvals).run();
      tx.delete(events).run();
      tx.delete(webhookDeliveries).run();
      tx.delete(webhooks).run();
      tx.delete(records).run();
      tx.delete(counters).run();
      tx.delete(audit).run();
      tx.delete(settings).run();
      tx.delete(users).run();
      tx.delete(roles).run();

      if (payload.roles.length) tx.insert(roles).values(payload.roles as (typeof roles.$inferInsert)[]).run();
      if (payload.users.length) tx.insert(users).values(payload.users as (typeof users.$inferInsert)[]).run();
      if (payload.records.length) tx.insert(records).values(payload.records as (typeof records.$inferInsert)[]).run();
      if (payload.counters.length) tx.insert(counters).values(payload.counters as (typeof counters.$inferInsert)[]).run();
      if (payload.settings.length) tx.insert(settings).values(payload.settings as (typeof settings.$inferInsert)[]).run();
      if (payload.approvals.length) tx.insert(approvals).values(payload.approvals as (typeof approvals.$inferInsert)[]).run();
      if (Array.isArray(payload.events) && payload.events.length) {
        tx.insert(events).values(payload.events as (typeof events.$inferInsert)[]).run();
      }
      if (Array.isArray(payload.webhooks) && payload.webhooks.length) {
        tx.insert(webhooks).values(payload.webhooks as (typeof webhooks.$inferInsert)[]).run();
      }
      if (Array.isArray(payload.webhookDeliveries) && payload.webhookDeliveries.length) {
        tx.insert(webhookDeliveries).values(payload.webhookDeliveries as (typeof webhookDeliveries.$inferInsert)[]).run();
      }
      if (payload.audit.length) tx.insert(audit).values(payload.audit as (typeof audit.$inferInsert)[]).run();
    });

    const restoredFiles = Array.isArray(payload.files) ? this.files.restoreAll(payload.files) : 0;
    this.metadata.reload();
    this.audit.log(user, { action: 'restore', entity: 'settings', summary: 'กู้คืนข้อมูลจากไฟล์สำรอง' });
    return {
      ok: true,
      users: payload.users.length,
      records: payload.records.length,
      settings: payload.settings.length,
      approvals: payload.approvals.length,
      events: payload.events?.length ?? 0,
      files: restoredFiles,
      webhooks: payload.webhooks?.length ?? 0,
    };
  }

  legacyImport(user: SafeUser, state: unknown, confirm: string) {
    this.access.require(user, 'settings', 'edit');
    if (confirm !== 'IMPORT') bad('ต้องพิมพ์ IMPORT เพื่อยืนยันการนำเข้าข้อมูล');
    if (!state || typeof state !== 'object') bad('ข้อมูลจาก React เดิมไม่ถูกต้อง');
    const root = state as Record<string, unknown>;
    const data = (root['data'] && typeof root['data'] === 'object' ? root['data'] : root) as Record<string, unknown>;
    const allowed = new Set(Object.keys(ENTITY_DEFS));
    const imported: Record<string, number> = {};
    const skipped: Record<string, number> = {};
    const codesByEntity = new Map<string, string[]>();
    const now = nowIso();

    this.db.transaction((tx) => {
      for (const [entity, value] of Object.entries(data)) {
        if (!Array.isArray(value)) continue;
        if (!allowed.has(entity)) {
          skipped[entity] = value.length;
          continue;
        }
        const rows: (typeof records.$inferInsert)[] = [];
        const codes: string[] = [];
        for (const item of value) {
          if (!item || typeof item !== 'object') continue;
          const raw = item as Record<string, unknown>;
          const id = String(raw['id'] ?? crypto.randomUUID());
          const code = String(raw['code'] ?? '').trim() || `IMP-${id.slice(0, 8)}`;
          const recordData = Object.fromEntries(
            Object.entries(raw).filter(([key]) => key !== 'id' && key !== 'code' && !key.startsWith('_')),
          );
          rows.push({
            id,
            entity,
            code,
            data: recordData,
            deleted: raw['_deleted'] === true,
            deletedAt: raw['_deletedAt'] ? String(raw['_deletedAt']) : null,
            deletedBy: raw['_deletedBy'] ? String(raw['_deletedBy']) : null,
            deletedReason: raw['_deletedReason'] ? String(raw['_deletedReason']) : null,
            createdBy: raw['_createdBy'] ? String(raw['_createdBy']) : user.id,
            createdAt: raw['_createdAt'] ? String(raw['_createdAt']) : now,
            updatedBy: raw['_updatedBy'] ? String(raw['_updatedBy']) : user.id,
            updatedAt: raw['_updatedAt'] ? String(raw['_updatedAt']) : now,
          });
          codes.push(code);
        }
        for (let index = 0; index < rows.length; index += 50) {
          tx.insert(records).values(rows.slice(index, index + 50)).onConflictDoNothing().run();
        }
        imported[entity] = rows.length;
        codesByEntity.set(entity, codes);
      }

      for (const [entity, codes] of codesByEntity) {
        let max = 0;
        for (const code of codes) {
          const match = code.match(/(\d+)\s*$/);
          if (match) max = Math.max(max, Number(match[1]));
        }
        const value = max || codes.length;
        const existing = tx.select().from(counters).where(eq(counters.entity, entity)).all()[0];
        if (existing) tx.update(counters).set({ value }).where(eq(counters.entity, entity)).run();
        else tx.insert(counters).values({ entity, value }).run();
      }
    });

    const total = Object.values(imported).reduce((sum, count) => sum + count, 0);
    this.audit.log(user, {
      action: 'import',
      entity: 'settings',
      summary: `นำเข้าข้อมูลจาก React เดิม ${total} รายการ`,
    });
    return { ok: true, imported, skipped, total };
  }
}
