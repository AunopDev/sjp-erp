import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { fmtDateTime } from '../core/util';
import { ModalComponent } from '../shared/modal.component';
import { ToastService } from '../shared/toast.service';
import { MetadataEditorComponent } from './metadata-editor.component';
import { WorkflowEditorComponent } from './workflow-editor.component';
import { RoleEditorComponent } from './role-editor.component';
import { BackupRestoreComponent } from './backup-restore.component';
import { EventsComponent } from './events.component';
import { NotifySettingsComponent } from './notify-settings.component';
import { CompanySettingsComponent } from './company-settings.component';
import { WebhooksComponent } from './webhooks.component';
import type { RoleRow, SafeUser } from '../core/models';

interface UserDraft {
  id?: string;
  username: string;
  name: string;
  roleId: string;
  dept: string;
  team: string;
  active: boolean;
  password: string;
  projectIds: string[];
  siteIds: string[];
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [ModalComponent, MetadataEditorComponent, WorkflowEditorComponent, RoleEditorComponent, BackupRestoreComponent, EventsComponent, NotifySettingsComponent, CompanySettingsComponent, WebhooksComponent],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>ตั้งค่าผู้ใช้และสิทธิ์</h1><div class="muted">จัดการบัญชี บทบาท และประวัติการใช้งาน</div></div></div>
      <div class="tabs settings-tabs">
        @if (auth.can('users','view')) { <button type="button" [class.active]="tab() === 'users'" (click)="tab.set('users')">ผู้ใช้</button> }
        @if (auth.can('roles','view')) { <button type="button" [class.active]="tab() === 'roles'" (click)="tab.set('roles')">บทบาท/สิทธิ์</button> }
        <button type="button" [class.active]="tab() === 'metadata'" (click)="tab.set('metadata')">โมดูล</button>
        <button type="button" [class.active]="tab() === 'workflow'" (click)="tab.set('workflow')">Workflow</button>
        <button type="button" [class.active]="tab() === 'notify'" (click)="tab.set('notify')">แจ้งเตือน</button>
        <button type="button" [class.active]="tab() === 'company'" (click)="tab.set('company')">บริษัท</button>
        <button type="button" [class.active]="tab() === 'webhooks'" (click)="tab.set('webhooks')">Webhook</button>
        <button type="button" [class.active]="tab() === 'backup'" (click)="tab.set('backup')">สำรอง</button>
        <button type="button" [class.active]="tab() === 'events'" (click)="tab.set('events')">เหตุการณ์</button>
        <button type="button" [class.active]="tab() === 'audit'" (click)="tab.set('audit')">ประวัติ</button>
      </div>

      @if (!auth.can('settings','view')) {
        <div class="state error">ไม่มีสิทธิ์เข้าถึงการตั้งค่า</div>
      } @else if (tab() === 'users' && auth.can('users','view')) {
        <div class="card">
          @if (auth.can('users','create')) { <button type="button" class="btn primary" style="margin-bottom:10px" (click)="openNew()">+ เพิ่มผู้ใช้</button> }
          <div class="table-wrap"><table class="tbl"><thead><tr><th>ชื่อผู้ใช้</th><th>ชื่อ-สกุล</th><th>บทบาท</th><th>แผนก</th><th>ทีม</th><th>สถานะ</th></tr></thead>
            <tbody>@for (user of users(); track user.id) { <tr class="click" (click)="auth.can('users','edit') && openEdit(user)"><td>{{ user.username }}</td><td>{{ user.name }}</td><td>{{ user.roleName }}</td><td>{{ user.dept }}</td><td>{{ user.team }}</td><td><span class="badge {{ user.active ? 'green' : 'gray' }}">{{ user.active ? 'ใช้งาน' : 'ปิด' }}</span></td></tr> }</tbody>
          </table></div>
        </div>
      }

      @if (tab() === 'roles' && auth.can('roles','view')) {
        <app-role-editor />
      }

      @if (tab() === 'metadata' && auth.can('settings','view')) {
        <app-metadata-editor />
      }

      @if (tab() === 'workflow' && auth.can('settings','view')) {
        <app-workflow-editor />
      }

      @if (tab() === 'backup' && auth.can('settings','view')) {
        <app-backup-restore />
      }

      @if (tab() === 'events' && auth.can('settings','view')) {
        <app-events />
      }

      @if (tab() === 'notify' && auth.can('settings','view')) {
        <app-notify-settings />
      }

      @if (tab() === 'company' && auth.can('settings','view')) {
        <app-company-settings />
      }

      @if (tab() === 'webhooks' && auth.can('settings','view')) {
        <app-webhooks />
      }

      @if (tab() === 'audit' && auth.can('settings','view')) {
        <div class="card">
          @if (!audit().length) { <div class="state empty">ยังไม่มีประวัติ</div> }
          @else { @for (entry of audit(); track entry['id']) { <div class="tl-item"><div class="tl-dot"></div><div><b>{{ entry['summary'] }}</b><div class="muted small">{{ entry['userName'] }} · {{ fmtDateTime(entry['at']) }}</div></div></div> } }
        </div>
      }
    </div>

    @if (userOpen()) {
      <app-modal [title]="draft()?.id ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้'" (closed)="userOpen.set(false)">
        @if (userError()) { <div class="notice bad" role="alert">{{ userError() }}</div> }
        <div class="form-grid">
          <div class="field"><label>ชื่อผู้ใช้ *</label><input [value]="draft()!.username" (input)="setDraft('username', $any($event.target).value)" /></div>
          <div class="field"><label>ชื่อ-สกุล *</label><input [value]="draft()!.name" (input)="setDraft('name', $any($event.target).value)" /></div>
          <div class="field"><label>บทบาท</label><select [value]="draft()!.roleId" (change)="setDraft('roleId', $any($event.target).value)">@for (role of roles(); track role.id) { <option [value]="role.id" [selected]="role.id === draft()!.roleId">{{ role.name }}</option> }</select></div>
          <div class="field"><label>{{ draft()!.id ? 'ตั้งรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)' : 'รหัสผ่าน * (อย่างน้อย 8 ตัว)' }}</label><input type="password" autocomplete="new-password" [value]="draft()!.password" (input)="setDraft('password', $any($event.target).value)" /></div>
          <div class="field"><label>แผนก</label><input [value]="draft()!.dept" (input)="setDraft('dept', $any($event.target).value)" /></div>
          <div class="field"><label>ทีม</label><input [value]="draft()!.team" (input)="setDraft('team', $any($event.target).value)" /></div>
          <label class="check"><input type="checkbox" [checked]="draft()!.active" (change)="setDraft('active', $any($event.target).checked)" /> เปิดใช้งานบัญชี</label>
        </div>
        <div modal-footer>
          <button type="button" class="btn" (click)="userOpen.set(false)">ยกเลิก</button>
          <button type="button" class="btn primary" [disabled]="userBusy()" (click)="saveUser()">บันทึก</button>
        </div>
      </app-modal>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly tab = signal<'users' | 'roles' | 'metadata' | 'workflow' | 'notify' | 'company' | 'webhooks' | 'backup' | 'events' | 'audit'>('users');
  readonly users = signal<SafeUser[]>([]);
  readonly roles = signal<RoleRow[]>([]);
  readonly audit = signal<Record<string, unknown>[]>([]);
  readonly userOpen = signal(false);
  readonly userBusy = signal(false);
  readonly userError = signal('');
  readonly draft = signal<UserDraft>(this.blank());
  readonly fmtDateTime = fmtDateTime;

  ngOnInit(): void {
    if (!this.auth.can('users','view')) {
      this.tab.set(this.auth.can('roles','view') ? 'roles' : 'metadata');
    }
    this.load();
  }

  load(): void {
    if (!this.auth.can('settings', 'view')) return;
    if (this.auth.can('users','view')) {
      this.api.get<SafeUser[]>('/users').subscribe({ next: (users) => this.users.set(users), error: (error: unknown) => this.toast.error(apiErrorMessage(error)) });
    }
    if (this.auth.can('roles','view')) {
      this.api.get<RoleRow[]>('/roles').subscribe({ next: (roles) => this.roles.set(roles), error: () => this.roles.set([]) });
    }
    this.api.get<Record<string, unknown>[]>('/audit', { limit: 100 }).subscribe({ next: (audit) => this.audit.set(audit), error: () => this.audit.set([]) });
  }

  openNew(): void {
    this.draft.set(this.blank());
    this.userError.set('');
    this.userOpen.set(true);
  }

  openEdit(user: SafeUser): void {
    if (!this.auth.can('settings', 'edit')) return;
    this.draft.set({
      id: user.id,
      username: user.username,
      name: user.name,
      roleId: user.roleId,
      dept: user.dept,
      team: user.team,
      active: user.active,
      password: '',
      projectIds: user.projectIds ?? [],
      siteIds: user.siteIds ?? [],
    });
    this.userError.set('');
    this.userOpen.set(true);
  }

  setDraft<K extends keyof UserDraft>(key: K, value: UserDraft[K]): void {
    this.draft.update((draft) => ({ ...draft, [key]: value }));
  }

  saveUser(): void {
    if (this.userBusy()) return;
    const draft = this.draft();
    this.userBusy.set(true);
    this.userError.set('');
    const body = { ...draft };
    if (!body.password) delete (body as Partial<UserDraft>).password;
    const request = draft.id
      ? this.api.patch<SafeUser>(`/users/${draft.id}`, body)
      : this.api.post<SafeUser>('/users', body);
    request.subscribe({
      next: () => {
        this.userBusy.set(false);
        this.userOpen.set(false);
        this.toast.show('บันทึกผู้ใช้แล้ว');
        this.load();
      },
      error: (error: unknown) => {
        this.userBusy.set(false);
        this.userError.set(apiErrorMessage(error));
      },
    });
  }

  private blank(): UserDraft {
    return {
      username: '',
      name: '',
      roleId: this.roles().find((role) => !role.isAdmin)?.id ?? this.roles()[0]?.id ?? 'helpdesk',
      dept: '',
      team: '',
      active: true,
      password: '',
      projectIds: [],
      siteIds: [],
    };
  }
}
