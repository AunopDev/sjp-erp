import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { SafeUser } from '../auth/user.types.js';
import { EventsService } from './events.service.js';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(
    @CurrentUser() user: SafeUser,
    @Query('entity') entity?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
  ) {
    return this.events.list(user, { entity, type, limit: Number(limit) });
  }

  @Get('types')
  types(@CurrentUser() user: SafeUser) {
    return this.events.types();
  }
}
