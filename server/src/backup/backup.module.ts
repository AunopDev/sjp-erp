import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { MetaModule } from '../meta/meta.module.js';
import { BackupController } from './backup.controller.js';
import { BackupService } from './backup.service.js';

@Module({
  imports: [MetaModule, FilesModule],
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
