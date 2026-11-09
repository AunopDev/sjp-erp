import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { AccessService } from '../common/access.service.js';
import { AuditService } from '../common/audit.service.js';
import { CurrentUser } from './current-user.decorator.js';
import type { SafeUser } from './user.types.js';
import { UsersService, type UserInput } from './users.service.js';

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
  async create(@CurrentUser() user: SafeUser, @Body() body: UserInput) {
    this.access.require(user, 'users', 'create');
    const created = await this.users.create(body ?? {});
    this.audit.log(user, {
      action: 'user',
      entity: 'users',
      recordId: created.id,
      recordCode: created.username,
      summary: `เพิ่มผู้ใช้ ${created.name}`,
    });
    return created;
  }

  @Patch('users/:id')
  async update(@CurrentUser() user: SafeUser, @Param('id') id: string, @Body() body: UserInput) {
    this.access.require(user, 'users', 'edit');
    const updated = await this.users.update(id, body ?? {});
    this.audit.log(user, {
      action: 'user',
      entity: 'users',
      recordId: updated.id,
      recordCode: updated.username,
      summary: `แก้ไขผู้ใช้ ${updated.name}`,
    });
    return updated;
  }
}
