import { InjectDrizzle } from '@nestjs/drizzle';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { roles } from './schema.js';

export type Db = BetterSQLite3Database & { $client: Database };

export const ACTIONS = [
  'view',
  'create',
  'edit',
  'assign',
  'approve',
  'export',
  'close',
  'delete',
] as const;

export const RESOURCES = [
  'master',
  'assets',
  'projects',
  'tickets',
  'purchase',
  'warehouse',
  'accounting',
  'pm',
  'reports',
  'settings',
  'users',
  'roles',
] as const;

const V = ['view'];
const VC = ['view', 'create'];
const VCE = ['view', 'create', 'edit'];
const VCEA = ['view', 'create', 'edit', 'assign'];

function perms(map: Record<string, string[]>): Record<string, Record<string, boolean>> {
  const out: Record<string, Record<string, boolean>> = {};
  for (const resource of RESOURCES) {
    out[resource] = {};
    for (const action of map[resource] ?? []) out[resource][action] = true;
  }
  return out;
}

export const DEFAULT_ROLES = [
  {
    id: 'admin',
    name: 'ผู้ดูแลระบบ',
    isAdmin: true,
    scope: 'all',
    perms: perms(Object.fromEntries(RESOURCES.map((r) => [r, [...ACTIONS]]))),
  },
  {
    id: 'pm',
    name: 'ผู้จัดการโครงการ',
    isAdmin: false,
    scope: 'all',
    perms: perms({
      master: VCE,
      assets: VCE,
      projects: [...VCEA, 'close'],
      tickets: VCEA,
      purchase: VCE,
      warehouse: VCE,
      accounting: VCE,
      pm: VCEA,
      reports: ['view', 'export'],
    }),
  },
  {
    id: 'helpdesk',
    name: 'ศูนย์รับแจ้ง',
    isAdmin: false,
    scope: 'all',
    perms: perms({
      master: V,
      assets: V,
      projects: V,
      tickets: [...VCEA, 'close'],
      warehouse: V,
      pm: V,
      reports: ['view'],
    }),
  },
  {
    id: 'tech',
    name: 'ช่างบริการ/เทคนิค',
    isAdmin: false,
    scope: 'team',
    perms: perms({
      master: V,
      assets: ['view', 'edit'],
      projects: V,
      tickets: ['view', 'edit'],
      warehouse: VC,
      pm: VCE,
      reports: V,
    }),
  },
  {
    id: 'store',
    name: 'พัสดุ/คลัง',
    isAdmin: false,
    scope: 'all',
    perms: perms({
      master: V,
      assets: VCE,
      projects: V,
      tickets: V,
      purchase: V,
      warehouse: [...VCE, 'close'],
      reports: ['view', 'export'],
    }),
  },
  {
    id: 'buyer',
    name: 'จัดซื้อ',
    isAdmin: false,
    scope: 'all',
    perms: perms({
      master: VCE,
      assets: V,
      projects: V,
      purchase: [...VCE, 'close'],
      warehouse: V,
      reports: ['view', 'export'],
    }),
  },
  {
    id: 'exec',
    name: 'ผู้บริหาร (ดู/ส่งออก)',
    isAdmin: false,
    scope: 'all',
    perms: perms({
      master: V,
      assets: V,
      projects: V,
      tickets: V,
      purchase: V,
      warehouse: V,
      accounting: ['view', 'export'],
      pm: V,
      reports: ['view', 'export'],
    }),
  },
];

@Injectable()
export class DatabaseService implements OnModuleInit {
  constructor(@InjectDrizzle() readonly db: Db) {}

  onModuleInit(): void {
    const client = this.db.$client;
    client.pragma('journal_mode = WAL');
    client.pragma('foreign_keys = ON');
    client.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role_id TEXT NOT NULL,
        dept TEXT NOT NULL DEFAULT '',
        team TEXT NOT NULL DEFAULT '',
        project_ids TEXT NOT NULL DEFAULT '[]',
        site_ids TEXT NOT NULL DEFAULT '[]',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        scope TEXT NOT NULL DEFAULT 'all',
        perms TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY,
        entity TEXT NOT NULL,
        code TEXT NOT NULL,
        data TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        deleted_by TEXT,
        deleted_reason TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_by TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_records_entity ON records(entity, deleted);
      CREATE INDEX IF NOT EXISTS idx_records_code ON records(entity, code);
      CREATE TABLE IF NOT EXISTS counters (
        entity TEXT PRIMARY KEY,
        value INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS audit (
        id TEXT PRIMARY KEY,
        at TEXT NOT NULL,
        user_id TEXT,
        user_name TEXT NOT NULL,
        action TEXT NOT NULL,
        entity TEXT,
        record_id TEXT,
        record_code TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL,
        changes TEXT NOT NULL DEFAULT '[]'
      );
      CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit(entity, record_id, at);
      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        at TEXT NOT NULL,
        by TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        entity TEXT NOT NULL,
        record_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        key TEXT NOT NULL,
        title TEXT NOT NULL,
        payload TEXT NOT NULL,
        cfg TEXT NOT NULL,
        decided_by TEXT,
        decided_at TEXT,
        note TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mime TEXT NOT NULL,
        size INTEGER NOT NULL,
        path TEXT NOT NULL,
        uploaded_by TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        at TEXT NOT NULL,
        type TEXT NOT NULL,
        entity TEXT NOT NULL DEFAULT '',
        record_id TEXT,
        code TEXT,
        actor_id TEXT,
        actor_name TEXT,
        summary TEXT NOT NULL DEFAULT '',
        payload TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_events_at ON events(at);
      CREATE TABLE IF NOT EXISTS webhooks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        secret TEXT NOT NULL DEFAULT '',
        events TEXT NOT NULL DEFAULT '[]',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id TEXT PRIMARY KEY,
        webhook_id TEXT NOT NULL,
        event_id TEXT,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT NOT NULL,
        last_error TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        delivered_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_due
        ON webhook_deliveries(status, next_attempt_at);
    `);

    this.db
      .insert(roles)
      .values(DEFAULT_ROLES)
      .onConflictDoNothing()
      .run();
  }
}
