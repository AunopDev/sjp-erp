import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { AccessService } from '../common/access.service.js';
import { AuditService } from '../common/audit.service.js';
import { CurrentUser } from './current-user.decorator.js';
import type { SafeUser } from './user.types.js';
import { CreateUserDto, UpdateUserDto } from './user.dto.js';
import { UsersService } from './users.service.js';

@Controller()
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  @Get('users')
  list(@CurrentUser() user: SafeUser) {
    this.access.require(user, 'users', 'view');
    return this.users.list();
  }

  @Get('roles')
  roles(@CurrentUser() user: SafeUser) {
    this.access.require(user, 'roles', 'view');
    return this.users.roles();
  }

  @Post('users')
  async create(@CurrentUser() user: SafeUser, @Body() body: CreateUserDto) {
    this.access.require(user, 'users', 'create');
    const created = await this.users.create(body, user);
    this.audit.log(user, {
      action: 'user.create',
      entity: 'users',
      recordId: created.id,
      recordCode: created.username,
      summary: `เพิ่มผู้ใช้ ${created.name}`,
      changes: [{ field: 'บทบาท', from: null, to: created.roleId }],
    });
    return created;
  }

  @Patch('users/:id')
  async update(@CurrentUser() user: SafeUser, @Param('id') id: string, @Body() body: UpdateUserDto) {
    this.access.require(user, 'users', 'edit');
    const before = this.users.findById(id);
    const updated = await this.users.update(id, body, user);
    const changes: unknown[] = [];
    if (before && before.name !== updated.name) changes.push({ field: 'ชื่อ-สกุล', from: before.name, to: updated.name });
    if (before && before.roleId !== updated.roleId) changes.push({ field: 'บทบาท', from: before.roleId, to: updated.roleId });
    if (before && before.active !== updated.active) changes.push({ field: 'สถานะใช้งาน', from: before.active, to: updated.active });
    if (body.password) changes.push({ field: 'รหัสผ่าน', from: '***', to: 'ตั้งใหม่' });
    this.audit.log(user, {
      action: body.password ? 'user.password_reset' : 'user.update',
      entity: 'users',
      recordId: updated.id,
      recordCode: updated.username,
      summary: `แก้ไขผู้ใช้ ${updated.name}`,
      changes,
    });
    return updated;
  }
}
