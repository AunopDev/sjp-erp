import { Module } from '@nestjs/common';
import { RecordsModule } from '../records/records.module.js';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

@Module({
  imports: [RecordsModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
