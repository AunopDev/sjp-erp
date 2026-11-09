import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { Public } from './public.decorator.js';
import { CurrentUser } from './current-user.decorator.js';
import type { SafeUser } from './user.types.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Get('status')
  status() {
    return { firstRun: this.auth.isFirstRun() };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('setup')
  async setup(@Body() body: { name?: string; username?: string; password?: string }) {
    return this.auth.setup(body ?? {});
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: { username?: string; password?: string }) {
    return this.auth.login(String(body?.username ?? ''), String(body?.password ?? ''));
  }

  @Get('me')
  me(@CurrentUser() user: SafeUser) {
    return this.auth.me(user);
  }

  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: SafeUser,
    @Body() body: { currentPassword?: string; newPassword?: string },
  ) {
    await this.auth.changePassword(user, String(body?.currentPassword ?? ''), String(body?.newPassword ?? ''));
    return { ok: true };
  }
}
