import { Body, Controller, Delete, Get, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { SafeUser } from '../auth/user.types.js';
import { WorkspaceService } from './workspace.service.js';

@Controller('prefs')
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}

  @Get('workspace')
  get(@CurrentUser() user: SafeUser) {
    return this.workspace.get(user);
  }

  @Put('workspace')
  save(@CurrentUser() user: SafeUser, @Body() body: unknown) {
    return this.workspace.save(user, body);
  }

  @Delete('workspace')
  reset(@CurrentUser() user: SafeUser) {
    return this.workspace.reset(user);
  }
}
