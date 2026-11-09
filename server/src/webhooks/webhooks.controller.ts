import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { SafeUser } from '../auth/user.types.js';
import { WebhooksService, type WebhookInput } from './webhooks.service.js';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  list(@CurrentUser() user: SafeUser) {
    return this.webhooks.list(user);
  }

  @Post()
  create(@CurrentUser() user: SafeUser, @Body() body: WebhookInput) {
    return this.webhooks.save(user, null, body ?? {});
  }

  @Put(':id')
  update(@CurrentUser() user: SafeUser, @Param('id') id: string, @Body() body: WebhookInput) {
    return this.webhooks.save(user, id, body ?? {});
  }

  @Delete(':id')
  remove(@CurrentUser() user: SafeUser, @Param('id') id: string) {
    return this.webhooks.remove(user, id);
  }

  @Get(':id/deliveries')
  deliveries(@CurrentUser() user: SafeUser, @Param('id') id: string, @Query('limit') limit?: string) {
    return this.webhooks.deliveries(user, id, limit);
  }

  @Post(':id/test')
  test(@CurrentUser() user: SafeUser, @Param('id') id: string) {
    return this.webhooks.test(user, id);
  }

  @Post('deliveries/:id/retry')
  retry(@CurrentUser() user: SafeUser, @Param('id') id: string) {
    return this.webhooks.retry(user, id);
  }
}
