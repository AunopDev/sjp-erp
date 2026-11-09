import { Module } from '@nestjs/common';
import { NotifyController } from './notify.controller.js';
import { NotifyService } from './notify.service.js';

@Module({
  controllers: [NotifyController],
  providers: [NotifyService],
})
export class NotifyModule {}
