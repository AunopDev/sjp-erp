import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { AuthService } from './auth.service.js';
import { ChangePasswordDto, LoginDto, SetupDto } from './auth.dto.js';
import { CSRF_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE_MS } from './auth.constants.js';
import { Public } from './public.decorator.js';
import { CurrentUser } from './current-user.decorator.js';
import type { SafeUser } from './user.types.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setSessionCookies(res: Response, token: string): void {
    const configured = String(process.env.COOKIE_SAME_SITE ?? 'lax').toLowerCase();
    const sameSite = configured === 'none' ? 'none' : configured === 'strict' ? 'strict' : 'lax';
    const secure = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production' || sameSite === 'none';
    const base = { secure, sameSite: sameSite as 'lax' | 'strict' | 'none', path: '/', maxAge: SESSION_MAX_AGE_MS };
    res.cookie(SESSION_COOKIE, token, { ...base, httpOnly: true });
    res.cookie(CSRF_COOKIE, randomBytes(32).toString('hex'), { ...base, httpOnly: false });
  }

  @Public()
  @Get('status')
  status() {
    return { firstRun: this.auth.isFirstRun() };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('setup')
  async setup(@Body() body: SetupDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.setup(body);
    this.setSessionCookies(res, result.token);
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(String(body.username ?? ''), String(body.password ?? ''));
    this.setSessionCookies(res, result.token);
    return result;
  }

  @Post('logout')
  @HttpCode(200)
  logout(@CurrentUser() user: SafeUser, @Res({ passthrough: true }) res: Response) {
    this.auth.logout(user);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.clearCookie(CSRF_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: SafeUser) {
    return this.auth.me(user);
  }

  @Post('change-password')
  @HttpCode(200)
  async changePassword(@CurrentUser() user: SafeUser, @Body() body: ChangePasswordDto) {
    await this.auth.changePassword(user, String(body.currentPassword ?? ''), String(body.newPassword ?? ''));
    return { ok: true };
  }
}
