import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { CSRF_COOKIE, SESSION_COOKIE } from './auth.constants.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { UsersService } from './users.service.js';

interface RequestWithUser {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  user?: unknown;
}

function parseCookies(header: string | string[] | undefined): Record<string, string> {
  const raw = Array.isArray(header) ? header.join(';') : header ?? '';
  const out: Record<string, string> = {};
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      out[name] = part.slice(index + 1).trim();
    }
  }
  return out;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const header = req.headers.authorization;
    const raw = Array.isArray(header) ? header[0] : header;
    const bearer = raw?.startsWith('Bearer ') ? raw.slice(7) : '';
    const cookies = parseCookies(req.headers.cookie);
    const cookieToken = cookies[SESSION_COOKIE] ?? '';
    const token = bearer || cookieToken;
    if (!token) throw new UnauthorizedException('กรุณาเข้าสู่ระบบ');

    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string; pv?: string; sv?: number }>(token);
      if (!payload.sub) throw new UnauthorizedException('เซสชันไม่ถูกต้อง');
      const user = this.users.safeById(payload.sub);
      if (!user || !user.active) throw new UnauthorizedException('บัญชีนี้ถูกปิดใช้งานหรือไม่พบผู้ใช้');
      if (!payload.pv || payload.pv !== this.users.passwordVersion(user.id)) {
        throw new UnauthorizedException('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
      }
      if (Number(payload.sv ?? -1) !== this.users.sessionVersion(user.id)) {
        throw new UnauthorizedException('เซสชันถูกยกเลิก กรุณาเข้าสู่ระบบใหม่');
      }
      if (!bearer && cookieToken && !['GET', 'HEAD', 'OPTIONS'].includes(String(req.method ?? 'GET').toUpperCase())) {
        const headerToken = req.headers['x-csrf-token'];
        const csrfHeader = Array.isArray(headerToken) ? headerToken[0] : headerToken;
        if (!csrfHeader || !cookies[CSRF_COOKIE] || csrfHeader !== cookies[CSRF_COOKIE]) {
          throw new ForbiddenException('CSRF token ไม่ถูกต้อง');
        }
      }
      req.user = user;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) throw error;
      throw new UnauthorizedException('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    }
  }
}
