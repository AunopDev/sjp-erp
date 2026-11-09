import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { SafeUser } from '../auth/user.types.js';
import { NotifyService, type NotifyConfig } from './notify.service.js';

@Controller('notify')
export class NotifyController {
  constructor(private readonly notify: NotifyService) {}

  @Get('config')
  config(@CurrentUser() user: SafeUser) {
    return this.notify.config(user);
  }

  @Put('config')
  save(@CurrentUser() user: SafeUser, @Body() body: Partial<NotifyConfig>) {
    return this.notify.save(user, body ?? {});
  }

  @Post('test')
  test(@CurrentUser() user: SafeUser, @Body() body: { channel?: 'email' | 'line' }) {
    return this.notify.test(user, body?.channel === 'line' ? 'line' : 'email');
  }
}
