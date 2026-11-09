import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { SafeUser } from '../auth/user.types.js';
import { AccessService } from '../common/access.service.js';
import { DashboardService } from './dashboard.service.js';
import { PmService } from './pm.service.js';
import { ProjectsService } from './projects.service.js';
import { PurchasingService } from './purchasing.service.js';
import { ReportsService } from './reports.service.js';
import { StockService } from './stock.service.js';
import { TicketsService } from './tickets.service.js';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Post()
  create(@CurrentUser() user: SafeUser, @Body() body: Record<string, unknown>) {
    return this.tickets.create(user, body ?? {});
  }

  @Post(':id/status')
  status(
    @CurrentUser() user: SafeUser,
    @Param('id') id: string,
    @Body() body: { to?: string; comment?: string; fields?: Record<string, unknown> },
  ) {
    return this.tickets.status(user, id, String(body?.to ?? ''), {
      comment: body?.comment,
      fields: body?.fields,
    });
  }

  @Post(':id/assign')
  assign(
    @CurrentUser() user: SafeUser,
    @Param('id') id: string,
    @Body() body: { team?: string; assignee?: string | null; note?: string },
  ) {
    return this.tickets.assign(user, id, body?.team, body?.assignee, body?.note);
  }

  @Post(':id/notes')
  note(
    @CurrentUser() user: SafeUser,
    @Param('id') id: string,
    @Body() body: { type?: string; text?: string },
  ) {
    return this.tickets.note(user, id, String(body?.type ?? 'note'), String(body?.text ?? ''));
  }

  @Post(':id/appointments')
  appointment(@CurrentUser() user: SafeUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.tickets.addAppointment(user, id, body ?? {});
  }

  @Post(':id/appointments/:appointmentId/resolve')
  resolveAppointment(
    @CurrentUser() user: SafeUser,
    @Param('id') id: string,
    @Param('appointmentId') appointmentId: string,
    @Body() body: { status?: string; result?: string },
  ) {
    return this.tickets.resolveAppointment(user, id, appointmentId, String(body?.status ?? 'เสร็จ'), body?.result);
  }
}

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  create(@CurrentUser() user: SafeUser, @Body() body: Record<string, unknown>) {
    return this.projects.create(user, body ?? {});
  }

  @Patch(':id/steps/:key')
  saveStep(
    @CurrentUser() user: SafeUser,
    @Param('id') id: string,
    @Param('key') key: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.projects.saveStep(user, id, key, body ?? {});
  }

  @Post(':id/steps/:key/:action')
  transit(
    @CurrentUser() user: SafeUser,
    @Param('id') id: string,
    @Param('key') key: string,
    @Param('action') action: string,
    @Body() body: { reason?: string },
  ) {
    const allowed = ['start', 'complete', 'skip', 'reopen'] as const;
    if (!allowed.includes(action as (typeof allowed)[number])) {
      return { error: 'ไม่พบคำสั่งขั้นตอน' };
    }
    return this.projects.transit(user, id, key, action as (typeof allowed)[number], body ?? {});
  }

  @Post(':id/close')
  close(@CurrentUser() user: SafeUser, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.projects.close(user, id, String(body?.reason ?? ''));
  }
}

@Controller('purchase-orders')
export class PurchasingController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Get()
  list(@CurrentUser() user: SafeUser) {
    return this.purchasing.list(user);
  }

  @Get(':id')
  detail(@CurrentUser() user: SafeUser, @Param('id') id: string) {
    return this.purchasing.detail(user, id);
  }

  @Post(':id/status')
  status(
    @CurrentUser() user: SafeUser,
    @Param('id') id: string,
    @Body() body: { to?: string; comment?: string },
  ) {
    return this.purchasing.status(user, id, String(body?.to ?? ''), body?.comment);
  }

  @Post(':id/receive')
  receive(
    @CurrentUser() user: SafeUser,
    @Param('id') id: string,
    @Body() body: { warehouse?: string; lines?: { item: string; qty: number; serialNos?: string[] }[] },
  ) {
    return this.purchasing.receive(user, id, String(body?.warehouse ?? ''), body?.lines ?? []);
  }
}

@Controller('stock')
export class StockController {
  constructor(
    private readonly stock: StockService,
    private readonly access: AccessService,
  ) {}

  @Get('balances')
  balances(@CurrentUser() user: SafeUser) {
    this.access.require(user, 'warehouse', 'view');
    return this.stock.balances();
  }

  @Get('moves')
  moves(@CurrentUser() user: SafeUser, @Query() query: Record<string, string>) {
    return this.stock.list(user, query);
  }

  @Post('moves')
  create(@CurrentUser() user: SafeUser, @Body() body: Record<string, unknown>) {
    return this.stock.createMove(user, body as never);
  }

  @Post('receive')
  receive(@CurrentUser() user: SafeUser, @Body() body: Record<string, unknown>) {
    return this.stock.receiveManual(user, body as never);
  }
}

@Controller('pm')
export class PmController {
  constructor(private readonly pm: PmService) {}

  @Post('generate')
  generate(@CurrentUser() user: SafeUser, @Body() body: { upTo?: string }) {
    return this.pm.generate(user, body?.upTo);
  }

  @Patch('records/:id')
  save(@CurrentUser() user: SafeUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.pm.save(user, id, body as never);
  }

  @Post('templates')
  createTemplate(@CurrentUser() user: SafeUser, @Body() body: Record<string, unknown>) {
    return this.pm.saveTemplate(user, null, body as never);
  }

  @Patch('templates/:id')
  updateTemplate(@CurrentUser() user: SafeUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.pm.saveTemplate(user, id, body as never);
  }
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(@CurrentUser() user: SafeUser) {
    return this.dashboard.get(user);
  }
}

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get(':name')
  report(@CurrentUser() user: SafeUser, @Param('name') name: string) {
    switch (name) {
      case 'tickets':
        return this.reports.tickets(user);
      case 'projects':
        return this.reports.projects(user);
      case 'serials':
        return this.reports.serials(user);
      case 'stock':
        return this.reports.stockReport(user);
      case 'boq':
        return this.reports.boq(user);
      default:
        return { error: 'ไม่พบรายงานนี้' };
    }
  }
}
