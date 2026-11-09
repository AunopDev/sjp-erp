import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { SafeUser } from './user.types.js';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): SafeUser => {
  return ctx.switchToHttp().getRequest<{ user: SafeUser }>().user;
});
