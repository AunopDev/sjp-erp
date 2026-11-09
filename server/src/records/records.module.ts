import { Module } from '@nestjs/common';
import { AuditController } from '../common/audit.controller.js';
import { RecordsController } from './records.controller.js';
import { RecordsService } from './records.service.js';

@Module({
  controllers: [RecordsController, AuditController],
  providers: [RecordsService],
  exports: [RecordsService],
})
export class RecordsModule {}
