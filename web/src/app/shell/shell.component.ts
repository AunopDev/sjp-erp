import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { MetaService } from '../core/meta.service';
import { ToastService } from '../shared/toast.service';
import { IconComponent } from '../shared/icon.component';
import {
  readDensity,
  readNavClosedGroups,
  readNavFavorites,
  readSidebarCollapsed,
  readTheme,
  writeDensity,
  writeNavClosedGroups,
  writeNavFavorites,
  writeSidebarCollapsed,
  writeTheme,
} from '../core/storage';
import type { Density } from '../core/storage';
import type { SideNavGroup, SideNavItem } from './side-nav.component';
import { SideNavComponent } from './side-nav.component';
import type { QuickCreateAction } from './quick-create.component';
import { QuickCreateComponent } from './quick-create.component';

type NavItem = SideNavItem;
type NavGroup = SideNavGroup;

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
  vehicles: 'truck',
  vehicleBookings: 'calendar',
};

const GROUPS: NavGroup[] = [
  {
    label: 'ภาพรวม',
    icon: 'home',
    items: [
      { path: '/', label: 'หน้าแรก', short: 'หน้าแรก', icon: 'home' },
      { path: '/workspace', label: 'โต๊ะทำงาน', short: 'โต๊ะทำงาน', icon: 'grid' },
      { path: '/my', label: 'งานของฉัน', icon: 'check' },
      { path: '/calendar', label: 'ปฏิทินงาน', short: 'ปฏิทิน', icon: 'calendar' },
      { path: '/approvals', label: 'คำขออนุมัติ', icon: 'bell' },
    ],
  },
  {
    label: 'งานบริการและโครงการ',
    icon: 'wrench',
    items: [
      { path: '/tickets', label: 'แจ้งซ่อม', short: 'แจ้งซ่อม', icon: 'ticket', resource: 'tickets' },
      { path: '/pm', label: 'งาน PM', icon: 'wrench', resource: 'pm' },
      { path: '/projects', label: 'โครงการ', short: 'โครงการ', icon: 'folder', resource: 'projects' },
    ],
  },
  {
    label: 'ยานพาหนะ',
    icon: 'truck',
    items: [
      { path: '/vehicles', label: 'จองรถ', short: 'จองรถ', icon: 'calendar', resource: 'vehicleBookings' },
      { path: '/entities/vehicles', label: 'รถบริษัท', icon: 'truck', resource: 'vehicles' },
    ],
  },
  {
    label: 'จัดซื้อและคลัง',
    icon: 'box',
    items: [
      { path: '/purchase-orders', label: 'ใบสั่งซื้อ', icon: 'receipt', resource: 'purchase' },
      { path: '/warehouse', label: 'คลังสินค้า', short: 'คลัง', icon: 'box', resource: 'warehouse' },
    ],
  },
  {
    label: 'บัญชีและการเงิน',
    icon: 'receipt',
    items: [
      { path: '/entities/invoices', label: 'ใบแจ้งหนี้/วางบิล', icon: 'doc', resource: 'accounting' },
      { path: '/entities/receipts', label: 'ใบเสร็จ/รับชำระ', icon: 'receipt', resource: 'accounting' },
      { path: '/entities/expenses', label: 'ค่าใช้จ่าย', icon: 'chart', resource: 'accounting' },
    ],
  },
  {
    label: 'ข้อมูลหลัก',
    icon: 'building',
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
    icon: 'gear',
    items: [
      { path: '/reports', label: 'รายงานและส่งออก', icon: 'chart', resource: 'reports' },
      { path: '/settings', label: 'ตั้งค่า', short: 'ตั้งค่า', icon: 'gear', resource: 'settings' },
    ],
  },
];

const QUICK_ACTIONS: QuickCreateAction[] = [
  { label: 'แจ้งซ่อม', path: '/tickets/new', icon: 'ticket', resource: 'tickets' },
  { label: 'ใบสั่งซื้อ', path: '/purchase-orders?new=1', icon: 'receipt', resource: 'purchase' },
  { label: 'ใบแจ้งหนี้', path: '/entities/invoices?new=1', icon: 'doc', resource: 'accounting' },
  { label: 'รับชำระ', path: '/entities/receipts?new=1', icon: 'receipt', resource: 'accounting' },
  { label: 'ค่าใช้จ่าย', path: '/entities/expenses?new=1', icon: 'chart', resource: 'accounting' },
  { label: 'โครงการ', path: '/projects?new=1', icon: 'folder', resource: 'projects' },
  { label: 'จองรถ', path: '/vehicles?new=1', icon: 'calendar', resource: 'vehicleBookings' },
];

const DEFAULT_FAVORITES: string[] = [];
const DEFAULT_CLOSED_GROUPS = [
  ...GROUPS.map((group) => group.label).filter((label) => label !== 'ภาพรวม'),
  'โมดูลของฉัน',
];
const MAX_FAVORITES = 6;

const normalizeUrl = (url: string): string => url.split('?')[0].split('#')[0];

const matchesPath = (url: string, path: string): boolean => {
  const clean = normalizeUrl(url);
  if (path === '/') return clean === '/';
  return clean === path || clean.startsWith(`${path}/`);
};

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent, SideNavComponent, QuickCreateComponent],
  template: `
    <div class="app">
      <a class="skip-link" href="#main-content">ข้ามไปยังเนื้อหาหลัก</a>
      <app-side-nav
        class="sb-desktop"
        [mode]="sidebarCollapsed() ? 'rail' : 'expanded'"
        [groups]="visibleGroups()"
        [favorites]="favorites()"
        [closedGroups]="closedGroups()"
        [currentUrl]="currentUrl()"
        [pendingApprovals]="pendingApprovals()"
        [theme]="theme()"
        (toggleFavorite)="toggleFavorite($event)"
        (reorderFavorites)="reorderFavorites($event)"
        (toggleGroup)="toggleGroup($event)"
        (toggleCollapse)="toggleSidebar()"
        (toggleTheme)="toggleTheme()"
      />

      <div class="main2">
        <header class="top">
          <button class="menu-chip" type="button" (click)="openMenu()" aria-label="เปิดเมนู">
            <app-icon name="menu" [size]="18" /> <span class="menu-chip-label">เมนู</span>
          </button>
          <div class="crumbs">
            <span class="muted">{{ pageInfo().group }}</span>
            <app-icon name="chevron" [size]="16" />
            <b>{{ pageInfo().label }}</b>
          </div>
          <span class="grow"></span>
          <button class="search-box" type="button" (click)="openPalette()" aria-keyshortcuts="Control+K">
            <app-icon name="search" [size]="18" aria-hidden="true" />
            <span>ค้นหาทั่วระบบ…</span>
            <kbd aria-hidden="true">Ctrl K</kbd>
          </button>
          @if (quickActions().length || quickPrimary()) {
            <app-quick-create
              [currentUrl]="currentUrl()"
              [actions]="quickActions()"
              [primaryOverride]="quickPrimary()"
            />
          }
          <div class="pop-wrap">
            <button class="icon-btn approval-btn" type="button" (click)="toggleNotifications()" [attr.aria-expanded]="notificationsOpen()" [attr.aria-label]="notifications().length ? 'การแจ้งเตือน ' + notifications().length + ' รายการ' : 'การแจ้งเตือน'">
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
              <span class="user-name" [title]="auth.user()?.name">{{ auth.user()?.name }}</span>
            </button>
            @if (userOpen()) {
              <div class="popover right">
                <div class="pop-title">{{ auth.user()?.name }}<div class="muted small" style="font-weight:400">{{ auth.user()?.roleName }} · {{ auth.user()?.username }}</div></div>
                <button class="pop-row" type="button" (click)="toggleTheme()"><app-icon [name]="theme() === 'dark' ? 'sun' : 'moon'" /> {{ theme() === 'dark' ? 'ใช้โหมดสว่าง' : 'ใช้โหมดมืด' }}</button>
                <button class="pop-row" type="button" (click)="toggleDensity()"><app-icon name="columns" /> ความหนาแน่น: {{ density() === 'compact' ? 'กระชับ' : 'สบาย' }}</button>
                <button class="pop-row" type="button" (click)="auth.logout()"><app-icon name="logout" /> ออกจากระบบ</button>
              </div>
            }
          </div>
        </header>

        <main id="main-content" class="content" tabindex="-1"><router-outlet /></main>

        <nav class="bottombar" aria-label="ทางลัดด้านล่าง">
          @for (item of mobilePinned(); track item.path) {
            <a class="bb-item" [routerLink]="item.path" routerLinkActive="'active'" [routerLinkActiveOptions]="{ exact: item.path === '/' }">
              <span class="bb-ic"><app-icon [name]="item.icon" [size]="24" /></span><span>{{ item.short ?? item.label }}</span>
            </a>
          }
          <button class="bb-item" type="button" (click)="openMenu()"><span class="bb-ic"><app-icon name="grid" [size]="24" /></span><span>เมนู</span></button>
        </nav>
      </div>
    </div>

    @if (menuOpen()) {
      <div class="overlay sb-drawer-overlay" (mousedown)="onOverlay($event)">
        <app-side-nav
          class="sb-drawer-host"
          mode="drawer"
          [groups]="visibleGroups()"
          [favorites]="favorites()"
          [closedGroups]="closedGroups()"
          [currentUrl]="currentUrl()"
          [pendingApprovals]="pendingApprovals()"
          [theme]="theme()"
          (toggleFavorite)="toggleFavorite($event)"
          (reorderFavorites)="reorderFavorites($event)"
          (toggleGroup)="toggleGroup($event)"
          (toggleTheme)="toggleTheme()"
          (closeDrawer)="closeMenu()"
        />
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
export class ShellComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  private readonly meta = inject(MetaService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly menuOpen = signal(false);
  readonly userOpen = signal(false);
  readonly paletteOpen = signal(false);
  readonly paletteQuery = signal('');
  readonly paletteIndex = signal(0);
  readonly recordResults = signal<SearchResult[]>([]);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  readonly theme = signal(readTheme());
  readonly density = signal<Density>(readDensity());
  readonly sidebarCollapsed = signal(readSidebarCollapsed());
  readonly currentUrl = signal(this.router.url);
  readonly pendingApprovals = signal(0);
  readonly notifications = signal<NotificationItem[]>([]);
  readonly notificationsOpen = signal(false);

  constructor() {
    effect(() => {
      const url = this.currentUrl();
      const groups = this.visibleGroups();
      untracked(() => this.syncActiveGroup(url, groups));
    });
  }

  private readonly storedFavorites = signal<string[] | null>(readNavFavorites());
  readonly closedGroups = signal<string[]>(readNavClosedGroups() ?? DEFAULT_CLOSED_GROUPS);

  readonly visibleGroups = computed<NavGroup[]>(() => {
    const groups: NavGroup[] = GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.resource || this.auth.can(item.resource, 'view')),
    })).filter((group) => group.items.length);
    const custom = (this.meta.meta()?.customModules ?? [])
      .filter((entity) => this.auth.can(entity.key, 'view'));
    const ungrouped: NavItem[] = [];
    for (const entity of custom) {
      const item: NavItem = {
        path: `/entities/${entity.key}`,
        label: entity.navLabel || entity.label,
        icon: entity.icon || 'puzzle',
        resource: entity.key,
      };
      const target = entity.group ? groups.find((group) => group.label === entity.group) : undefined;
      if (target) target.items = [...target.items, item];
      else ungrouped.push(item);
    }
    return ungrouped.length ? [...groups, { label: 'โมดูลของฉัน', icon: 'puzzle', items: ungrouped }] : groups;
  });

  private readonly allNavItems = computed<NavItem[]>(() => this.visibleGroups().flatMap((group) => group.items));
  private readonly visiblePaths = computed(() => new Set(this.allNavItems().map((item) => item.path)));

  readonly favorites = computed<string[]>(() => {
    const visible = this.visiblePaths();
    const base = this.storedFavorites() ?? DEFAULT_FAVORITES;
    return base.filter((path) => visible.has(path)).slice(0, MAX_FAVORITES);
  });

  readonly mobilePinned = computed<NavItem[]>(() => {
    const items = this.allNavItems();
    const preferred = this.favorites().length ? this.favorites() : DEFAULT_FAVORITES;
    const picked = preferred
      .map((path) => items.find((item) => item.path === path))
      .filter((item): item is NavItem => !!item)
      .slice(0, 3);
    return picked.length ? picked : items.slice(0, 3);
  });

  readonly quickActions = computed<QuickCreateAction[]>(() =>
    QUICK_ACTIONS.filter((action) => this.auth.can(action.resource ?? '', 'create')),
  );

  readonly quickPrimary = computed<QuickCreateAction | null>(() => {
    const url = normalizeUrl(this.currentUrl());
    const key = url.match(/^\/entities\/([^/]+)/)?.[1];
    if (!key || ['invoices', 'receipts', 'expenses'].includes(key)) return null;
    const def = this.meta.entity(key);
    if (!def || !this.auth.can(def.resource, 'create')) return null;
    const label = def.label.length + 5 > 16 ? 'เพิ่ม' : `เพิ่ม${def.label}`;
    return { label, path: `/entities/${key}?new=1`, icon: 'plus', resource: def.resource };
  });

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
    return hit ? { label: hit.label.length > 28 ? 'รายการ' : hit.label, group: hit.group } : { label: 'หน้า', group: 'SJP ERP' };
  });

  readonly initials = computed(() => (this.auth.user()?.name ?? '?').trim().charAt(0));

  ngOnInit(): void {
    document.documentElement.dataset['theme'] = this.theme();
    document.documentElement.dataset['density'] = this.density();
    this.meta.load();
    this.loadApprovals();
    this.loadNotifications();
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((event) => {
      const url = (event as NavigationEnd).urlAfterRedirects;
      this.currentUrl.set(url);
      this.closeMenu();
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

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.hotkey);
    document.body.classList.remove('sb-lock');
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  toggleTheme(): void {
    const next = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    document.documentElement.dataset['theme'] = next;
    writeTheme(next);
  }

  toggleDensity(): void {
    const next: Density = this.density() === 'compact' ? 'comfy' : 'compact';
    this.density.set(next);
    document.documentElement.dataset['density'] = next;
    writeDensity(next);
  }

  toggleSidebar(): void {
    const next = !this.sidebarCollapsed();
    this.sidebarCollapsed.set(next);
    writeSidebarCollapsed(next);
  }

  openMenu(): void {
    this.menuOpen.set(true);
    document.body.classList.add('sb-lock');
  }

  closeMenu(): void {
    this.menuOpen.set(false);
    document.body.classList.remove('sb-lock');
  }

  toggleFavorite(path: string): void {
    const current = this.favorites();
    if (!current.includes(path) && current.length >= MAX_FAVORITES) {
      this.toast.error(`ปักหมุดได้สูงสุด ${MAX_FAVORITES} รายการ`);
      return;
    }
    const next = current.includes(path) ? current.filter((item) => item !== path) : [...current, path];
    this.storedFavorites.set(next);
    writeNavFavorites(next);
  }

  reorderFavorites(paths: string[]): void {
    const visible = new Set(this.favorites());
    const next = paths.filter((path) => visible.has(path)).slice(0, MAX_FAVORITES);
    this.storedFavorites.set(next);
    writeNavFavorites(next);
  }

  toggleGroup(label: string): void {
    const labels = this.visibleGroups().map((group) => group.label);
    const current = this.closedGroups();
    const next = current.includes(label)
      ? labels.filter((item) => item !== label)
      : [...new Set([...current, label])];
    this.closedGroups.set(next);
    writeNavClosedGroups(next);
  }

  private syncActiveGroup(url: string, groups: NavGroup[]): void {
    const group = groups.find((candidate) =>
      candidate.items.some((item) => matchesPath(url, item.path)),
    );
    if (!group) return;
    const closed = this.closedGroups();
    const next = groups.map((candidate) => candidate.label).filter((label) => label !== group.label);
    if (next.join('|') === closed.join('|')) return;
    this.closedGroups.set(next);
    writeNavClosedGroups(next);
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
    if (item.type === 'vehicle') return 'จองรถ';
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
      this.closeMenu();
      this.paletteOpen.set(false);
    }
  }

  private readonly hotkey = (event: KeyboardEvent): void => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.openPalette();
    }
    if (event.key === 'Escape') {
      this.closeMenu();
      this.paletteOpen.set(false);
      this.userOpen.set(false);
    }
  };
}

