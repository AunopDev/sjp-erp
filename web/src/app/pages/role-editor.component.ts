import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { MetaService } from '../core/meta.service';
import { ToastService } from '../shared/toast.service';
import type { MetaResponse, RoleRow } from '../core/models';

const ACTIONS: [string, string][] = [
  ['view', 'ดู'],
  ['create', 'สร้าง'],
  ['edit', 'แก้ไข'],
  ['delete', 'ลบ'],
  ['export', 'ส่งออก'],
  ['assign', 'มอบหมาย'],
  ['close', 'ปิดงาน'],
  ['approve', 'อนุมัติ'],
];

const SCOPES: [string, string][] = [
  ['all', 'ทั้งหมด'],
  ['dept', 'ตามแผนก'],
  ['team', 'ตามทีม'],
  ['project', 'ตามโครงการ'],
  ['site', 'ตามไซต์'],
  ['own', 'เฉพาะของตน'],
];

const RESOURCE_GROUPS: Record<string, string> = {
  tickets: 'งานบริการ',
  pm: 'งานบริการ',
  projects: 'โครงการ',
  purchase: 'จัดซื้อและคลัง',
  warehouse: 'จัดซื้อและคลัง',
  assets: 'จัดซื้อและคลัง',
  vehicles: 'ยานพาหนะ',
  vehicleBookings: 'ยานพาหนะ',
  accounting: 'บัญชีและการเงิน',
  master: 'ข้อมูลหลัก',
  users: 'ระบบ',
  roles: 'ระบบ',
  settings: 'ระบบ',
  reports: 'ระบบ',
};

interface PermissionPreset {
  key: string;
  label: string;
  perms: Record<string, Record<string, boolean>>;
}

const PRESETS: PermissionPreset[] = [
  {
    key: 'service',
    label: 'ทีมบริการ',
    perms: {
      tickets: { view: true, create: true, edit: true, assign: true, close: true },
      pm: { view: true, edit: true },
      projects: { view: true },
      master: { view: true },
      assets: { view: true },
      vehicles: { view: true },
      vehicleBookings: { view: true, create: true, edit: true },
    },
  },
  {
    key: 'project',
    label: 'ทีมโครงการ',
    perms: {
      projects: { view: true, create: true, edit: true, close: true },
      purchase: { view: true },
      warehouse: { view: true },
      master: { view: true },
      tickets: { view: true },
    },
  },
  {
    key: 'warehouse',
    label: 'จัดซื้อ/คลัง',
    perms: {
      purchase: { view: true, create: true, edit: true },
      warehouse: { view: true, create: true, edit: true },
      assets: { view: true, create: true, edit: true },
      master: { view: true },
    },
  },
  {
    key: 'accounting',
    label: 'บัญชี',
    perms: {
      accounting: { view: true, create: true, edit: true, export: true },
      purchase: { view: true },
      master: { view: true },
      reports: { view: true },
    },
  },
  {
    key: 'manager',
    label: 'ผู้จัดการ',
    perms: {
      tickets: { view: true, approve: true, close: true },
      pm: { view: true, approve: true },
      projects: { view: true, approve: true, close: true },
      purchase: { view: true, approve: true },
      warehouse: { view: true },
      accounting: { view: true, approve: true },
      master: { view: true },
      reports: { view: true },
      vehicles: { view: true },
      vehicleBookings: { view: true, approve: true },
    },
  },
];

@Component({
  selector: 'app-role-editor',
  standalone: true,
  template: `
    <div class="card">
      <p class="muted small">เลือกบทบาท แล้วกำหนดสิทธิ์รายทรัพยากร/โมดูล บทบาทผู้ดูแลระบบแก้ไขไม่ได้</p>
      <div class="form-grid">
        <div class="field"><label for="lf-role-editor-component-1">บทบาท</label>
          <select id="lf-role-editor-component-1" [value]="selectedId()" (change)="choose($any($event.target).value)">
            @for (role of roles(); track role.id) { <option [value]="role.id" [selected]="role.id === selectedId()">{{ role.name }}{{ role.isAdmin ? ' (ผู้ดูแลระบบ)' : '' }}</option> }
          </select>
        </div>
        @if (draft(); as role) {
          <div class="field"><label for="lf-role-editor-component-2">ชื่อบทบาท</label><input id="lf-role-editor-component-2" [value]="role.name" [disabled]="role.isAdmin" (input)="setName($any($event.target).value)" /></div>
          <div class="field"><label for="lf-role-editor-component-3">ขอบเขตข้อมูล</label><select id="lf-role-editor-component-3" [value]="role.scope" [disabled]="role.isAdmin" (change)="setScope($any($event.target).value)">@for (scope of scopes; track scope[0]) { <option [value]="scope[0]" [selected]="scope[0] === role.scope">{{ scope[1] }}</option> }</select></div>
        }
      </div>

      @if (draft(); as role) {
        <div class="role-tools">
          <input class="role-search" type="search" [value]="search()" (input)="search.set($any($event.target).value)" placeholder="ค้นหาทรัพยากร/โมดูล…" aria-label="ค้นหาทรัพยากร" />
          <span class="grow"></span>
          @for (preset of presets; track preset.key) {
            <button type="button" class="btn sm" [disabled]="role.isAdmin" (click)="applyPreset(preset.key)">{{ preset.label }}</button>
          }
          <button type="button" class="btn sm" [disabled]="role.isAdmin" (click)="grantViewAll()">ดูทั้งหมด</button>
          <button type="button" class="btn sm" [disabled]="role.isAdmin" (click)="clearPerms()">ล้างสิทธิ์</button>
        </div>
        <div class="table-wrap role-table-wrap" style="margin-top:10px"><table class="tbl role-matrix">
          <thead><tr><th scope="col">ทรัพยากร / โมดูล</th>@for (action of actions; track action[0]) { <th scope="col">{{ action[1] }}</th> }</tr></thead>
          <tbody>
            @for (group of filteredGroups(); track group.label) {
              <tr class="role-group-row"><td [attr.colspan]="actions.length + 1">{{ group.label }}</td></tr>
              @for (resource of group.resources; track resource) {
                <tr>
                  <td>{{ labelOf(resource) }} <span class="role-resource-key muted small">({{ resource }})</span></td>
                  @for (action of actions; track action[0]) {
                    <td><input type="checkbox" [checked]="has(resource, action[0])" [disabled]="role.isAdmin" (change)="toggle(resource, action[0], $any($event.target).checked)" /></td>
                  }
                </tr>
              }
            }
          </tbody>
        </table></div>
        <div class="role-cards">
          @for (group of filteredGroups(); track group.label) {
            <div class="role-card-group">
              <div class="role-card-group-title">{{ group.label }}</div>
              @for (resource of group.resources; track resource) {
                <div class="role-card">
                  <div class="role-card-head">
                    <b>{{ labelOf(resource) }}</b>
                    <span class="role-resource-key muted small">{{ resource }}</span>
                  </div>
                  <div class="role-card-actions">
                    @for (action of actions; track action[0]) {
                      <label class="check" [class.on]="has(resource, action[0])">
                        <input type="checkbox" [checked]="has(resource, action[0])" [disabled]="role.isAdmin" (change)="toggle(resource, action[0], $any($event.target).checked)" />
                        {{ action[1] }}
                      </label>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </div>
        @if (!role.isAdmin) {
          <div class="form-actions"><span class="grow"></span><button type="button" class="btn primary" [disabled]="busy() || !auth.can('roles','edit')" (click)="save()">{{ busy() ? 'กำลังบันทึก…' : 'บันทึกสิทธิ์' }}</button></div>
        }
        @if (message()) { <div class="err">{{ message() }}</div> }
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleEditorComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly meta = inject(MetaService);
  private readonly toast = inject(ToastService);
  readonly auth = inject(AuthService);

  readonly roles = signal<RoleRow[]>([]);
  readonly selectedId = signal('');
  readonly draft = signal<RoleRow | null>(null);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly actions = ACTIONS;
  readonly scopes = SCOPES;

  readonly search = signal('');
  readonly presets = PRESETS;

  readonly resources = computed(() => {
    const meta = this.meta.meta() as (MetaResponse & { resources?: Record<string, string> }) | null;
    const fromMeta = Object.keys(meta?.resources ?? {});
    const fromPerms = Object.keys(this.draft()?.perms ?? {});
    const fromEntities = Object.values(meta?.entities ?? {}).map((entity) => entity.resource ?? entity.key);
    return [...new Set([...fromMeta, ...fromEntities, ...fromPerms])].sort();
  });

  readonly filteredGroups = computed(() => {
    const query = this.search().trim().toLowerCase();
    const order = ['งานบริการ', 'โครงการ', 'จัดซื้อและคลัง', 'ยานพาหนะ', 'บัญชีและการเงิน', 'ข้อมูลหลัก', 'ระบบ', 'โมดูลที่สร้างเอง'];
    const groups = new Map<string, string[]>();
    for (const resource of this.resources()) {
      const label = this.labelOf(resource);
      if (query && !`${label} ${resource}`.toLowerCase().includes(query)) continue;
      const group = RESOURCE_GROUPS[resource] ?? 'โมดูลที่สร้างเอง';
      groups.set(group, [...(groups.get(group) ?? []), resource]);
    }
    return [...groups.entries()]
      .sort((a, b) => {
        const ai = order.indexOf(a[0]);
        const bi = order.indexOf(b[0]);
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a[0].localeCompare(b[0], 'th');
      })
      .map(([label, resources]) => ({ label, resources }));
  });

  ngOnInit(): void {
    this.load();
    this.meta.load();
  }

  load(): void {
    this.api.get<RoleRow[]>('/roles').subscribe({
      next: (roles) => {
        this.roles.set(roles);
        const id = this.selectedId() && roles.some((role) => role.id === this.selectedId())
          ? this.selectedId()
          : (roles.find((role) => !role.isAdmin)?.id ?? roles[0]?.id ?? '');
        if (id) this.choose(id);
      },
      error: (error: unknown) => this.toast.error(apiErrorMessage(error)),
    });
  }

  choose(id: string): void {
    const role = this.roles().find((item) => item.id === id);
    if (!role) return;
    this.selectedId.set(id);
    this.draft.set(JSON.parse(JSON.stringify(role)) as RoleRow);
    this.message.set('');
  }

  labelOf(resource: string): string {
    const meta = this.meta.meta() as (MetaResponse & { resources?: Record<string, string> }) | null;
    return meta?.resources?.[resource] ?? resource;
  }

  has(resource: string, action: string): boolean {
    return !!this.draft()?.perms?.[resource]?.[action];
  }

  toggle(resource: string, action: string, checked: boolean): void {
    this.draft.update((role) => {
      if (!role) return role;
      if (action === 'view' && !checked) {
        const perms = { ...role.perms };
        delete perms[resource];
        return { ...role, perms };
      }
      const current = role.perms[resource] ?? {};
      const perms = {
        ...role.perms,
        [resource]: {
          ...current,
          [action]: checked,
          ...(checked && action !== 'view' ? { view: true } : {}),
        },
      };
      return { ...role, perms };
    });
  }

  applyPreset(key: string): void {
    const preset = this.presets.find((item) => item.key === key);
    if (!preset) return;
    this.draft.update((role) =>
      role ? { ...role, perms: JSON.parse(JSON.stringify(preset.perms)) as RoleRow['perms'] } : role,
    );
  }

  grantViewAll(): void {
    this.draft.update((role) => {
      if (!role) return role;
      const perms = { ...role.perms };
      for (const resource of this.resources()) {
        perms[resource] = { ...(perms[resource] ?? {}), view: true };
      }
      return { ...role, perms };
    });
  }

  clearPerms(): void {
    this.draft.update((role) => (role ? { ...role, perms: {} } : role));
  }

  setName(name: string): void {
    this.draft.update((role) => (role ? { ...role, name } : role));
  }

  setScope(scope: string): void {
    this.draft.update((role) => (role ? { ...role, scope } : role));
  }

  save(): void {
    const role = this.draft();
    if (!role || role.isAdmin || this.busy()) return;
    this.busy.set(true);
    this.message.set('');
    this.api.put<RoleRow>(`/meta/roles/${role.id}`, { name: role.name, scope: role.scope, perms: role.perms }).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.show('บันทึกสิทธิ์แล้ว');
        this.load();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.message.set(apiErrorMessage(error));
      },
    });
  }
}
