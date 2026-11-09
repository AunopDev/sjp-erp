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

@Component({
  selector: 'app-role-editor',
  standalone: true,
  template: `
    <div class="card">
      <p class="muted small">เลือกบทบาท แล้วกำหนดสิทธิ์รายทรัพยากร/โมดูล บทบาทผู้ดูแลระบบแก้ไขไม่ได้</p>
      <div class="form-grid">
        <div class="field"><label>บทบาท</label>
          <select [value]="selectedId()" (change)="choose($any($event.target).value)">
            @for (role of roles(); track role.id) { <option [value]="role.id" [selected]="role.id === selectedId()">{{ role.name }}{{ role.isAdmin ? ' (ผู้ดูแลระบบ)' : '' }}</option> }
          </select>
        </div>
        @if (draft(); as role) {
          <div class="field"><label>ชื่อบทบาท</label><input [value]="role.name" [disabled]="role.isAdmin" (input)="setName($any($event.target).value)" /></div>
          <div class="field"><label>ขอบเขตข้อมูล</label><select [value]="role.scope" [disabled]="role.isAdmin" (change)="setScope($any($event.target).value)">@for (scope of scopes; track scope[0]) { <option [value]="scope[0]" [selected]="scope[0] === role.scope">{{ scope[1] }}</option> }</select></div>
        }
      </div>

      @if (draft(); as role) {
        <div class="table-wrap" style="margin-top:12px"><table class="tbl">
          <thead><tr><th>ทรัพยากร / โมดูล</th>@for (action of actions; track action[0]) { <th>{{ action[1] }}</th> }</tr></thead>
          <tbody>
            @for (resource of resources(); track resource) {
              <tr>
                <td>{{ labelOf(resource) }} <span class="muted small">({{ resource }})</span></td>
                @for (action of actions; track action[0]) {
                  <td><input type="checkbox" [checked]="has(resource, action[0])" [disabled]="role.isAdmin" (change)="toggle(resource, action[0], $any($event.target).checked)" /></td>
                }
              </tr>
            }
          </tbody>
        </table></div>
        @if (!role.isAdmin) {
          <div class="row" style="margin-top:12px"><span class="grow"></span><button type="button" class="btn primary" [disabled]="busy() || !auth.can('roles','edit')" (click)="save()">{{ busy() ? 'กำลังบันทึก…' : 'บันทึกสิทธิ์' }}</button></div>
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

  readonly resources = computed(() => {
    const meta = this.meta.meta() as (MetaResponse & { resources?: Record<string, string> }) | null;
    const fromMeta = Object.keys(meta?.resources ?? {});
    const fromPerms = Object.keys(this.draft()?.perms ?? {});
    const fromEntities = Object.values(meta?.entities ?? {}).map((entity) => entity.resource ?? entity.key);
    return [...new Set([...fromMeta, ...fromEntities, ...fromPerms])].sort();
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
      const perms = { ...role.perms, [resource]: { ...(role.perms[resource] ?? {}), [action]: checked } };
      return { ...role, perms };
    });
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
