import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService } from '../core/auth.service';
import { MetaService } from '../core/meta.service';
import { ThemeService } from '../core/theme.service';
import type { Density, ThemePref } from '../core/storage';

const ACTION_LABELS: Record<string, string> = {
  view: 'ดู',
  create: 'สร้าง',
  edit: 'แก้ไข',
  assign: 'มอบหมาย',
  approve: 'อนุมัติ',
  export: 'ส่งออก',
  close: 'ปิดงาน',
  delete: 'ลบ',
};

const SCOPE_LABELS: Record<string, string> = {
  all: 'ทั้งบริษัท',
  dept: 'ตามแผนก',
  team: 'ตามทีม',
  project: 'เฉพาะโครงการที่ดูแล',
  site: 'เฉพาะไซต์ที่ดูแล',
  own: 'เฉพาะรายการของฉัน',
};

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePref; label: string }> = [
  { value: 'system', label: 'ตามเครื่อง' },
  { value: 'light', label: 'สว่าง' },
  { value: 'dark', label: 'มืด' },
];

@Component({
  selector: 'app-account',
  standalone: true,
  template: `
    <div class="page acct">
      <div class="page-head">
        <div>
          <h1>บัญชีของฉัน</h1>
          <div class="muted">ข้อมูล · หน้าตา · สิทธิ์การใช้งาน</div>
        </div>
        <div class="page-actions">
          <button type="button" class="btn" (click)="auth.logout()">ออกจากระบบ</button>
        </div>
      </div>

      <div class="grid c2">
        <div class="card">
          <h2>ข้อมูลบัญชี</h2>
          <div class="acct-id">
            <span class="avatar acct-avatar" aria-hidden="true">{{ initials() }}</span>
            <div class="acct-id-text">
              <b>{{ auth.user()?.name }}</b>
              <span class="muted">{{ auth.user()?.username }}</span>
            </div>
            <span class="badge" [class.green]="auth.user()?.active" [class.red]="!auth.user()?.active">
              {{ auth.user()?.active ? 'ใช้งาน' : 'ระงับ' }}
            </span>
          </div>
          <dl class="acct-list">
            <div><dt>บทบาท</dt><dd>{{ auth.user()?.roleName || '—' }}@if (auth.user()?.isAdmin && auth.user()?.roleName !== 'ผู้ดูแลระบบ') { · ผู้ดูแลระบบ }</dd></div>
            @if (auth.user()?.dept) { <div><dt>แผนก</dt><dd>{{ auth.user()?.dept }}</dd></div> }
            @if (auth.user()?.team) { <div><dt>ทีม</dt><dd>{{ auth.user()?.team }}</dd></div> }
            <div><dt>ขอบเขตข้อมูล</dt><dd>{{ scopeLabel() }}</dd></div>
            <div><dt>โครงการที่ดูแล</dt><dd>{{ auth.user()?.projectIds?.length || 0 }} โครงการ</dd></div>
            <div><dt>ไซต์ที่ดูแล</dt><dd>{{ auth.user()?.siteIds?.length || 0 }} ไซต์</dd></div>
          </dl>
          <p class="acct-hint">ชื่อ · ชื่อผู้ใช้ · บทบาท · ขอบเขตข้อมูล แก้ได้โดยผู้ดูแลระบบเท่านั้น</p>
        </div>

        <div class="card">
          <h2>ภาษาและหน้าตา</h2>
          <div class="acct-field">
            <span class="acct-label" id="acct-theme">ธีม</span>
            <div class="seg" role="group" aria-labelledby="acct-theme">
              @for (option of themeOptions; track option.value) {
                <button
                  type="button"
                  class="seg-btn"
                  [class.on]="theme.pref() === option.value"
                  [attr.aria-pressed]="theme.pref() === option.value"
                  (click)="theme.setPref(option.value)"
                >{{ option.label }}</button>
              }
            </div>
            <p class="acct-hint">“ตามเครื่อง” สลับสว่าง/มืดตามระบบปฏิบัติการให้เอง</p>
          </div>
          <div class="acct-field">
            <span class="acct-label" id="acct-density">ความหนาแน่นตาราง</span>
            <div class="seg" role="group" aria-labelledby="acct-density">
              <button type="button" class="seg-btn" [class.on]="theme.density() === 'compact'" [attr.aria-pressed]="theme.density() === 'compact'" (click)="setDensity('compact')">กระชับ</button>
              <button type="button" class="seg-btn" [class.on]="theme.density() === 'comfy'" [attr.aria-pressed]="theme.density() === 'comfy'" (click)="setDensity('comfy')">สบาย</button>
            </div>
            <p class="acct-hint">มีผลกับตารางและฟอร์มทั้งระบบ · จำค่าไว้ในเครื่องนี้</p>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="acct-perm-head">
          <h2>สิทธิ์ของฉัน</h2>
          <span class="badge gray">{{ permSummary() }}</span>
        </div>
        <p class="acct-hint">มาจากบทบาทที่ผู้ดูแลกำหนด · เปลี่ยนแล้วมีผลเมื่อเข้าสู่ระบบใหม่หรือภายในไม่กี่นาที</p>
        @if (auth.user()?.isAdmin) {
          <div class="acct-admin">ผู้ดูแลระบบ — เข้าได้ทุกโมดูลและทุกการกระทำ</div>
        }
        @if (!resourceRows().length) {
          <div class="state empty">บัญชีนี้ยังไม่ได้รับสิทธิ์ในโมดูลใด</div>
        } @else {
          <div class="acct-perms">
            @for (row of resourceRows(); track row.key) {
              <div class="acct-perm">
                <div class="acct-perm-name">{{ row.label }}</div>
                <div class="acct-perm-actions">
                  @for (action of row.actions; track action) {
                    <span class="perm-chip">{{ action }}</span>
                  }
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountComponent {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  private readonly meta = inject(MetaService);

  readonly themeOptions = THEME_OPTIONS;

  readonly initials = computed(() => (this.auth.user()?.name ?? '?').trim().charAt(0));

  readonly scopeLabel = computed(() => SCOPE_LABELS[this.auth.user()?.scope ?? ''] ?? this.auth.user()?.scope ?? '—');

  readonly resourceRows = computed<{ key: string; label: string; actions: string[] }[]>(() => {
    const user = this.auth.user();
    if (!user) return [];
    const labels = this.meta.meta()?.resources ?? {};
    if (user.isAdmin) {
      return Object.entries(labels)
        .map(([key, label]) => ({ key, label, actions: ['ทั้งหมด'] }))
        .sort((a, b) => a.label.localeCompare(b.label, 'th'));
    }
    return Object.entries(user.perms ?? {})
      .map(([key, actions]) => ({
        key,
        label: labels[key] ?? key,
        actions: Object.entries(actions ?? {})
          .filter(([, enabled]) => enabled)
          .map(([action]) => ACTION_LABELS[action] ?? action),
      }))
      .filter((row) => row.actions.length > 0)
      .sort((a, b) => a.label.localeCompare(b.label, 'th'));
  });

  readonly permSummary = computed(() => {
    if (this.auth.user()?.isAdmin) return `${this.resourceRows().length} โมดูล · ทั้งหมด`;
    const total = this.resourceRows().reduce((sum, row) => sum + row.actions.length, 0);
    return `${total} สิทธิ์ · ${this.resourceRows().length} โมดูล`;
  });

  setDensity(density: Density): void {
    this.theme.density.set(density);
  }
}
