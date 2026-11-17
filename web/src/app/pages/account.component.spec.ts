import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountComponent } from './account.component';
import { AuthService } from '../core/auth.service';
import { MetaService } from '../core/meta.service';
import { ThemeService } from '../core/theme.service';
import type { SafeUser } from '../core/models';
import type { Density, ResolvedTheme, ThemePref } from '../core/storage';

function user(overrides: Partial<SafeUser> = {}): SafeUser {
  return {
    id: 'u1',
    username: 'somchai',
    name: 'สมชาย ใจดี',
    roleId: 'r1',
    roleName: 'ช่างเทคนิค',
    dept: 'บริการ',
    team: 'A',
    projectIds: [],
    siteIds: [],
    active: true,
    isAdmin: false,
    scope: 'team',
    perms: {},
    ...overrides,
  };
}

describe('AccountComponent', () => {
  let currentUser: ReturnType<typeof signal<SafeUser | null>>;
  let setPref: ReturnType<typeof vi.fn>;

  const mount = async (value: SafeUser | null) => {
    currentUser.set(value);
    const fixture = TestBed.createComponent(AccountComponent);
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(async () => {
    currentUser = signal<SafeUser | null>(null);
    setPref = vi.fn();
    await TestBed.configureTestingModule({
      imports: [AccountComponent],
      providers: [
        { provide: AuthService, useValue: { user: currentUser, logout: vi.fn() } },
        {
          provide: MetaService,
          useValue: {
            meta: signal({ resources: { tickets: 'Service Ticket', pm: 'งาน PM', master: 'ลูกค้า/ผู้ขาย' } }),
          },
        },
        {
          provide: ThemeService,
          useValue: {
            pref: signal<ThemePref>('system'),
            theme: signal<ResolvedTheme>('dark'),
            density: signal<Density>('compact'),
            setPref,
            toggle: vi.fn(),
            toggleDensity: vi.fn(),
          },
        },
      ],
    }).compileComponents();
  });

  it('shows the signed-in profile and a grouped permission summary', async () => {
    const fixture = await mount(
      user({ perms: { tickets: { view: true, create: true }, pm: { view: true, edit: true } } }),
    );
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).toContain('สมชาย ใจดี');
    expect(host.textContent).toContain('ช่างเทคนิค');
    expect(host.textContent).toContain('ตามทีม');

    const modules = [...host.querySelectorAll('.acct-perm-name')].map((node) => node.textContent?.trim());
    expect(modules.sort()).toEqual(['Service Ticket', 'งาน PM'].sort());

    const actions = [...host.querySelectorAll('.perm-chip')].map((node) => node.textContent?.trim());
    expect(actions).toHaveLength(4);
    expect(actions).toEqual(expect.arrayContaining(['ดู', 'สร้าง', 'แก้ไข']));
    expect(host.querySelector('.acct-perm-head .badge')?.textContent?.trim()).toBe('4 สิทธิ์ · 2 โมดูล');
  });

  it('lists every module for an administrator', async () => {
    const fixture = await mount(user({ isAdmin: true, roleName: 'ผู้ดูแลระบบ' }));
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('.acct-admin')?.textContent).toContain('ผู้ดูแลระบบ');
    expect(
      [...host.querySelectorAll('.acct-perm-name')].map((node) => node.textContent?.trim()).sort(),
    ).toEqual(['Service Ticket', 'งาน PM', 'ลูกค้า/ผู้ขาย'].sort());
  });

  it('switches the theme preference from the appearance card', async () => {
    const fixture = await mount(user());
    const host = fixture.nativeElement as HTMLElement;

    const dark = [...host.querySelectorAll('.acct-field .seg-btn')].find(
      (node) => node.textContent?.trim() === 'มืด',
    ) as HTMLButtonElement | undefined;
    expect(dark).toBeTruthy();
    dark?.click();
    expect(setPref).toHaveBeenCalledWith('dark');
  });
});
