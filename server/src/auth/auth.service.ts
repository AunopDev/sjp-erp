import { Injectable, UnauthorizedException } from '@nestjs/common';
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
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  isFirstRun(): boolean {
    return this.users.activeAdminCount() === 0;
  }

  async setup(input: { name?: string; username?: string; password?: string }): Promise<AuthResult> {
    this.users.ensureFirstAdminAllowed();
    const user = await this.users.create({
      name: input.name,
      username: input.username,
      password: input.password,
      roleId: 'admin',
      active: true,
    });
    this.audit.log(user, { action: 'setup', entity: 'users', recordId: user.id, recordCode: user.username, summary: `สร้างผู้ดูแลระบบ ${user.name}` });
    return this.sign(user);
  }

  async login(username: string, password: string): Promise<AuthResult> {
    const row = this.users.findByUsername(username);
    if (!row || !row.active) throw new UnauthorizedException('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    const ok = await compare(password ?? '', row.passwordHash);
    if (!ok) throw new UnauthorizedException('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    const user = this.users.safeById(row.id);
    if (!user) throw new UnauthorizedException('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    this.audit.log(user, { action: 'login', entity: 'users', recordId: user.id, recordCode: user.username, summary: `เข้าสู่ระบบ ${user.name}` });
    return this.sign(user);
  }

  async changePassword(user: SafeUser, currentPassword: string, newPassword: string): Promise<void> {
    const row = this.users.findById(user.id);
    if (!row) throw new UnauthorizedException();
    if (!(await compare(currentPassword ?? '', row.passwordHash))) bad('รหัสผ่านเดิมไม่ถูกต้อง');
    if (!newPassword || newPassword.length < 8) bad('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร');
    await this.users.update(user.id, { password: newPassword });
    this.audit.log(user, { action: 'password', entity: 'users', recordId: user.id, recordCode: user.username, summary: 'เปลี่ยนรหัสผ่าน' });
  }

  me(user: SafeUser): SafeUser {
    return user;
  }

  private async sign(user: SafeUser): Promise<AuthResult> {
    const token = await this.jwt.signAsync({ sub: user.id, username: user.username });
    return { token, user };
  }
}
