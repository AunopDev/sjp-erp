import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ToastService } from '../shared/toast.service';

interface NotifyConfig {
  emailEnabled: boolean;
  lineEnabled: boolean;
  autoApproval: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  mailFrom: string;
  mailTo: string;
  lineToken: string;
  lineTo: string;
  smtpPassSet?: boolean;
  lineTokenSet?: boolean;
  envFallback?: { smtp: boolean; line: boolean };
}

const EMPTY: NotifyConfig = {
  emailEnabled: false,
  lineEnabled: false,
  autoApproval: true,
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '',
  mailFrom: '',
  mailTo: '',
  lineToken: '',
  lineTo: '',
};

@Component({
  selector: 'app-notify-settings',
  standalone: true,
  template: `
    <div class="card">
      <div class="row" style="margin-bottom:8px">
        <div>
          <h3 style="margin:0">แจ้งเตือนอีเมล / LINE</h3>
          <div class="muted small">ใช้แจ้งเตือนคำขออนุมัติอัตโนมัติ และทดสอบช่องทางได้ทันที</div>
        </div>
        <span class="grow"></span>
        <button type="button" class="btn primary" [disabled]="busy()" (click)="save()">{{ busy() ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า' }}</button>
      </div>

      <label class="check" style="margin:8px 0">
        <input type="checkbox" [checked]="config().autoApproval" (change)="set('autoApproval', $any($event.target).checked)" />
        ส่งแจ้งเตือนอัตโนมัติเมื่อมีคำขออนุมัติ / ผลอนุมัติ
      </label>

      <div class="notify-grid">
        <div class="notify-card">
          <div class="row"><h4>อีเมล (SMTP)</h4><span class="grow"></span><label class="check"><input type="checkbox" [checked]="config().emailEnabled" (change)="set('emailEnabled', $any($event.target).checked)" /> เปิดใช้งาน</label></div>
          <div class="form-grid">
            <div class="field"><label for="lf-notify-settings-component-1">SMTP Host</label><input id="lf-notify-settings-component-1" [value]="config().smtpHost" (input)="set('smtpHost', $any($event.target).value)" placeholder="smtp.example.com" /></div>
            <div class="field"><label for="lf-notify-settings-component-2">Port</label><input id="lf-notify-settings-component-2" type="number" [value]="config().smtpPort" (input)="set('smtpPort', +$any($event.target).value)" /></div>
            <div class="field"><label for="lf-notify-settings-component-3">ผู้ใช้ SMTP</label><input id="lf-notify-settings-component-3" [value]="config().smtpUser" (input)="set('smtpUser', $any($event.target).value)" /></div>
            <div class="field"><label for="lf-notify-settings-component-4">รหัสผ่าน {{ config().smtpPassSet ? '(ตั้งไว้แล้ว)' : '' }}</label><input id="lf-notify-settings-component-4" type="password" [value]="config().smtpPass" (input)="set('smtpPass', $any($event.target).value)" placeholder="เว้นว่างเพื่อใช้ค่าเดิม" /></div>
            <div class="field"><label for="lf-notify-settings-component-5">จาก (From)</label><input id="lf-notify-settings-component-5" [value]="config().mailFrom" (input)="set('mailFrom', $any($event.target).value)" placeholder="SJP ERP &lt;no-reply@example.com&gt;" /></div>
            <div class="field"><label for="lf-notify-settings-component-6">ถึง (คั่นด้วย , หรือ ;)</label><input id="lf-notify-settings-component-6" [value]="config().mailTo" (input)="set('mailTo', $any($event.target).value)" placeholder="ops@example.com" /></div>
            <label class="check"><input type="checkbox" [checked]="config().smtpSecure" (change)="set('smtpSecure', $any($event.target).checked)" /> ใช้ TLS/SSL (port 465)</label>
          </div>
          @if (config().envFallback?.smtp) { <div class="muted small" style="margin-top:6px">มีการตั้งค่า SMTP ผ่าน environment และจะถูกใช้เมื่อช่องว่าง</div> }
          <button type="button" class="btn sm" style="margin-top:10px" [disabled]="testing() !== ''" (click)="test('email')">{{ testing() === 'email' ? 'กำลังส่ง…' : 'ส่งอีเมลทดสอบ' }}</button>
        </div>

        <div class="notify-card">
          <div class="row"><h4>LINE Messaging API</h4><span class="grow"></span><label class="check"><input type="checkbox" [checked]="config().lineEnabled" (change)="set('lineEnabled', $any($event.target).checked)" /> เปิดใช้งาน</label></div>
          <div class="form-grid">
            <div class="field wide"><label for="lf-notify-settings-component-7">Channel Access Token {{ config().lineTokenSet ? '(ตั้งไว้แล้ว)' : '' }}</label><input id="lf-notify-settings-component-7" type="password" [value]="config().lineToken" (input)="set('lineToken', $any($event.target).value)" placeholder="เว้นว่างเพื่อใช้ค่าเดิม" /></div>
            <div class="field wide"><label for="lf-notify-settings-component-8">ปลายทาง (User/Group ID)</label><input id="lf-notify-settings-component-8" [value]="config().lineTo" (input)="set('lineTo', $any($event.target).value)" placeholder="Uxxxxxxxx..." /></div>
          </div>
          @if (config().envFallback?.line) { <div class="muted small" style="margin-top:6px">มีการตั้งค่า LINE token ผ่าน environment และจะถูกใช้เมื่อช่องว่าง</div> }
          <button type="button" class="btn sm" style="margin-top:10px" [disabled]="testing() !== ''" (click)="test('line')">{{ testing() === 'line' ? 'กำลังส่ง…' : 'ส่ง LINE ทดสอบ' }}</button>
        </div>
      </div>

      @if (message()) { <div class="notice" [class.bad]="error()" style="margin-top:14px">{{ message() }}</div> }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotifySettingsComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly config = signal<NotifyConfig>({ ...EMPTY });
  readonly busy = signal(false);
  readonly testing = signal<'' | 'email' | 'line'>('');
  readonly message = signal('');
  readonly error = signal(false);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.get<NotifyConfig>('/notify/config').subscribe({
      next: (config) => this.config.set({ ...EMPTY, ...config }),
      error: (error: unknown) => this.toast.error(apiErrorMessage(error)),
    });
  }

  set<K extends keyof NotifyConfig>(key: K, value: NotifyConfig[K]): void {
    this.config.update((config) => ({ ...config, [key]: value }));
  }

  save(): void {
    if (this.busy() || !this.auth.can('settings', 'edit')) return;
    this.busy.set(true);
    this.message.set('');
    this.api.put<NotifyConfig>('/notify/config', this.config()).subscribe({
      next: (config) => {
        this.busy.set(false);
        this.config.set({ ...EMPTY, ...config });
        this.message.set('บันทึกการตั้งค่าแจ้งเตือนแล้ว');
        this.error.set(false);
        this.toast.show('บันทึกการตั้งค่าแจ้งเตือนแล้ว');
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.message.set(apiErrorMessage(error));
        this.error.set(true);
      },
    });
  }

  test(channel: 'email' | 'line'): void {
    if (this.testing()) return;
    this.testing.set(channel);
    this.message.set('');
    this.api.post<{ ok: boolean }>('/notify/test', { channel }).subscribe({
      next: () => {
        this.testing.set('');
        this.message.set(`ส่งทดสอบทาง ${channel === 'email' ? 'อีเมล' : 'LINE'} สำเร็จ`);
        this.error.set(false);
        this.toast.show('ส่งข้อความทดสอบแล้ว');
      },
      error: (error: unknown) => {
        this.testing.set('');
        this.message.set(apiErrorMessage(error));
        this.error.set(true);
      },
    });
  }
}
