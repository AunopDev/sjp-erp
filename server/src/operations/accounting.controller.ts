import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { SafeUser } from '../auth/user.types.js';
import { AccountingService } from './accounting.service.js';

@Controller('accounting')
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  @Get('summary')
  summary(@CurrentUser() user: SafeUser) {
    return this.accounting.summary(user);
  }
}
