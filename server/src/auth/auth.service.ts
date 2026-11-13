import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { UsersService } from './users.service.js';
import type { SafeUser } from './user.types.js';
import { AuditService } from '../common/audit.service.js';
import { bad } from '../common/exceptions.js';

export interface AuthResult {
  token: string;
  user: SafeUser;
}

@Injectable()
export class AuthService {
  /** Serialises first-run setup so two concurrent requests cannot create two admins. */
  private setupQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  isFirstRun(): boolean {
    return this.users.activeAdminCount() === 0;
  }

  setup(input: { name?: string; username?: string; password?: string }): Promise<AuthResult> {
    const task = this.setupQueue.then(
      () => this.runSetup(input),
      () => this.runSetup(input),
    );
    this.setupQueue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  private async runSetup(input: { name?: string; username?: string; password?: string }): Promise<AuthResult> {
    this.users.ensureFirstAdminAllowed();
    if (!this.users.tryAcquireSetupLock()) {
      throw new ConflictException('ระบบกำลังตั้งค่าผู้ดูแลระบบ กรุณาลองใหม่');
    }
    try {
      const user = await this.users.create({
        name: input.name,
        username: input.username,
        password: input.password,
        roleId: 'admin',
        active: true,
      });
      this.audit.log(user, { action: 'setup', entity: 'users', recordId: user.id, recordCode: user.username, summary: `สร้างผู้ดูแลระบบ ${user.name}` });
      return this.sign(user);
    } finally {
      this.users.releaseSetupLock();
    }
  }

  async login(username: string, password: string): Promise<AuthResult> {
    const row = this.users.findByUsername(username);
    if (!row || !row.active) {
      this.audit.log(null, { action: 'login_failed', entity: 'users', recordCode: String(username ?? '').slice(0, 80), summary: 'เข้าสู่ระบบไม่สำเร็จ' });
      throw new UnauthorizedException('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }
    const ok = await compare(password ?? '', row.passwordHash);
    if (!ok) {
      this.audit.log(null, { action: 'login_failed', entity: 'users', recordId: row.id, recordCode: row.username, summary: 'เข้าสู่ระบบไม่สำเร็จ' });
      throw new UnauthorizedException('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }
    const user = this.users.safeById(row.id);
    if (!user) {
      this.audit.log(null, { action: 'login_failed', entity: 'users', recordId: row.id, recordCode: row.username, summary: 'เข้าสู่ระบบไม่สำเร็จ' });
      throw new UnauthorizedException('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }
    this.audit.log(user, { action: 'login', entity: 'users', recordId: user.id, recordCode: user.username, summary: `เข้าสู่ระบบ ${user.name}` });
    return this.sign(user);
  }

  async changePassword(user: SafeUser, currentPassword: string, newPassword: string): Promise<void> {
    const row = this.users.findById(user.id);
    if (!row) throw new UnauthorizedException();
    if (!(await compare(currentPassword ?? '', row.passwordHash))) bad('รหัสผ่านเดิมไม่ถูกต้อง');
    if (!newPassword || newPassword.length < 8) bad('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร');
    await this.users.update(user.id, { password: newPassword }, user);
    this.audit.log(user, { action: 'password', entity: 'users', recordId: user.id, recordCode: user.username, summary: 'เปลี่ยนรหัสผ่าน' });
  }

  logout(user: SafeUser): void {
    this.users.bumpSessionVersion(user.id);
    this.audit.log(user, { action: 'logout', entity: 'users', recordId: user.id, recordCode: user.username, summary: `ออกจากระบบ ${user.name}` });
  }

  me(user: SafeUser): SafeUser {
    return user;
  }

  private async sign(user: SafeUser): Promise<AuthResult> {
    const token = await this.jwt.signAsync({
      sub: user.id,
      username: user.username,
      pv: this.users.passwordVersion(user.id),
      sv: this.users.sessionVersion(user.id),
    });
    return { token, user };
  }
}
