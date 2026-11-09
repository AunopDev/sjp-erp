import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { SafeUser } from '../auth/user.types.js';
import { CalendarService } from './calendar.service.js';
import { NotificationsService } from './notifications.service.js';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  list(@CurrentUser() user: SafeUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.calendar.list(user, from, to);
  }
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: SafeUser) {
    return this.notifications.list(user);
  }
}
