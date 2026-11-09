import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { readToken, writeToken } from './storage';
import type { AuthResult, SafeUser } from './models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly user = signal<SafeUser | null>(null);
  readonly ready = signal(false);
  readonly firstRun = signal(false);

  async bootstrap(): Promise<void> {
    try {
      const status = await firstValueFrom(this.api.get<{ firstRun: boolean }>('/auth/status'));
      this.firstRun.set(status.firstRun);
    } catch {
      this.firstRun.set(false);
    }
    if (readToken()) {
      try {
        const user = await firstValueFrom(this.api.get<SafeUser>('/auth/me'));
        this.user.set(user);
      } catch {
        writeToken('');
        this.user.set(null);
      }
    }
    this.ready.set(true);
  }

  async login(username: string, password: string): Promise<AuthResult> {
    const result = await firstValueFrom(this.api.post<AuthResult>('/auth/login', { username, password }));
    writeToken(result.token);
    this.user.set(result.user);
    this.firstRun.set(false);
    return result;
  }

  async setup(name: string, username: string, password: string): Promise<AuthResult> {
    const result = await firstValueFrom(this.api.post<AuthResult>('/auth/setup', { name, username, password }));
    writeToken(result.token);
    this.user.set(result.user);
    this.firstRun.set(false);
    return result;
  }

  async refresh(): Promise<void> {
    try {
      this.user.set(await firstValueFrom(this.api.get<SafeUser>('/auth/me')));
    } catch {
      this.logout();
    }
  }

  logout(): void {
    writeToken('');
    this.user.set(null);
    void this.router.navigate(['/login']);
  }

  can(resource: string, action: string): boolean {
    const user = this.user();
    if (!user || !user.active) return false;
    if (user.isAdmin) return true;
    return !!user.perms?.[resource]?.[action];
  }
}
