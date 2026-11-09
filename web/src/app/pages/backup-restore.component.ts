import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ToastService } from '../shared/toast.service';

interface BackupSummary {
  exportedAt?: string;
  users?: unknown[];
  records?: unknown[];
  settings?: unknown[];
  approvals?: unknown[];
  events?: unknown[];
  files?: unknown[];
  webhooks?: unknown[];
}

@Component({
  selector: 'app-backup-restore',
  standalone: true,
  template: `
    <div class="card">
      <h3>สำรองข้อมูล</h3>
      <p class="muted">ดาวน์โหลดข้อมูลหลักทั้งหมดเป็นไฟล์ JSON เพื่อเก็บไว้กู้คืนหรือย้ายระบบ</p>
      <button type="button" class="btn primary" [disabled]="busy() || !auth.can('settings','edit')" (click)="exportBackup()">
        {{ busy() === 'export' ? 'กำลังสร้างไฟล์…' : 'ดาวน์โหลดไฟล์สำรอง' }}
      </button>
      <div class="notice warn" style="margin-top:14px">
        ไฟล์สำรองมีข้อมูลอ่อนไหว เช่น password hash, รหัส SMTP, LINE token และ HMAC secret — เก็บไฟล์ให้ปลอดภัยและอย่าแชร์ผ่านช่องทางสาธารณะ
        ไฟล์แนบไบนารีถูกรวมแบบ base64 ทำให้ไฟล์ JSON มีขนาดใหญ่ตามจำนวนไฟล์
      </div>
    </div>

    <div class="card">
      <h3>กู้คืนข้อมูล</h3>
      <p class="muted">นำเข้าไฟล์สำรองจากระบบนี้ ข้อมูลปัจจุบันจะถูกแทนที่ทั้งหมด</p>
      <div class="field">
        <label>ไฟล์สำรอง (.json)</label>
        <div class="row">
          <label class="btn sm file-pick">
            <input type="file" accept=".json,application/json" (change)="pick($event)" [disabled]="busy() !== ''" />
            เลือกไฟล์ .json
          </label>
          @if (fileName()) { <span class="file-chip">{{ fileName() }}</span> }
        </div>
      </div>
      @if (summary(); as data) {
        <div class="wf-summary" style="margin-top:12px">
          <span class="badge gray">ส่งออกเมื่อ {{ data.exportedAt || 'ไม่ระบุ' }}</span>
          <span class="badge blue">{{ data.users?.length ?? 0 }} ผู้ใช้</span>
          <span class="badge green">{{ data.records?.length ?? 0 }} รายการ</span>
          <span class="badge violet">{{ data.settings?.length ?? 0 }} ตั้งค่า</span>
          <span class="badge amber">{{ data.files?.length ?? 0 }} ไฟล์แนบ</span>
          <span class="badge gray">{{ data.events?.length ?? 0 }} เหตุการณ์</span>
          <span class="badge blue">{{ data.webhooks?.length ?? 0 }} Webhook</span>
        </div>
      }
      <div class="field" style="margin-top:12px;max-width:320px">
        <label>พิมพ์ RESTORE เพื่อยืนยัน</label>
        <input [value]="confirmText()" (input)="confirmText.set($any($event.target).value)" placeholder="RESTORE" />
      </div>
      @if (error()) { <div class="err" style="margin-top:8px">{{ error() }}</div> }
      <button type="button" class="btn danger" style="margin-top:12px" [disabled]="!payload() || confirmText() !== 'RESTORE' || busy() !== '' || !auth.can('settings','edit')" (click)="restore()">
        {{ busy() === 'restore' ? 'กำลังกู้คืน…' : 'กู้คืนข้อมูล' }}
      </button>
    </div>

    <div class="card">
      <h3>นำเข้าข้อมูลจาก React เดิม</h3>
      <p class="muted">นำเข้าเฉพาะข้อมูลเอกสารจาก state ของ React (localStorage) เช่น ticket, โครงการ, ใบสั่งซื้อ, สินค้า — ผู้ใช้/บทบาท/รหัสผ่าน/การตั้งค่าฟิลด์ยังต้องตั้งใหม่ในระบบนี้</p>
      <div class="field">
        <label>ไฟล์ state (.json)</label>
        <div class="row">
          <label class="btn sm file-pick">
            <input type="file" accept=".json,application/json" (change)="pickLegacy($event)" [disabled]="busy() !== ''" />
            เลือกไฟล์ state
          </label>
          @if (legacyFileName()) { <span class="file-chip">{{ legacyFileName() }}</span> }
        </div>
      </div>
      @if (legacySummary()) { <div class="notice small" style="margin-top:10px">{{ legacySummary() }}</div> }
      <div class="field" style="margin-top:12px;max-width:320px">
        <label>พิมพ์ IMPORT เพื่อยืนยัน</label>
        <input [value]="legacyConfirm()" (input)="legacyConfirm.set($any($event.target).value)" placeholder="IMPORT" />
      </div>
      @if (legacyError()) { <div class="err" style="margin-top:8px">{{ legacyError() }}</div> }
      <button type="button" class="btn primary" style="margin-top:12px" [disabled]="!legacyState() || legacyConfirm() !== 'IMPORT' || busy() !== '' || !auth.can('settings','edit')" (click)="importLegacy()">
        {{ busy() === 'legacy' ? 'กำลังนำเข้า…' : 'นำเข้าข้อมูลเอกสาร' }}
      </button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BackupRestoreComponent {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly busy = signal('');
  readonly error = signal('');
  readonly confirmText = signal('');
  readonly payload = signal<Record<string, unknown> | null>(null);
  readonly summary = signal<BackupSummary | null>(null);
  readonly fileName = signal('');
  readonly legacyState = signal<unknown>(null);
  readonly legacyFileName = signal('');
  readonly legacySummary = signal('');
  readonly legacyConfirm = signal('');
  readonly legacyError = signal('');

  exportBackup(): void {
    if (this.busy()) return;
    this.busy.set('export');
    this.error.set('');
    this.api.get<Record<string, unknown>>('/backup/export').subscribe({
      next: (data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `sjp-erp-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        this.busy.set('');
        this.toast.show('ดาวน์โหลดไฟล์สำรองแล้ว');
      },
      error: (error: unknown) => {
        this.busy.set('');
        this.error.set(apiErrorMessage(error));
      },
    });
  }

  async pick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.fileName.set(file.name);
    this.error.set('');
    this.confirmText.set('');
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      if (parsed['app'] !== 'sjp-erp') throw new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ SJP ERP');
      this.payload.set(parsed);
      this.summary.set(parsed as BackupSummary);
    } catch (error) {
      this.payload.set(null);
      this.summary.set(null);
      this.error.set(error instanceof Error ? error.message : 'อ่านไฟล์สำรองไม่สำเร็จ');
    }
  }

  restore(): void {
    const payload = this.payload();
    if (!payload || this.confirmText() !== 'RESTORE' || this.busy()) return;
    this.busy.set('restore');
    this.error.set('');
    this.api.post('/backup/restore', { payload, confirm: 'RESTORE' }).subscribe({
      next: () => {
        this.busy.set('');
        this.toast.show('กู้คืนข้อมูลแล้ว — กรุณาเข้าสู่ระบบใหม่');
        setTimeout(() => this.auth.logout(), 900);
      },
      error: (error: unknown) => {
        this.busy.set('');
        this.error.set(apiErrorMessage(error));
      },
    });
  }

  async pickLegacy(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.legacyFileName.set(file.name);
    this.legacyConfirm.set('');
    this.legacyError.set('');
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      const data = parsed['data'] && typeof parsed['data'] === 'object' ? (parsed['data'] as Record<string, unknown>) : parsed;
      const entities = Object.entries(data).filter(([, value]) => Array.isArray(value));
      if (!entities.length) throw new Error('ไม่พบข้อมูลเอกสารในไฟล์นี้');
      const total = entities.reduce((sum, [, value]) => sum + (value as unknown[]).length, 0);
      this.legacyState.set(parsed);
      this.legacySummary.set(`พบ ${total} รายการ ใน ${entities.length} ประเภทข้อมูล`);
    } catch (error) {
      this.legacyState.set(null);
      this.legacySummary.set('');
      this.legacyError.set(error instanceof Error ? error.message : 'อ่านไฟล์ไม่สำเร็จ');
    }
  }

  importLegacy(): void {
    if (!this.legacyState() || this.legacyConfirm() !== 'IMPORT' || this.busy()) return;
    this.busy.set('legacy');
    this.legacyError.set('');
    this.api.post<{ total: number; imported: Record<string, number>; skipped: Record<string, number> }>('/backup/legacy', { state: this.legacyState(), confirm: 'IMPORT' }).subscribe({
      next: (result) => {
        this.busy.set('');
        const skipped = Object.keys(result.skipped ?? {}).length;
        this.toast.show(`นำเข้าข้อมูลแล้ว ${result.total} รายการ`);
        this.legacySummary.set(`นำเข้าสำเร็จ ${result.total} รายการ${skipped ? ` · ข้าม ${skipped} ประเภทที่ไม่มีในระบบ` : ''}`);
        this.legacyState.set(null);
        this.legacyConfirm.set('');
      },
      error: (error: unknown) => {
        this.busy.set('');
        this.legacyError.set(apiErrorMessage(error));
      },
    });
  }
}
