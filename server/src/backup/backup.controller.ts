import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { SafeUser } from '../auth/user.types.js';
import { BackupService } from './backup.service.js';
import { BackupExportDto, BackupRestoreDto, LegacyImportDto } from './backup.dto.js';

@Controller('backup')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Post('export')
  export(@CurrentUser() user: SafeUser, @Body() body: BackupExportDto) {
    return this.backup.exportAll(user, String(body.password ?? ''));
  }

  @Post('restore')
  restore(@CurrentUser() user: SafeUser, @Body() body: BackupRestoreDto) {
    return this.backup.restore(
      user,
      body.payload,
      String(body.confirm ?? ''),
      String(body.password ?? ''),
    );
  }

  @Post('legacy')
  legacy(@CurrentUser() user: SafeUser, @Body() body: LegacyImportDto) {
    return this.backup.legacyImport(user, body.state, String(body.confirm ?? ''));
  }
}
