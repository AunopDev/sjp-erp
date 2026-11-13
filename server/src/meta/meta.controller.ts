import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { UsersService } from '../auth/users.service.js';
import type { SafeUser } from '../auth/user.types.js';
import { AccessService } from '../common/access.service.js';
import { AuditService } from '../common/audit.service.js';
import { forbidden } from '../common/exceptions.js';
import { ENTITY_DEFS, ENTITY_WORKFLOW_KEY, getEntity, LISTS, NAV, RESOURCE_LABELS, WORKFLOWS, type EntityDef } from './entities.js';
import { EntityDto, ListsDto, RenameFieldDto, RoleDto, WorkflowDto } from './meta.dto.js';
import { RecordsService } from '../records/records.service.js';
import { MetadataService } from './metadata.service.js';

@Controller('meta')
export class MetaController {
  constructor(
    private readonly records: RecordsService,
    private readonly users: UsersService,
    private readonly access: AccessService,
    private readonly metadata: MetadataService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  meta(@CurrentUser() user: SafeUser) {
    const entities = Object.fromEntries(
      Object.values(ENTITY_DEFS).map((def) => [
        def.key,
        {
          ...def,
          workflowKey: ENTITY_WORKFLOW_KEY[def.key] ?? def.key,
          can: {
            view: this.access.canEntity(user, def.key, 'view'),
            create: this.access.canEntity(user, def.key, 'create'),
            edit: this.access.canEntity(user, def.key, 'edit'),
            delete: this.access.canEntity(user, def.key, 'delete'),
            export: this.access.canEntity(user, def.key, 'export'),
          },
        },
      ]),
    );
    return {
      entities,
      workflows: WORKFLOWS,
      lists: LISTS,
      resources: RESOURCE_LABELS,
      customModules: Object.values(entities).filter((entity) => entity.custom),
      nav: NAV,
    };
  }

  @Get('config')
  config(@CurrentUser() user: SafeUser) {
    this.access.require(user, 'settings', 'view');
    return this.metadata.config();
  }

  @Post('entities')
  createEntity(@CurrentUser() user: SafeUser, @Body() body: EntityDto) {
    this.access.require(user, 'settings', 'edit');
    const def = this.metadata.saveEntity(body as unknown as EntityDef, Array.isArray(body?.roleIds) ? body.roleIds.map(String) : undefined);
    this.audit.log(user, { action: 'metadata', entity: 'settings', recordId: def.key, recordCode: def.key, summary: `สร้าง/บันทึกโมดูล ${def.label}` });
    return def;
  }

  @Put('entity/:key')
  saveEntity(@CurrentUser() user: SafeUser, @Param('key') key: string, @Body() body: EntityDto) {
    this.access.require(user, 'settings', 'edit');
    const def = this.metadata.saveEntity({ ...(body as unknown as EntityDef), key }, Array.isArray(body?.roleIds) ? body.roleIds.map(String) : undefined);
    this.audit.log(user, { action: 'metadata', entity: 'settings', recordId: key, recordCode: key, summary: `แก้ไขโครงสร้างโมดูล ${def.label}` });
    return def;
  }

  @Post('entity/:key/rename-field')
  renameField(
    @CurrentUser() user: SafeUser,
    @Param('key') key: string,
    @Body() body: RenameFieldDto,
  ) {
    this.access.require(user, 'settings', 'edit');
    const result = this.metadata.renameField(key, body?.from, body?.to);
    this.audit.log(user, {
      action: 'metadata',
      entity: 'settings',
      recordId: key,
      recordCode: key,
      summary: `เปลี่ยน key ฟิลด์ ${result.from} → ${result.to} ในโมดูล ${key} (${result.migrated} รายการ)`,
    });
    return result;
  }

  @Delete('entity/:key')
  deleteEntity(@CurrentUser() user: SafeUser, @Param('key') key: string) {
    this.access.require(user, 'settings', 'edit');
    this.metadata.deleteEntity(key);
    this.audit.log(user, { action: 'metadata', entity: 'settings', recordId: key, recordCode: key, summary: `ลบโมดูล ${key}` });
    return { ok: true };
  }

  @Put('workflow/:key')
  saveWorkflow(@CurrentUser() user: SafeUser, @Param('key') key: string, @Body() body: WorkflowDto) {
    this.access.require(user, 'settings', 'edit');
    const wf = this.metadata.saveWorkflow(key, body);
    this.audit.log(user, { action: 'metadata', entity: 'settings', recordId: key, recordCode: key, summary: `แก้ไข workflow ${key}` });
    return wf;
  }

  @Put('lists')
  saveLists(@CurrentUser() user: SafeUser, @Body() body: ListsDto) {
    this.access.require(user, 'settings', 'edit');
    const lists = this.metadata.saveLists(body ?? {});
    this.audit.log(user, { action: 'metadata', entity: 'settings', summary: 'แก้ไขรายการทีม/แผนก' });
    return lists;
  }

  @Put('roles/:id')
  saveRole(@CurrentUser() user: SafeUser, @Param('id') id: string, @Body() body: RoleDto) {
    this.access.require(user, 'roles', 'edit');
    const before = this.users.roles().find((role) => role.id === id);
    const role = this.metadata.saveRole(user, id, body ?? {}) as { name: string; scope: string; perms: Record<string, unknown> };
    const changes: unknown[] = [];
    if (before && body.name !== undefined && before.name !== role.name) changes.push({ field: 'ชื่อบทบาท', from: before.name, to: role.name });
    if (before && body.scope !== undefined && before.scope !== role.scope) changes.push({ field: 'ขอบเขต', from: before.scope, to: role.scope });
    if (body.perms) changes.push({ field: 'สิทธิ์', from: 'ก่อนหน้า', to: 'อัปเดต' });
    this.audit.log(user, { action: 'role.update', entity: 'settings', recordId: id, recordCode: id, summary: `แก้ไขบทบาท ${id}`, changes });
    return role;
  }

  @Get('entity/:key')
  entity(@CurrentUser() user: SafeUser, @Param('key') key: string) {
    const def = getEntity(key);
    if (!def) return { error: 'ไม่พบชนิดข้อมูล' };
    this.access.requireEntity(user, key, 'view');
    return def;
  }

  @Get('options/:entity')
  options(@CurrentUser() user: SafeUser, @Param('entity') entity: string) {
    if (entity === 'users') {
      if (!this.access.canPickUsers(user)) forbidden('ไม่มีสิทธิ์ดูรายชื่อผู้ใช้');
      return this.users
        .list()
        .filter((u) => u.active)
        .map((u) => ({ value: u.id, label: u.name }));
    }
    const def = this.access.requireEntity(user, entity, 'view');
    return this.records
      .rawScoped(def, user)
      .slice(0, 1000)
      .map((row) => ({ value: row.id, label: this.records.labelOf(entity, row.id, user) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'th'));
  }
}
