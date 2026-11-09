import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { MetaService } from '../core/meta.service';
import { iconForPath, IconComponent } from '../shared/icon.component';
import { readSidebarCollapsed, readTheme, writeSidebarCollapsed, writeTheme } from '../core/storage';

interface NavItem {
  path: string;
  label: string;
  short?: string;
  icon: string;
  resource?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

interface NotificationItem {
  id: string;
  type: string;
  tone: 'red' | 'amber' | 'blue';
  title: string;
  subtitle: string;
  link: string;
}

interface SearchResult {
  entity: string;
  entityLabel: string;
  id: string;
  code: string;
  title: string;
  subtitle: string;
  link: string;
}

interface PaletteItem {
  key: string;
  path: string;
  label: string;
  group: string;
  icon: string;
  kind: 'nav' | 'record';
  subtitle?: string;
}

const ENTITY_ICONS: Record<string, string> = {
  tickets: 'ticket',
  purchaseOrders: 'receipt',
  projects: 'folder',
  pmRecords: 'wrench',
  invoices: 'doc',
  receipts: 'receipt',
  expenses: 'chart',
  customers: 'building',
  vendors: 'truck',
  items: 'chip',
  serials: 'tag',
};

const GROUPS: NavGroup[] = [
  {
    label: 'ภาพรวม',
    items: [
      { path: '/', label: 'หน้าแรก', short: 'หน้าแรก', icon: 'home' },
      { path: '/my', label: 'งานของฉัน', icon: 'check' },
      { path: '/approvals', label: 'คำขออนุมัติ', icon: 'bell' },
    ],
  },
  {
    label: 'งานขาย/โครงการ',
    items: [
      { path: '/projects', label: 'โครงการ', short: 'โครงการ', icon: 'folder', resource: 'projects' },
      { path: '/calendar', label: 'ปฏิทินงาน', short: 'ปฏิทิน', icon: 'calendar' },
    ],
  },
  {
    label: 'บริการ',
    items: [
      { path: '/tickets', label: 'แจ้งซ่อม / Service Ticket', short: 'แจ้งซ่อม', icon: 'ticket', resource: 'tickets' },
      { path: '/pm', label: 'งาน PM', icon: 'wrench', resource: 'pm' },
    ],
  },
  {
    label: 'คลัง/จัดซื้อ',
    items: [
      { path: '/purchase-orders', label: 'ใบสั่งซื้อ', icon: 'receipt', resource: 'purchase' },
      { path: '/warehouse', label: 'คลังสินค้า', short: 'คลัง', icon: 'box', resource: 'warehouse' },
    ],
  },
  {
    label: 'บัญชี/การเงิน',
    items: [
      { path: '/entities/invoices', label: 'ใบแจ้งหนี้/วางบิล', icon: 'doc', resource: 'accounting' },
      { path: '/entities/receipts', label: 'ใบเสร็จ/รับชำระ', icon: 'receipt', resource: 'accounting' },
      { path: '/entities/expenses', label: 'ค่าใช้จ่าย', icon: 'chart', resource: 'accounting' },
    ],
  },
  {
    label: 'ข้อมูลหลัก',
    items: [
      { path: '/entities/customers', label: 'ลูกค้า', icon: 'building', resource: 'master' },
      { path: '/entities/vendors', label: 'ผู้ขาย', icon: 'truck', resource: 'master' },
      { path: '/entities/contacts', label: 'ผู้ติดต่อ', icon: 'user', resource: 'master' },
      { path: '/entities/sites', label: 'ไซต์งาน', icon: 'pin', resource: 'master' },
      { path: '/entities/items', label: 'สินค้า/อุปกรณ์', icon: 'chip', resource: 'assets' },
      { path: '/entities/serials', label: 'Serial Number', icon: 'tag', resource: 'assets' },
    ],
  },
  {
    label: 'ระบบ',
    items: [
      { path: '/reports', label: 'รายงานและส่งออก', icon: 'chart', resource: 'reports' },
      { path: '/settings', label: 'ตั้งค่าผู้ใช้/สิทธิ์', icon: 'gear', resource: 'settings' },
    ],
  },
];

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  template: `
    <div class="app">
      <a class="skip-link" href="#main-content">ข้ามไปยังเนื้อหาหลัก</a>
      <aside class="rail" [class.collapsed]="sidebarCollapsed()" aria-label="เมนูหลัก">
        <a class="rail-logo" routerLink="/" aria-label="หน้าแรก">
          <b>SJP</b>
          <span class="rail-brand-text"><strong>ERP</strong><small>ระบบงานบริษัท</small></span>
        </a>
        <nav class="rail-nav">
          @for (group of visibleGroups(); track group.label) {
            <div class="rail-group">
              <h4>{{ group.label }}</h4>
              @for (item of group.items; track item.path) {
                <a class="rail-link" [routerLink]="item.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: item.path === '/' }" [attr.title]="item.label">
                  <span class="rail-ic"><app-icon [name]="item.icon" [size]="19" /></span>
                  <span class="rail-label">{{ item.label }}</span>
                  @if (item.path === '/approvals' && pendingApprovals()) { <span class="rail-badge">{{ pendingApprovals() }}</span> }
                </a>
              }
            </div>
          }
        </nav>
        <div class="rail-foot">
          <button class="rail-foot-btn" type="button" (click)="toggleTheme()">
            <span class="rail-ic"><app-icon [name]="theme() === 'dark' ? 'sun' : 'moon'" [size]="19" /></span>
            <span>{{ theme() === 'dark' ? 'โหมดสว่าง' : 'โหมดมืด' }}</span>
          </button>
        </div>
      </aside>

      <div class="main2">
        <header class="top">
          <button class="icon-btn sidebar-toggle" type="button" (click)="toggleSidebar()" [attr.title]="sidebarCollapsed() ? 'ขยายเมนู' : 'ย่อเมนู'" aria-label="ย่อ/ขยายเมนู">
            <app-icon name="columns" [size]="20" />
          </button>
          <button class="menu-chip" type="button" (click)="menuOpen.set(true)">
            <app-icon name="menu" [size]="18" /> เมนู
          </button>
          <div class="crumbs">
            <span class="muted">{{ pageInfo().group }}</span>
            <app-icon name="chevron" [size]="16" />
            <b>{{ pageInfo().label }}</b>
          </div>
          <span class="grow"></span>
          <button class="search-box" type="button" (click)="openPalette()" aria-label="ค้นหา">
            <app-icon name="search" [size]="18" />
            <span>ค้นหาเมนู / หน้า…</span>
            <kbd>Ctrl K</kbd>
          </button>
          @if (auth.can('tickets', 'create')) {
            <a class="btn primary create-btn" routerLink="/tickets/new"><app-icon name="plus" [size]="18" /> <span class="create-label">สร้าง</span></a>
          }
          <div class="pop-wrap">
            <button class="icon-btn approval-btn" type="button" (click)="toggleNotifications()" [attr.aria-expanded]="notificationsOpen()" aria-label="การแจ้งเตือน">
              <app-icon name="bell" [size]="20" />
              @if (notifications().length) { <span class="bell-badge">{{ notifications().length > 99 ? '99+' : notifications().length }}</span> }
            </button>
            @if (notificationsOpen()) {
              <div class="popover right notif-pop">
                <div class="pop-title">การแจ้งเตือน <span class="badge {{ notifications().length ? 'red' : 'gray' }}">{{ notifications().length }}</span></div>
                @if (!notifications().length) {
                  <div class="state small">ไม่มีเรื่องที่ต้องดำเนินการ</div>
                } @else {
                  @for (item of notifications(); track item.id) {
                    <button type="button" class="pop-row notif-row" (click)="openNotification(item)">
                      <span class="badge {{ item.tone }}">{{ notificationLabel(item) }}</span>
                      <span class="notif-text"><b>{{ item.title }}</b><small>{{ item.subtitle }}</small></span>
                    </button>
                  }
                  <a class="pop-row" routerLink="/my" (click)="notificationsOpen.set(false)">ดูงานของฉันทั้งหมด</a>
                }
              </div>
            }
          </div>
          <div class="pop-wrap">
            <button class="user-btn" type="button" (click)="userOpen.set(!userOpen())" [attr.aria-expanded]="userOpen()">
              <span class="avatar">{{ initials() }}</span>
              <span class="user-name">{{ auth.user()?.name }}</span>
            </button>
            @if (userOpen()) {
              <div class="popover right">
                <div class="pop-title">{{ auth.user()?.name }}<div class="muted small" style="font-weight:400">{{ auth.user()?.roleName }} · {{ auth.user()?.username }}</div></div>
                <button class="pop-row" type="button" (click)="toggleTheme()"><app-icon [name]="theme() === 'dark' ? 'sun' : 'moon'" /> {{ theme() === 'dark' ? 'ใช้โหมดสว่าง' : 'ใช้โหมดมืด' }}</button>
                <button class="pop-row" type="button" (click)="auth.logout()"><app-icon name="logout" /> ออกจากระบบ</button>
              </div>
            }
          </div>
        </header>

        <main id="main-content" class="content" tabindex="-1"><router-outlet /></main>

        <nav class="bottombar" aria-label="ทางลัดด้านล่าง">
          @for (item of pinned(); track item.path) {
            <a class="bb-item" [routerLink]="item.path" [routerLinkActive]="'active'" [routerLinkActiveOptions]="{ exact: item.path === '/' }">
              <span class="bb-ic"><app-icon [name]="item.icon" [size]="24" /></span><span>{{ item.short ?? item.label }}</span>
            </a>
          }
          <button class="bb-item" type="button" (click)="menuOpen.set(true)"><span class="bb-ic"><app-icon name="grid" [size]="24" /></span><span>เมนู</span></button>
        </nav>
      </div>
    </div>

    @if (menuOpen()) {
      <div class="overlay" (mousedown)="onOverlay($event)">
        <div class="menu-panel" role="dialog" aria-label="เมนูทั้งหมด">
          <div class="menu-head"><b>เมนูทั้งหมด</b><span class="muted small">{{ auth.user()?.roleName }}</span><span class="grow"></span><button class="icon-btn" type="button" (click)="menuOpen.set(false)" aria-label="ปิด"><app-icon name="close" /></button></div>
          <div class="menu-grid">
            @for (group of visibleGroups(); track group.label) {
              <div class="menu-group">
                <h4>{{ group.label }}</h4>
                @for (item of group.items; track item.path) {
                  <div class="menu-item">
                    <a [routerLink]="item.path" [routerLinkActive]="'active'" [routerLinkActiveOptions]="{ exact: item.path === '/' }" (click)="menuOpen.set(false)">
                      <app-icon [name]="item.icon" /><span>{{ item.label }}</span>
                    </a>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>
    }

    @if (paletteOpen()) {
      <div class="overlay palette-overlay" (mousedown)="onOverlay($event)">
        <div class="palette" role="dialog" aria-label="ค้นหา">
          <div class="palette-input">
            <app-icon name="search" />
            <input autofocus [value]="paletteQuery()" (input)="setPaletteQuery($any($event.target).value)" (keydown)="paletteKey($event)" placeholder="ค้นหาเมนู เลขเอกสาร ลูกค้า สินค้า…" aria-label="ค้นหา" />
            <kbd>Esc</kbd>
          </div>
          <div class="palette-list">
            @if (!paletteResults().length) {
              <div class="state">ไม่พบเมนูหรือรายการที่ตรงกับ “{{ paletteQuery() }}”</div>
            } @else {
              @for (item of paletteResults(); track item.key; let i = $index) {
                <button type="button" class="palette-row" [class.on]="paletteIndex() === i" (mouseenter)="paletteIndex.set(i)" (click)="go(item)">
                  <app-icon [name]="item.icon" [size]="18" />
                  <span class="pl">{{ item.label }}</span>
                  <span class="muted small">{{ item.subtitle || item.group }}</span>
                </button>
              }
            }
          </div>
          <div class="palette-foot">
            <span><kbd>↑</kbd><kbd>↓</kbd> เลือก</span>
            <span><kbd>Enter</kbd> เปิด</span>
            <span><kbd>Esc</kbd> ปิด</span>
          </div>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly meta = inject(MetaService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly menuOpen = signal(false);
  readonly userOpen = signal(false);
  readonly paletteOpen = signal(false);
  readonly paletteQuery = signal('');
  readonly paletteIndex = signal(0);
  readonly recordResults = signal<SearchResult[]>([]);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  readonly theme = signal(readTheme());
  readonly sidebarCollapsed = signal(readSidebarCollapsed());
  readonly currentUrl = signal(this.router.url);
  readonly pendingApprovals = signal(0);
  readonly notifications = signal<NotificationItem[]>([]);
  readonly notificationsOpen = signal(false);

  readonly visibleGroups = computed<NavGroup[]>(() => {
    const groups: NavGroup[] = GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.resource || this.auth.can(item.resource, 'view')),
    })).filter((group) => group.items.length);
    const custom: NavItem[] = (this.meta.meta()?.customModules ?? [])
      .filter((entity) => this.auth.can(entity.key, 'view'))
      .map((entity) => ({ path: `/entities/${entity.key}`, label: entity.label, icon: 'puzzle', resource: entity.key }));
    return custom.length ? [...groups, { label: 'โมดูลของฉัน', items: custom }] : groups;
  });

  readonly pinned = computed<NavItem[]>(() =>
    this.visibleGroups()
      .flatMap((group) => group.items)
      .filter((item) => ['/', '/tickets', '/projects', '/warehouse'].includes(item.path))
      .slice(0, 4),
  );

  readonly allItems = computed<(NavItem & { group: string })[]>(() =>
    this.visibleGroups().flatMap((group) => group.items.map((item) => ({ ...item, group: group.label }))),
  );

  readonly paletteResults = computed<PaletteItem[]>(() => {
    const query = this.paletteQuery().trim().toLowerCase();
    const nav: PaletteItem[] = (query
      ? this.allItems().filter((item) => `${item.label} ${item.group}`.toLowerCase().includes(query))
      : this.allItems()
    )
      .slice(0, 20)
      .map((item) => ({
        key: `nav:${item.path}`,
        path: item.path,
        label: item.label,
        group: item.group,
        icon: item.icon,
        kind: 'nav',
      }));
    const records: PaletteItem[] = this.recordResults().map((item) => ({
      key: `record:${item.entity}:${item.id}`,
      path: item.link,
      label: `${item.code} — ${item.title}`,
      group: item.entityLabel,
      icon: ENTITY_ICONS[item.entity] ?? 'doc',
      kind: 'record',
      subtitle: `${item.entityLabel} · ${item.code}`,
    }));
    return [...records, ...nav].slice(0, 25);
  });

  readonly pageInfo = computed(() => {
    const url = this.currentUrl().split('?')[0];
    const items = this.allItems();
    const hit = items
      .filter((item) => (item.path === '/' ? url === '/' : url.startsWith(item.path)))
      .sort((a, b) => b.path.length - a.path.length)[0];
    return hit ? { label: hit.label, group: hit.group } : { label: 'หน้า', group: 'SJP ERP' };
  });

  readonly initials = computed(() => (this.auth.user()?.name ?? '?').trim().charAt(0));

  ngOnInit(): void {
    document.documentElement.dataset['theme'] = this.theme();
    this.meta.load();
    this.loadApprovals();
    this.loadNotifications();
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((event) => {
      this.currentUrl.set((event as NavigationEnd).urlAfterRedirects);
      this.menuOpen.set(false);
      this.userOpen.set(false);
      this.paletteOpen.set(false);
      this.paletteQuery.set('');
      this.recordResults.set([]);
      this.notificationsOpen.set(false);
      this.loadApprovals();
      this.loadNotifications();
      window.scrollTo(0, 0);
    });
    window.addEventListener('keydown', this.hotkey);
  }

  toggleTheme(): void {
    const next = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    document.documentElement.dataset['theme'] = next;
    writeTheme(next);
  }

  toggleSidebar(): void {
    const next = !this.sidebarCollapsed();
    this.sidebarCollapsed.set(next);
    writeSidebarCollapsed(next);
  }

  private loadApprovals(): void {
    this.api.get<{ pending: unknown[] }>('/approvals').subscribe({
      next: (result) => this.pendingApprovals.set(result.pending?.length ?? 0),
      error: () => this.pendingApprovals.set(0),
    });
  }

  private loadNotifications(): void {
    this.api.get<{ items: NotificationItem[] }>('/notifications').subscribe({
      next: (result) => this.notifications.set(result.items ?? []),
      error: () => this.notifications.set([]),
    });
  }

  toggleNotifications(): void {
    const next = !this.notificationsOpen();
    this.notificationsOpen.set(next);
    this.userOpen.set(false);
    if (next) this.loadNotifications();
  }

  openNotification(item: NotificationItem): void {
    this.notificationsOpen.set(false);
    void this.router.navigateByUrl(item.link);
  }

  notificationLabel(item: NotificationItem): string {
    if (item.type === 'approval') return 'อนุมัติ';
    if (item.tone === 'red') return 'เร่ง';
    return 'เตือน';
  }

  openPalette(): void {
    this.paletteQuery.set('');
    this.paletteIndex.set(0);
    this.recordResults.set([]);
    this.paletteOpen.set(true);
  }

  go(item: PaletteItem): void {
    this.paletteOpen.set(false);
    this.paletteQuery.set('');
    this.paletteIndex.set(0);
    this.recordResults.set([]);
    void this.router.navigateByUrl(item.path);
  }

  setPaletteQuery(value: string): void {
    this.paletteQuery.set(value);
    this.paletteIndex.set(0);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    const query = value.trim();
    if (query.length < 2) {
      this.recordResults.set([]);
      return;
    }
    this.searchTimer = setTimeout(() => {
      this.api.get<{ results: SearchResult[] }>('/search', { q: query, limit: 12 }).subscribe({
        next: (result) => {
          this.recordResults.set(result.results ?? []);
          this.paletteIndex.set(0);
        },
        error: () => this.recordResults.set([]),
      });
    }, 250);
  }

  paletteKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.paletteOpen.set(false);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.paletteIndex.update((index) => Math.min(this.paletteResults().length - 1, index + 1));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.paletteIndex.update((index) => Math.max(0, index - 1));
    }
    if (event.key === 'Enter') {
      const item = this.paletteResults()[Math.min(this.paletteIndex(), this.paletteResults().length - 1)];
      if (item) this.go(item);
    }
  }

  onOverlay(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.menuOpen.set(false);
      this.paletteOpen.set(false);
    }
  }

  private readonly hotkey = (event: KeyboardEvent): void => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.openPalette();
    }
    if (event.key === 'Escape') {
      this.menuOpen.set(false);
      this.paletteOpen.set(false);
      this.userOpen.set(false);
    }
  };
}

