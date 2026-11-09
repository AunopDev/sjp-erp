import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { apiErrorMessage } from '../core/api.service';

@Component({
  selector: 'app-login',
  standalone: true,
  template: `
    <div class="login-wrap">
      <div class="login-bg2" aria-hidden="true"><i></i><i></i><i></i></div>
      <form class="login-card" (submit)="submit($event)">
        <div class="login-logo"><b>SJP</b></div>
        <h1>SJP ERP</h1>
        <div class="login-sub">เอส เจ พี อินฟอร์เมชั่นซิสเต็ม จำกัด</div>
        <div class="login-note">
          {{ auth.firstRun() ? 'เริ่มต้นด้วยฐานข้อมูลว่าง — สร้างผู้ดูแลระบบคนแรกเพื่อเริ่มใช้งาน' : 'เข้าสู่ระบบเพื่อจัดการข้อมูลของบริษัท' }}
        </div>

        @if (auth.firstRun()) {
          <div class="field">
            <label for="ln">ชื่อผู้ดูแลระบบ</label>
            <input id="ln" [value]="name()" (input)="name.set($any($event.target).value)" autocomplete="name" autofocus />
          </div>
        }
        <div class="field" [style.margin-top.px]="auth.firstRun() ? 12 : 0">
          <label for="lu">ชื่อผู้ใช้</label>
          <input id="lu" [value]="username()" (input)="username.set($any($event.target).value)" autocomplete="username" [autofocus]="!auth.firstRun()" />
          @if (auth.firstRun()) { <div class="muted small">a-z, 0-9, จุด, ขีดกลาง หรือขีดล่าง 3–50 ตัวอักษร</div> }
        </div>
        <div class="field" style="margin-top:12px">
          <label for="lp">รหัสผ่าน</label>
          <div class="pw-wrap">
            <input id="lp" [type]="show() ? 'text' : 'password'" [value]="password()" (input)="password.set($any($event.target).value)" autocomplete="current-password" />
            <button type="button" (click)="show.set(!show())" [attr.aria-label]="show() ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'">{{ show() ? 'ซ่อน' : 'แสดง' }}</button>
          </div>
        </div>
        @if (auth.firstRun()) {
          <div class="field" style="margin-top:12px">
            <label for="lcp">ยืนยันรหัสผ่าน</label>
            <input id="lcp" [type]="show() ? 'text' : 'password'" [value]="confirmPassword()" (input)="confirmPassword.set($any($event.target).value)" autocomplete="new-password" />
          </div>
        }
        @if (error()) { <div class="err" style="margin-top:8px" role="alert">{{ error() }}</div> }
        <button class="btn primary" [disabled]="busy() || !username() || !password() || (auth.firstRun() && (!name() || !confirmPassword()))">
          {{ busy() ? 'กำลังดำเนินการ…' : auth.firstRun() ? 'สร้างผู้ดูแลและเริ่มใช้งาน' : 'เข้าสู่ระบบ' }}
        </button>
        <div class="small muted" style="margin-top:14px;text-align:center">
          {{ auth.firstRun() ? 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' : 'ลืมรหัสผ่าน? ติดต่อผู้ดูแลระบบของบริษัท' }}
        </div>
      </form>
      <div class="login-foot">© 2026 SJP Information System Co., Ltd. · SJP ERP</div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly name = signal('');
  readonly username = signal('');
  readonly password = signal('');
  readonly confirmPassword = signal('');
  readonly show = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');

  async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    this.error.set('');
    if (this.auth.firstRun() && this.password() !== this.confirmPassword()) {
      this.error.set('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }
    if (this.password().length < 8) {
      this.error.set('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
      return;
    }
    this.busy.set(true);
    try {
      if (this.auth.firstRun()) {
        await this.auth.setup(this.name(), this.username(), this.password());
      } else {
        await this.auth.login(this.username(), this.password());
      }
      await this.router.navigate(['/']);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
