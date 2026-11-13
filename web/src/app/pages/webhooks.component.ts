import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { fmtDateTime } from '../core/util';
import { ModalComponent } from '../shared/modal.component';
import { ToastService } from '../shared/toast.service';

interface WebhookRow {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  secretSet: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DeliveryRow {
  id: string;
  eventType: string;
  status: 'pending' | 'success' | 'failed';
  attempts: number;
  nextAttemptAt: string;
  lastError: string;
  createdAt: string;
  deliveredAt: string | null;
}

interface WebhookForm {
  id: string | null;
  name: string;
  url: string;
  secret: string;
  events: string;
  enabled: boolean;
}

const EMPTY_FORM: WebhookForm = { id: null, name: '', url: '', secret: '', events: 'record.*, approval.*', enabled: true };

@Component({
  selector: 'app-webhooks',
  standalone: true,
  imports: [ModalComponent],
  template: `
    <div class="card">
      <div class="row" style="margin-bottom:12px">
        <div>
          <h3 style="margin:0">Webhook ภายนอก</h3>
          <div class="muted small">ส่ง event ของระบบไปยัง URL ภายนอก พร้อม HMAC signature และคิวลองใหม่เมื่อปลายทางล่ม</div>
        </div>
        <span class="grow"></span>
        <button type="button" class="btn primary" [disabled]="!auth.can('settings','edit')" (click)="openCreate()">+ เพิ่ม Webhook</button>
      </div>

      @if (!hooks().length) {
        <div class="state empty">ยังไม่มี Webhook</div>
      } @else {
        <div class="webhook-list">
          @for (hook of hooks(); track hook.id) {
            <div class="webhook-row">
              <div class="webhook-head">
                <span class="badge {{ hook.enabled ? 'green' : 'gray' }}">{{ hook.enabled ? 'เปิด' : 'ปิด' }}</span>
                <div class="webhook-main">
                  <b>{{ hook.name }}</b>
                  <span class="mono small">{{ hook.url }}</span>
                  <span class="webhook-events">
                    @for (pattern of hook.events; track pattern) { <span class="badge gray">{{ pattern }}</span> }
                    @if (!hook.events.length) { <span class="badge blue">ทุก event</span> }
                    @if (hook.secretSet) { <span class="badge violet">HMAC</span> }
                  </span>
                </div>
                <div class="webhook-actions">
                  <button type="button" class="btn sm" (click)="toggleDeliveries(hook)">{{ expanded() === hook.id ? 'ซ่อนประวัติ' : 'ประวัติการส่ง' }}</button>
                  <button type="button" class="btn sm" [disabled]="testing() === hook.id" (click)="test(hook)">{{ testing() === hook.id ? 'กำลังส่ง…' : 'ทดสอบ' }}</button>
                  <button type="button" class="btn sm" (click)="openEdit(hook)">แก้ไข</button>
                  <button type="button" class="btn ghost sm" (click)="remove(hook)">ลบ</button>
                </div>
              </div>
              @if (expanded() === hook.id) {
                <div class="webhook-deliveries">
                  @if (deliveriesLoading()) {
                    <div class="state small"><div class="spinner"></div>กำลังโหลด…</div>
                  } @else if (!deliveries().length) {
                    <div class="muted small" style="padding:8px">ยังไม่มีประวัติการส่ง</div>
                  } @else {
                    @for (delivery of deliveries(); track delivery.id) {
                      <div class="delivery-row">
                        <span class="badge {{ delivery.status === 'success' ? 'green' : delivery.status === 'failed' ? 'red' : 'amber' }}">
                          {{ delivery.status === 'success' ? 'สำเร็จ' : delivery.status === 'failed' ? 'ล้มเหลว' : 'รอส่ง' }}
                        </span>
                        <span class="delivery-main">
                          <b>{{ delivery.eventType }}</b>
                          <span class="sub">{{ fmtDateTime(delivery.createdAt) }} · ลอง {{ delivery.attempts }} ครั้ง</span>
                          @if (delivery.lastError) { <span class="delivery-error">{{ delivery.lastError }}</span> }
                        </span>
                        @if (delivery.status !== 'success') {
                          <button type="button" class="btn ghost sm" [disabled]="retrying() === delivery.id" (click)="retry(delivery, hook)">
                            {{ retrying() === delivery.id ? '…' : 'ลองใหม่' }}
                          </button>
                        }
                      </div>
                    }
                  }
                </div>
              }
            </div>
          }
        </div>
      }
    </div>

    @if (formOpen()) {
      <app-modal [title]="form().id ? 'แก้ไข Webhook' : 'เพิ่ม Webhook'" (closed)="formOpen.set(false)">
        <div class="form-grid">
          <div class="field"><label for="lf-webhooks-component-1">ชื่อ *</label><input id="lf-webhooks-component-1" [value]="form().name" (input)="setForm('name', $any($event.target).value)" /></div>
          <div class="field"><label>เปิดใช้งาน</label><label class="check" style="margin-top:8px"><input type="checkbox" [checked]="form().enabled" (change)="setForm('enabled', $any($event.target).checked)" /> ส่ง event ไปยัง URL นี้</label></div>
          <div class="field wide"><label for="lf-webhooks-component-2">URL ปลายทาง *</label><input id="lf-webhooks-component-2" [value]="form().url" (input)="setForm('url', $any($event.target).value)" placeholder="https://example.com/hooks/sjp" /></div>
          <div class="field wide"><label for="lf-webhooks-component-3">Secret สำหรับ HMAC (เว้นว่างเพื่อใช้ค่าเดิม/ไม่ลงนาม)</label><input id="lf-webhooks-component-3" type="password" [value]="form().secret" (input)="setForm('secret', $any($event.target).value)" placeholder="optional" /></div>
          <div class="field wide"><label for="lf-webhooks-component-4">Event ที่ต้องการ (คั่นด้วย , หรือขึ้นบรรทัดใหม่)</label><textarea id="lf-webhooks-component-4" rows="3" [value]="form().events" (input)="setForm('events', $any($event.target).value)" placeholder="record.*, approval.*"></textarea></div>
        </div>
        <p class="muted small">ตัวอย่าง: <code>record.created</code>, <code>record.*</code>, <code>approval.approved</code> — เว้นว่างเพื่อรับทุก event</p>
        @if (formError()) { <div class="err">{{ formError() }}</div> }
        <div modal-footer>
          <button type="button" class="btn" (click)="formOpen.set(false)">ยกเลิก</button>
          <button type="button" class="btn primary" [disabled]="saving()" (click)="save()">{{ saving() ? 'กำลังบันทึก…' : 'บันทึก' }}</button>
        </div>
      </app-modal>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebhooksComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly hooks = signal<WebhookRow[]>([]);
  readonly expanded = signal('');
  readonly deliveries = signal<DeliveryRow[]>([]);
  readonly deliveriesLoading = signal(false);
  readonly testing = signal('');
  readonly retrying = signal('');
  readonly formOpen = signal(false);
  readonly form = signal<WebhookForm>({ ...EMPTY_FORM });
  readonly saving = signal(false);
  readonly formError = signal('');
  readonly fmtDateTime = fmtDateTime;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.get<WebhookRow[]>('/webhooks').subscribe({
      next: (hooks) => this.hooks.set(hooks ?? []),
      error: (error: unknown) => this.toast.error(apiErrorMessage(error)),
    });
  }

  openCreate(): void {
    this.form.set({ ...EMPTY_FORM });
    this.formError.set('');
    this.formOpen.set(true);
  }

  openEdit(hook: WebhookRow): void {
    this.form.set({
      id: hook.id,
      name: hook.name,
      url: hook.url,
      secret: '',
      events: hook.events.join(', '),
      enabled: hook.enabled,
    });
    this.formError.set('');
    this.formOpen.set(true);
  }

  setForm<K extends keyof WebhookForm>(key: K, value: WebhookForm[K]): void {
    this.form.update((form) => ({ ...form, [key]: value }));
  }

  save(): void {
    const form = this.form();
    if (this.saving()) return;
    this.saving.set(true);
    this.formError.set('');
    const body = {
      name: form.name,
      url: form.url,
      secret: form.secret,
      events: form.events.split(/[\n,]/).map((value) => value.trim()).filter(Boolean),
      enabled: form.enabled,
    };
    const request = form.id
      ? this.api.put<WebhookRow>(`/webhooks/${form.id}`, body)
      : this.api.post<WebhookRow>('/webhooks', body);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.toast.show(form.id ? 'แก้ไข Webhook แล้ว' : 'สร้าง Webhook แล้ว');
        this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.formError.set(apiErrorMessage(error));
      },
    });
  }

  remove(hook: WebhookRow): void {
    if (!confirm(`ลบ Webhook “${hook.name}” และประวัติการส่งทั้งหมด?`)) return;
    this.api.delete(`/webhooks/${hook.id}`).subscribe({
      next: () => {
        this.toast.show('ลบ Webhook แล้ว');
        if (this.expanded() === hook.id) this.expanded.set('');
        this.load();
      },
      error: (error: unknown) => this.toast.error(apiErrorMessage(error)),
    });
  }

  toggleDeliveries(hook: WebhookRow): void {
    if (this.expanded() === hook.id) {
      this.expanded.set('');
      return;
    }
    this.expanded.set(hook.id);
    this.loadDeliveries(hook);
  }

  private loadDeliveries(hook: WebhookRow): void {
    this.deliveriesLoading.set(true);
    this.api.get<DeliveryRow[]>(`/webhooks/${hook.id}/deliveries`, { limit: 30 }).subscribe({
      next: (rows) => {
        this.deliveries.set(rows ?? []);
        this.deliveriesLoading.set(false);
      },
      error: (error: unknown) => {
        this.deliveriesLoading.set(false);
        this.toast.error(apiErrorMessage(error));
      },
    });
  }

  test(hook: WebhookRow): void {
    if (this.testing()) return;
    this.testing.set(hook.id);
    this.api.post<DeliveryRow>(`/webhooks/${hook.id}/test`, {}).subscribe({
      next: (delivery) => {
        this.testing.set('');
        this.toast.show(delivery.status === 'success' ? 'ส่งทดสอบสำเร็จ' : `ส่งไม่สำเร็จ: ${delivery.lastError}`);
        if (this.expanded() === hook.id) this.loadDeliveries(hook);
      },
      error: (error: unknown) => {
        this.testing.set('');
        this.toast.error(apiErrorMessage(error));
      },
    });
  }

  retry(delivery: DeliveryRow, hook: WebhookRow): void {
    if (this.retrying()) return;
    this.retrying.set(delivery.id);
    this.api.post<DeliveryRow>(`/webhooks/deliveries/${delivery.id}/retry`, {}).subscribe({
      next: (result) => {
        this.retrying.set('');
        this.toast.show(result.status === 'success' ? 'ส่งสำเร็จ' : `ยังไม่สำเร็จ: ${result.lastError}`);
        if (this.expanded() === hook.id) this.loadDeliveries(hook);
      },
      error: (error: unknown) => {
        this.retrying.set('');
        this.toast.error(apiErrorMessage(error));
      },
    });
  }
}
