import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { SafeUser } from '../auth/user.types.js';
import { CompanyService, type CompanyInfo } from './company.service.js';

@Controller('company')
export class CompanyController {
  constructor(private readonly company: CompanyService) {}

  @Get()
  get() {
    return this.company.get();
  }

  @Put()
  save(@CurrentUser() user: SafeUser, @Body() body: Partial<CompanyInfo>) {
    return this.company.save(user, body ?? {});
  }
}
