import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { SafeUser } from '../auth/user.types.js';
import { BackupService } from './backup.service.js';

@Controller('backup')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Get('export')
  export(@CurrentUser() user: SafeUser) {
    return this.backup.exportAll(user);
  }

  @Post('restore')
  restore(
    @CurrentUser() user: SafeUser,
    @Body() body: { payload?: Parameters<BackupService['restore']>[1]; confirm?: string },
  ) {
    return this.backup.restore(user, body?.payload, String(body?.confirm ?? ''));
  }

  @Post('legacy')
  legacy(@CurrentUser() user: SafeUser, @Body() body: { state?: unknown; confirm?: string }) {
    return this.backup.legacyImport(user, body?.state, String(body?.confirm ?? ''));
  }
}
