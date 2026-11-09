import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { SafeUser } from '../auth/user.types.js';
import { AccessService } from './access.service.js';
import { AuditService } from './audit.service.js';
import { RecordsService } from '../records/records.service.js';

@Controller('audit')
export class AuditController {
  constructor(
    private readonly audit: AuditService,
    private readonly records: RecordsService,
    private readonly access: AccessService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: SafeUser,
    @Query('entity') entity?: string,
    @Query('recordId') recordId?: string,
    @Query('limit') limit?: string,
  ) {
    if (entity) {
      const def = this.access.requireEntity(user, entity, 'view');
      if (recordId) {
        const rec = this.records.rawGet(entity, recordId);
        if (!rec) return [];
        this.access.requireSee(user, def, rec);
        return this.audit.listByEntity(entity, recordId).slice(0, Math.min(Number(limit) || 200, 1000));
      }
      const visible = new Map(
        this.records.rawAll(entity, true)
          .filter((row) => this.access.canSee(user, def, row))
          .map((row) => [row.id, row]),
      );
      return this.audit
        .listByEntity(entity)
        .filter((entry) => !entry.recordId || visible.has(entry.recordId))
        .slice(0, Math.min(Number(limit) || 200, 1000));
    }
    this.access.require(user, 'settings', 'view');
    return this.audit.recent(Math.min(Number(limit) || 100, 500));
  }

  @Get('records/:entity/:id')
  record(@CurrentUser() user: SafeUser, @Param('entity') entity: string, @Param('id') id: string) {
    const def = this.access.requireEntity(user, entity, 'view');
    const rec = this.records.rawGet(entity, id);
    if (!rec) return [];
    this.access.requireSee(user, def, rec);
    return this.audit.listByEntity(entity, id);
  }
}
