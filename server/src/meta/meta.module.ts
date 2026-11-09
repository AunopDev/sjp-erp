import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RecordsModule } from '../records/records.module.js';
import { MetaController } from './meta.controller.js';
import { MetadataService } from './metadata.service.js';

@Module({
  imports: [AuthModule, RecordsModule],
  controllers: [MetaController],
  providers: [MetadataService],
  exports: [MetadataService],
})
export class MetaModule {}
