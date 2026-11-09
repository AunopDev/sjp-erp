import { InjectDrizzle } from '@nestjs/drizzle';
import { ConflictException, Injectable } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/database.service.js';
import { roles, users, type Perms } from '../db/schema.js';
import { bad, notFound } from '../common/exceptions.js';
import type { SafeUser } from './user.types.js';
import { nowIso } from '../common/dates.js';

export interface UserInput {
  username?: string;
  name?: string;
  password?: string;
  roleId?: string;
  dept?: string;
  team?: string;
  projectIds?: string[];
  siteIds?: string[];
  active?: boolean;
}

const USERNAME = /^[a-z0-9._-]{3,50}$/;

@Injectable()
export class UsersService {
  constructor(@InjectDrizzle() private readonly db: Db) {}

  private role(roleId: string) {
    return this.db.select().from(roles).where(eq(roles.id, roleId)).all()[0];
  }

  private safe(row: typeof users.$inferSelect, role = this.role(row.roleId)): SafeUser {
    return {
      id: row.id,
      username: row.username,
      name: row.name,
      roleId: row.roleId,
      roleName: role?.name ?? '(ไม่พบบทบาท)',
      dept: row.dept,
      team: row.team,
      projectIds: row.projectIds,
      siteIds: row.siteIds,
      active: row.active,
      isAdmin: !!role?.isAdmin,
      scope: role?.scope ?? 'all',
      perms: (role?.perms ?? {}) as Perms,
    };
  }

  findByUsername(username: string) {
    return this.db.select().from(users).where(eq(users.username, username.trim().toLowerCase())).all()[0];
  }

  findById(id: string) {
    return this.db.select().from(users).where(eq(users.id, id)).all()[0];
  }

  safeById(id: string): SafeUser | undefined {
    const row = this.findById(id);
    return row ? this.safe(row) : undefined;
  }

  list(): SafeUser[] {
    return this.db
      .select()
      .from(users)
      .all()
      .map((row) => this.safe(row));
  }

  roleExists(roleId: string): boolean {
    return !!this.role(roleId);
  }

  roles() {
    return this.db.select().from(roles).all();
  }

  async create(input: UserInput): Promise<SafeUser> {
    const username = String(input.username ?? '').trim().toLowerCase();
    const name = String(input.name ?? '').trim();
    const password = String(input.password ?? '');
    const roleId = String(input.roleId ?? '');
    if (!USERNAME.test(username)) bad('ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ ตัวเลข จุด ขีดกลาง หรือขีดล่าง 3–50 ตัวอักษร');
    if (!name) bad('กรุณากรอกชื่อ-สกุล');
    if (password.length < 8) bad('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
    if (!this.roleExists(roleId)) bad('ไม่พบบทบาทที่เลือก');
    if (this.findByUsername(username)) throw new ConflictException('ชื่อผู้ใช้ซ้ำ');

    const now = nowIso();
    const row: typeof users.$inferInsert = {
      id: crypto.randomUUID(),
      username,
      name,
      passwordHash: await hash(password, 12),
      roleId,
      dept: String(input.dept ?? ''),
      team: String(input.team ?? ''),
      projectIds: input.projectIds ?? [],
      siteIds: input.siteIds ?? [],
      active: input.active !== false,
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(users).values(row).run();
    return this.safe(row as typeof users.$inferSelect);
  }

  async update(id: string, input: UserInput): Promise<SafeUser> {
    const row = this.findById(id);
    if (!row) notFound('ไม่พบผู้ใช้');
    const roleId = input.roleId ?? row.roleId;
    if (!this.roleExists(roleId)) bad('ไม่พบบทบาทที่เลือก');
    const active = input.active ?? row.active;
    const wasAdmin = !!this.role(row.roleId)?.isAdmin;
    const willAdmin = !!this.role(roleId)?.isAdmin;
    if (wasAdmin && (!active || !willAdmin)) {
      const otherAdmins = this.db
        .select()
        .from(users)
        .all()
        .filter((u) => u.id !== id && u.active && !!this.role(u.roleId)?.isAdmin);
      if (!otherAdmins.length) bad('ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน');
    }

    const patch: Partial<typeof users.$inferSelect> = {
      roleId,
      active,
      dept: input.dept ?? row.dept,
      team: input.team ?? row.team,
      projectIds: input.projectIds ?? row.projectIds,
      siteIds: input.siteIds ?? row.siteIds,
      updatedAt: nowIso(),
    };
    if (input.username !== undefined) {
      const username = String(input.username).trim().toLowerCase();
      if (!USERNAME.test(username)) bad('ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ ตัวเลข จุด ขีดกลาง หรือขีดล่าง 3–50 ตัวอักษร');
      if (this.db.select().from(users).all().some((u) => u.id !== id && u.username === username)) {
        throw new ConflictException('ชื่อผู้ใช้ซ้ำ');
      }
      patch.username = username;
    }
    if (input.name !== undefined) {
      const name = String(input.name).trim();
      if (!name) bad('กรุณากรอกชื่อ-สกุล');
      patch.name = name;
    }
    if (input.password) {
      if (String(input.password).length < 8) bad('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
      patch.passwordHash = await hash(String(input.password), 12);
    }
    this.db.update(users).set(patch).where(eq(users.id, id)).run();
    return this.safe({ ...row, ...patch } as typeof users.$inferSelect);
  }

  activeAdminCount(): number {
    return this.db
      .select()
      .from(users)
      .all()
      .filter((u) => u.active && !!this.role(u.roleId)?.isAdmin).length;
  }

  ensureFirstAdminAllowed(): void {
    if (this.activeAdminCount() > 0) throw new ConflictException('ระบบมีผู้ดูแลระบบแล้ว กรุณาเข้าสู่ระบบ');
  }
}
