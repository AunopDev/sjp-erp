import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ToastService } from '../shared/toast.service';

interface CompanyInfo {
  name: string;
  nameEn: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  footerNote: string;
}

const EMPTY: CompanyInfo = {
  name: 'SJP ERP',
  nameEn: '',
  taxId: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  footerNote: '',
};

@Component({
  selector: 'app-company-settings',
  standalone: true,
  template: `
    <div class="card">
      <div class="row" style="margin-bottom:10px">
        <div>
          <h3 style="margin:0">ข้อมูลบริษัท / หัวเอกสาร</h3>
          <div class="muted small">ข้อมูลนี้จะแสดงบนหัวและท้ายเอกสาร PDF ทุกประเภท</div>
        </div>
        <span class="grow"></span>
        <button type="button" class="btn primary" [disabled]="busy() || !auth.can('settings','edit')" (click)="save()">{{ busy() ? 'กำลังบันทึก…' : 'บันทึกข้อมูล' }}</button>
      </div>

      <div class="form-grid">
        <div class="field"><label>ชื่อบริษัท (ไทย) *</label><input [value]="company().name" (input)="set('name', $any($event.target).value)" /></div>
        <div class="field"><label>ชื่อบริษัท (EN)</label><input [value]="company().nameEn" (input)="set('nameEn', $any($event.target).value)" /></div>
        <div class="field"><label>เลขประจำตัวผู้เสียภาษี</label><input [value]="company().taxId" (input)="set('taxId', $any($event.target).value)" /></div>
        <div class="field"><label>โทรศัพท์</label><input [value]="company().phone" (input)="set('phone', $any($event.target).value)" /></div>
        <div class="field"><label>อีเมล</label><input [value]="company().email" (input)="set('email', $any($event.target).value)" /></div>
        <div class="field"><label>เว็บไซต์</label><input [value]="company().website" (input)="set('website', $any($event.target).value)" /></div>
        <div class="field wide"><label>ที่อยู่</label><textarea rows="3" [value]="company().address" (input)="set('address', $any($event.target).value)"></textarea></div>
        <div class="field wide"><label>หมายเหตุท้ายเอกสาร (เช่น เงื่อนไขชำระ)</label><textarea rows="3" [value]="company().footerNote" (input)="set('footerNote', $any($event.target).value)"></textarea></div>
      </div>
      @if (message()) { <div class="notice" [class.bad]="error()" style="margin-top:12px">{{ message() }}</div> }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanySettingsComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly company = signal<CompanyInfo>({ ...EMPTY });
  readonly busy = signal(false);
  readonly message = signal('');
  readonly error = signal(false);

  ngOnInit(): void {
    this.api.get<CompanyInfo>('/company').subscribe({
      next: (company) => this.company.set({ ...EMPTY, ...company }),
      error: (error: unknown) => this.toast.error(apiErrorMessage(error)),
    });
  }

  set<K extends keyof CompanyInfo>(key: K, value: CompanyInfo[K]): void {
    this.company.update((company) => ({ ...company, [key]: value }));
  }

  save(): void {
    if (this.busy() || !this.auth.can('settings','edit')) return;
    this.busy.set(true);
    this.message.set('');
    this.api.put<CompanyInfo>('/company', this.company()).subscribe({
      next: (company) => {
        this.busy.set(false);
        this.company.set({ ...EMPTY, ...company });
        this.error.set(false);
        this.message.set('บันทึกข้อมูลบริษัทแล้ว — PDF ใหม่จะใช้ข้อมูลนี้');
        this.toast.show('บันทึกข้อมูลบริษัทแล้ว');
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(true);
        this.message.set(apiErrorMessage(error));
      },
    });
  }
}
