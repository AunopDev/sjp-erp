import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { SafeUser } from '../auth/user.types.js';
import { ApprovalDecisionService } from './approval-decision.service.js';

@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalDecisionService) {}

  @Get()
  list(@CurrentUser() user: SafeUser) {
    return this.approvals.list(user);
  }

  @Post(':id/decide')
  decide(
    @CurrentUser() user: SafeUser,
    @Param('id') id: string,
    @Body() body: { approve?: boolean; note?: string },
  ) {
    return this.approvals.decide(user, id, body?.approve === true, String(body?.note ?? ''));
  }
}
