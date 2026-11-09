import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service.js';
import { ApprovalStoreService } from './approvals.service.js';
import { AuditService } from './audit.service.js';
import { CompanyController } from './company.controller.js';
import { CompanyService } from './company.service.js';

@Global()
@Module({
  controllers: [CompanyController],
  providers: [AccessService, AuditService, ApprovalStoreService, CompanyService],
  exports: [AccessService, AuditService, ApprovalStoreService, CompanyService],
})
export class CommonModule {}
