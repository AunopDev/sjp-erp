import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { SafeUser } from '../auth/user.types.js';
import { RecordsService } from './records.service.js';

function parseFilters(raw: unknown): Record<string, string> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, string>;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

@Controller('records')
export class RecordsController {
  constructor(private readonly records: RecordsService) {}

  @Get(':entity')
  list(@CurrentUser() user: SafeUser, @Param('entity') entity: string, @Query() query: Record<string, string>) {
    return this.records.list(user, entity, {
      search: query['search'],
      page: query['page'],
      pageSize: query['pageSize'],
      sort: query['sort'],
      filters: parseFilters(query['filters']),
    });
  }

  @Post(':entity')
  create(
    @CurrentUser() user: SafeUser,
    @Param('entity') entity: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.records.create(user, entity, body ?? {});
  }

  @Get(':entity/:id')
  get(@CurrentUser() user: SafeUser, @Param('entity') entity: string, @Param('id') id: string) {
    return this.records.get(user, entity, id);
  }

  @Get(':entity/:id/approvals')
  approvals(@CurrentUser() user: SafeUser, @Param('entity') entity: string, @Param('id') id: string) {
    return this.records.approvalsForRecord(user, entity, id);
  }

  @Get(':entity/:id/related')
  related(@CurrentUser() user: SafeUser, @Param('entity') entity: string, @Param('id') id: string) {
    return this.records.related(user, entity, id);
  }

  @Patch(':entity/:id')
  update(
    @CurrentUser() user: SafeUser,
    @Param('entity') entity: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.records.update(user, entity, id, body ?? {});
  }

  @Delete(':entity/:id')
  archive(
    @CurrentUser() user: SafeUser,
    @Param('entity') entity: string,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.records.archive(user, entity, id, String(body?.reason ?? ''));
  }

  @Post(':entity/:id/restore')
  restore(@CurrentUser() user: SafeUser, @Param('entity') entity: string, @Param('id') id: string) {
    return this.records.restore(user, entity, id);
  }

  @Post(':entity/:id/transition')
  transition(
    @CurrentUser() user: SafeUser,
    @Param('entity') entity: string,
    @Param('id') id: string,
    @Body() body: { to?: string; comment?: string; fields?: Record<string, unknown> },
  ) {
    return this.records.transition(user, entity, id, String(body?.to ?? ''), {
      comment: body?.comment,
      fields: body?.fields,
    });
  }
}
