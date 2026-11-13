import { InjectDrizzle } from '@nestjs/drizzle';
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/database.service.js';
import { settings } from '../db/schema.js';
import type { SafeUser } from '../auth/user.types.js';
import { bad } from './exceptions.js';
import { nowIso } from './dates.js';

export interface WorkspaceWidgetPosition {
  x: number;
  y: number;
  w: number;
  z: number;
}

export interface WorkspaceConfig {
  version: number;
  widgets: Record<string, WorkspaceWidgetPosition>;
  hidden: string[];
  updatedAt: string;
}

const KEY_PREFIX = 'workspace:';
const KEY_PATTERN = /^[a-z0-9-]{1,40}$/;
const MAX_WIDGETS = 60;
const MAX_BYTES = 64_000;

const clamp = (value: unknown, min: number, max: number): number => {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
};

const empty = (): WorkspaceConfig => ({ version: 1, widgets: {}, hidden: [], updatedAt: '' });

@Injectable()
export class WorkspaceService {
  constructor(@InjectDrizzle() private readonly db: Db) {}

  private key(user: SafeUser): string {
    return `${KEY_PREFIX}${user.id}`;
  }

  get(user: SafeUser): WorkspaceConfig {
    const row = this.db.select().from(settings).where(eq(settings.key, this.key(user))).all()[0];
    if (!row) return empty();
    return this.sanitize(row.value, false);
  }

  save(user: SafeUser, input: unknown): WorkspaceConfig {
    const safe = this.sanitize(input, true);
    safe.updatedAt = nowIso();
    const value = safe as unknown;
    const existing = this.db.select().from(settings).where(eq(settings.key, this.key(user))).all()[0];
    if (existing) this.db.update(settings).set({ value }).where(eq(settings.key, this.key(user))).run();
    else this.db.insert(settings).values({ key: this.key(user), value }).run();
    return safe;
  }

  reset(user: SafeUser): WorkspaceConfig {
    this.db.delete(settings).where(eq(settings.key, this.key(user))).run();
    return empty();
  }

  private sanitize(input: unknown, strict: boolean): WorkspaceConfig {
    if (!input || typeof input !== 'object') {
      if (strict) bad('รูปแบบการจัดหน้าจอไม่ถูกต้อง');
      return empty();
    }
    const source = input as { version?: unknown; widgets?: unknown; hidden?: unknown; updatedAt?: unknown };
    const widgets: Record<string, WorkspaceWidgetPosition> = {};
    if (source.widgets && typeof source.widgets === 'object') {
      const entries = Object.entries(source.widgets as Record<string, unknown>).slice(0, MAX_WIDGETS);
      for (const [key, raw] of entries) {
        if (!KEY_PATTERN.test(key) || !raw || typeof raw !== 'object') continue;
        const position = raw as { x?: unknown; y?: unknown; w?: unknown; z?: unknown };
        let x = clamp(position.x, 0, 100);
        let w = clamp(position.w, 6, 100);
        if (x + w > 100) w = Math.max(6, 100 - x);
        if (x + w > 100) x = Math.max(0, 100 - w);
        widgets[key] = {
          x: Math.round(x * 100) / 100,
          y: Math.round(clamp(position.y, 0, 100_000)),
          w: Math.round(w * 100) / 100,
          z: Math.round(clamp(position.z, 0, 10_000)),
        };
      }
    }
    const hidden: string[] = [];
    if (Array.isArray(source.hidden)) {
      for (const key of source.hidden.slice(0, MAX_WIDGETS)) {
        if (typeof key === 'string' && KEY_PATTERN.test(key) && !hidden.includes(key)) hidden.push(key);
      }
    }
    const config: WorkspaceConfig = {
      version: 1,
      widgets,
      hidden,
      updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : '',
    };
    if (JSON.stringify(config).length > MAX_BYTES) {
      if (strict) bad('ข้อมูลการจัดหน้าจอใหญ่เกินไป');
      return empty();
    }
    return config;
  }
}

