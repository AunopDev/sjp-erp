import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { MetaService } from '../core/meta.service';
import { ToastService } from '../shared/toast.service';
import type { EntityDef, RoleRow, SafeUser, WorkflowStatus } from '../core/models';

interface Config {
  entities: Record<string, EntityDef>;
  workflows: Record<string, unknown>;
}

interface StatusDraft extends WorkflowStatus {
  key: string;
  label: string;
  color: string;
  next: string[];
  requiredFields: string[];
  enabled: boolean;
  final?: boolean;
  needClosePerm?: boolean;
  approverRole?: string;
  approverUser?: string;
}

interface WorkflowDraft {
  confirmed: boolean;
  statuses: StatusDraft[];
  extra: Record<string, unknown>;
}

const COLORS: [string, string][] = [
  ['gray', 'เทา'],
  ['blue', 'น้ำเงิน'],
  ['indigo', 'คราม'],
  ['amber', 'เหลือง'],
  ['violet', 'ม่วง'],
  ['teal', 'เขียวน้ำทะเล'],
  ['green', 'เขียว'],
  ['red', 'แดง'],
];

@Component({
  selector: 'app-workflow-editor',
  standalone: true,
  template: `
    <div class="card wf-card">
      <div class="wf-head">
        <div class="field" style="min-width:240px">
          <label>Workflow ของ</label>
          <select [value]="selected()" (change)="choose($any($event.target).value)">
            @for (key of keys(); track key) { <option [value]="key" [selected]="key === selected()">{{ labelOf(key) }}</option> }
          </select>
        </div>
        <span class="grow"></span>
        <button type="button" class="btn" (click)="toggleJson()">{{ jsonMode() ? 'กลับไปโหมดฟอร์ม' : 'JSON ขั้นสูง' }}</button>
        <button type="button" class="btn primary" [disabled]="busy()" (click)="save()">{{ busy() ? 'กำลังบันทึก…' : 'บันทึก Workflow' }}</button>
      </div>

      @if (error()) { <div class="err" role="alert" style="margin-top:10px">{{ error() }}</div> }

      @if (isProject()) {
        <div class="notice warn" style="margin-top:14px">
          Workflow ของโครงการใช้โครงสร้างขั้นตอน (steps) — ใช้โหมด JSON ขั้นสูงสำหรับแก้ไข หรือแก้ขั้นตอนจากหน้ารายละเอียดโครงการ
        </div>
        <div class="field" style="margin-top:12px"><label>JSON</label><textarea rows="22" spellcheck="false" [value]="jsonText()" (input)="jsonText.set($any($event.target).value)" class="json-area"></textarea></div>
      } @else if (jsonMode()) {
        <div class="notice small" style="margin-top:14px">โหมด JSON สำหรับแก้ไขละเอียด ระบบจะตรวจ key/สถานะที่อ้างถึงให้ก่อนบันทึก</div>
        <div class="field" style="margin-top:12px"><label>JSON</label><textarea rows="22" spellcheck="false" [value]="jsonText()" (input)="jsonText.set($any($event.target).value)" class="json-area"></textarea></div>
      } @else if (draft(); as d) {
        <div class="wf-summary">
          <label class="check"><input type="checkbox" [checked]="d.confirmed" (change)="setConfirmed($any($event.target).checked)" /> ยืนยันใช้งาน workflow นี้</label>
          <span class="badge gray">{{ d.statuses.length }} สถานะ</span>
          <span class="badge green">{{ activeCount() }} ใช้งาน</span>
          @if (d.statuses.some(s => s.final)) { <span class="badge red">{{ finalCount() }} สถานะสุดท้าย</span> }
        </div>

        @if (!d.statuses.length) {
          <div class="state empty" style="margin-top:16px">
            ยังไม่มีสถานะ
            <div class="row" style="justify-content:center;margin-top:8px">
              <button type="button" class="btn primary sm" (click)="starter()">สร้างโครงร่าง 3 สถานะ</button>
              <button type="button" class="btn sm" (click)="addStatus()">+ เพิ่มสถานะ</button>
            </div>
          </div>
        } @else {
          <div class="wf-list">
            @for (status of d.statuses; track status.key; let i = $index) {
              <article class="wf-status" [class.off]="!status.enabled">
                <header class="wf-status-head">
                  <span class="wf-index">{{ i + 1 }}</span>
                  <div class="field grow"><label>ชื่อสถานะ</label><input [value]="status.label" (input)="setStatus(i, 'label', $any($event.target).value)" /></div>
                  <div class="field wf-key-field"><label>key</label><input [value]="status.key" (input)="setStatusKey(i, $any($event.target).value)" /></div>
                  <div class="field wf-color-field"><label>สี</label><select [value]="status.color" (change)="setStatus(i, 'color', $any($event.target).value)">@for (color of colors; track color[0]) { <option [value]="color[0]" [selected]="color[0] === status.color">{{ color[1] }}</option> }</select></div>
                  <div class="wf-status-tools">
                    <button type="button" class="btn ghost sm" (click)="toggleExpand(status.key)">{{ isExpanded(status.key) ? 'ย่อ' : 'แก้ไข' }}</button>
                    <button type="button" class="btn ghost sm" [disabled]="i === 0" (click)="move(i, -1)" title="เลื่อนขึ้น">↑</button>
                    <button type="button" class="btn ghost sm" [disabled]="i === d.statuses.length - 1" (click)="move(i, 1)" title="เลื่อนลง">↓</button>
                    <button type="button" class="btn ghost sm danger-text" (click)="removeStatus(i)" title="ลบสถานะ">ลบ</button>
                  </div>
                </header>

                @if (!isExpanded(status.key)) {
                  <div class="wf-status-summary">
                    <span><b>ไป:</b> {{ nextSummary(status) }}</span>
                    <span><b>บังคับ:</b> {{ requiredSummary(status) }}</span>
                    <span><b>ผู้อนุมัติ:</b> {{ approverSummary(status) }}</span>
                  </div>
                }

                @if (isExpanded(status.key)) {
                  <div class="wf-flags">
                    <label class="check"><input type="checkbox" [checked]="status.enabled" (change)="setStatus(i, 'enabled', $any($event.target).checked)" /> ใช้งานสถานะนี้</label>
                    <label class="check"><input type="checkbox" [checked]="!!status.final" (change)="setStatus(i, 'final', $any($event.target).checked)" /> เป็นสถานะสุดท้าย</label>
                    <label class="check"><input type="checkbox" [checked]="!!status.needClosePerm" (change)="setStatus(i, 'needClosePerm', $any($event.target).checked)" /> ต้องมีสิทธิ์ปิดงาน</label>
                  </div>

                  <div class="wf-grid">
                  <div class="field">
                    <label>ไปสถานะถัดไปได้ที่</label>
                    @if (otherStatuses(status.key).length) {
                      <div class="wf-chips">
                        @for (next of otherStatuses(status.key); track next.key) {
                          <label class="wf-chip" [class.on]="status.next.includes(next.key)">
                            <input type="checkbox" [checked]="status.next.includes(next.key)" (change)="toggleNext(i, next.key, $any($event.target).checked)" />
                            <span class="dot" [attr.data-color]="next.color"></span>{{ next.label }}
                          </label>
                        }
                      </div>
                    } @else { <span class="muted small">เพิ่มสถานะอื่นก่อนเพื่อกำหนดเส้นทาง</span> }
                  </div>

                  <div class="field">
                    <label>ฟิลด์บังคับก่อนเข้าสถานะนี้</label>
                    @if (fields().length) {
                      <div class="wf-chips">
                        @for (field of fields(); track field.key) {
                          <label class="wf-chip" [class.on]="status.requiredFields.includes(field.key)">
                            <input type="checkbox" [checked]="status.requiredFields.includes(field.key)" (change)="toggleRequired(i, field.key, $any($event.target).checked)" />
                            {{ field.label }}
                          </label>
                        }
                      </div>
                    } @else { <span class="muted small">ไม่พบฟิลด์ของโมดูลนี้</span> }
                  </div>

                  <div class="field">
                    <label>ผู้อนุมัติที่กำหนด (ถ้ามี)</label>
                    <div class="wf-approver">
                      <select [value]="status.approverRole || ''" (change)="setStatus(i, 'approverRole', $any($event.target).value)">
                        <option value="" [selected]="!status.approverRole">ไม่กำหนด role</option>
                        @for (role of roles(); track role.id) { <option [value]="role.id" [selected]="role.id === status.approverRole">{{ role.name }}</option> }
                      </select>
                      <select [value]="status.approverUser || ''" (change)="setStatus(i, 'approverUser', $any($event.target).value)">
                        <option value="" [selected]="!status.approverUser">ไม่กำหนดผู้ใช้</option>
                        @for (user of users(); track user.id) { <option [value]="user.id" [selected]="user.id === status.approverUser">{{ user.name }}</option> }
                      </select>
                    </div>
                    <span class="muted small">ถ้ากำหนด ผู้อื่นจะส่งคำขออนุมัติแทนการเปลี่ยนสถานะทันที</span>
                  </div>
                </div>
                }
              </article>
            }
          </div>
          <div class="row" style="margin-top:12px">
            <button type="button" class="btn" (click)="addStatus()">+ เพิ่มสถานะ</button>
          </div>
        }
      }

      <p class="muted small" style="margin-top:14px">
        การลบสถานะ/ฟิลด์ที่มีข้อมูลอยู่จะถูกบล็อกโดยระบบ — ใช้การปิดใช้งานสถานะแทน
      </p>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowEditorComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly meta = inject(MetaService);
  private readonly toast = inject(ToastService);

  readonly config = signal<Config | null>(null);
  readonly selected = signal('ticket');
  readonly draft = signal<WorkflowDraft | null>(null);
  readonly jsonMode = signal(false);
  readonly jsonText = signal('{}');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly keys = signal<string[]>(['ticket', 'po', 'project']);
  readonly roles = signal<RoleRow[]>([]);
  readonly users = signal<SafeUser[]>([]);
  readonly colors = COLORS;

  readonly isProject = computed(() => this.selected() === 'project');
  readonly entity = computed(() => {
    const key = this.selected();
    return Object.values(this.config()?.entities ?? {}).find((item) => (item.workflowKey ?? item.key) === key) ?? null;
  });
  readonly fields = computed(() => (this.entity()?.fields ?? []).filter((field) => !['section', 'rows', 'file'].includes(field.type)));
  readonly activeCount = computed(() => this.draft()?.statuses.filter((status) => status.enabled).length ?? 0);
  readonly finalCount = computed(() => this.draft()?.statuses.filter((status) => status.final).length ?? 0);
  readonly expanded = signal<Set<string>>(new Set());

  ngOnInit(): void {
    this.load();
    this.api.get<RoleRow[]>('/roles').subscribe({ next: (roles) => this.roles.set(roles), error: () => this.roles.set([]) });
    this.api.get<SafeUser[]>('/users').subscribe({ next: (users) => this.users.set(users), error: () => this.users.set([]) });
  }

  load(): void {
    this.api.get<Config>('/meta/config').subscribe({
      next: (config) => {
        this.config.set(config);
        const custom = Object.values(config.entities).filter((entity) => entity.custom).map((entity) => entity.key);
        const keys = [...new Set([...Object.keys(config.workflows), ...custom])];
        this.keys.set(keys);
        if (!keys.includes(this.selected())) this.selected.set(keys[0] ?? 'ticket');
        this.choose(this.selected());
      },
      error: (error: unknown) => this.toast.error(apiErrorMessage(error)),
    });
  }

  choose(key: string): void {
    this.selected.set(key);
    const raw = (this.config()?.workflows[key] ?? {}) as Record<string, unknown>;
    const statuses = Array.isArray(raw['statuses']) ? (raw['statuses'] as StatusDraft[]) : [];
    const { confirmed, statuses: _statuses, ...extra } = raw;
    void _statuses;
    this.draft.set({
      confirmed: !!confirmed,
      extra,
      statuses: statuses.map((status) => ({
        key: String(status.key ?? ''),
        label: String(status.label ?? status.key ?? ''),
        color: String(status.color ?? 'gray'),
        next: Array.isArray(status.next) ? status.next.map(String) : [],
        requiredFields: Array.isArray(status.requiredFields) ? status.requiredFields.map(String) : [],
        enabled: status.enabled !== false,
        final: !!status.final,
        needClosePerm: !!status.needClosePerm,
        approverRole: String(status.approverRole ?? ''),
        approverUser: String(status.approverUser ?? ''),
      })),
    });
    this.jsonMode.set(key === 'project');
    this.jsonText.set(JSON.stringify(raw, null, 2));
    this.expanded.set(new Set(this.draft()?.statuses[0] ? [this.draft()!.statuses[0].key] : []));
    this.error.set('');
  }

  labelOf(key: string): string {
    const entity = Object.values(this.config()?.entities ?? {}).find((item) => (item.workflowKey ?? item.key) === key);
    return entity ? `${entity.label} (${key})` : key;
  }

  fieldsFor(): { key: string; label: string; type: string }[] {
    return this.fields();
  }

  otherStatuses(key: string): StatusDraft[] {
    return this.draft()?.statuses.filter((status) => status.key !== key) ?? [];
  }

  isExpanded(key: string): boolean {
    return this.expanded().has(key);
  }

  toggleExpand(key: string): void {
    this.expanded.update((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  nextSummary(status: StatusDraft): string {
    if (!status.next.length) return 'ไม่มีเส้นทาง';
    return status.next.map((key) => this.draft()?.statuses.find((item) => item.key === key)?.label ?? key).join(', ');
  }

  requiredSummary(status: StatusDraft): string {
    if (!status.requiredFields.length) return 'ไม่กำหนด';
    return status.requiredFields.map((key) => this.fields().find((field) => field.key === key)?.label ?? key).join(', ');
  }

  approverSummary(status: StatusDraft): string {
    if (status.approverUser) return this.users().find((user) => user.id === status.approverUser)?.name ?? 'ผู้ใช้ที่กำหนด';
    if (status.approverRole) return this.roles().find((role) => role.id === status.approverRole)?.name ?? status.approverRole;
    return 'ไม่กำหนด';
  }

  setConfirmed(value: boolean): void {
    this.draft.update((draft) => (draft ? { ...draft, confirmed: value } : draft));
  }

  setStatus(index: number, key: keyof StatusDraft, value: unknown): void {
    this.draft.update((draft) => {
      if (!draft) return draft;
      const statuses = draft.statuses.map((status, i) => (i === index ? { ...status, [key]: value } : status));
      return { ...draft, statuses };
    });
  }

  setStatusKey(index: number, key: string): void {
    const old = this.draft()?.statuses[index]?.key;
    if (!old) return;
    const normalized = key.replace(/[^A-Za-z0-9_]/g, '');
    this.draft.update((draft) => {
      if (!draft) return draft;
      const statuses = draft.statuses.map((status, i) => {
        if (i === index) return { ...status, key: normalized };
        return { ...status, next: status.next.map((next) => (next === old ? normalized : next)) };
      });
      return { ...draft, statuses };
    });
  }

  move(index: number, delta: number): void {
    this.draft.update((draft) => {
      if (!draft) return draft;
      const target = index + delta;
      if (target < 0 || target >= draft.statuses.length) return draft;
      const statuses = [...draft.statuses];
      const [item] = statuses.splice(index, 1);
      statuses.splice(target, 0, item);
      return { ...draft, statuses };
    });
  }

  removeStatus(index: number): void {
    const status = this.draft()?.statuses[index];
    if (!status) return;
    if (!confirm(`ลบสถานะ “${status.label}”? สถานะที่มีข้อมูลใช้งานจะถูกลบไม่ได้`)) return;
    this.draft.update((draft) => {
      if (!draft) return draft;
      const removed = draft.statuses[index].key;
      return {
        ...draft,
        statuses: draft.statuses
          .filter((_, i) => i !== index)
          .map((item) => ({ ...item, next: item.next.filter((next) => next !== removed) })),
      };
    });
  }

  addStatus(): void {
    this.draft.update((draft) => {
      if (!draft) return draft;
      let n = draft.statuses.length + 1;
      while (draft.statuses.some((status) => status.key === `status${n}`)) n++;
      const statuses: StatusDraft[] = [
        ...draft.statuses,
        { key: `status${n}`, label: `สถานะ ${n}`, color: 'gray', next: [], requiredFields: [], enabled: true },
      ];
      this.expanded.update((current) => new Set([...current, `status${n}`]));
      return { ...draft, statuses };
    });
  }

  starter(): void {
    this.draft.set({
      confirmed: true,
      extra: this.draft()?.extra ?? {},
      statuses: [
        { key: 'draft', label: 'ร่าง', color: 'gray', next: ['active'], requiredFields: [], enabled: true },
        { key: 'active', label: 'ใช้งาน', color: 'green', next: ['closed'], requiredFields: [], enabled: true },
        { key: 'closed', label: 'ปิด', color: 'gray', next: [], requiredFields: [], enabled: true, final: true },
      ],
    });
  }

  toggleNext(index: number, key: string, checked: boolean): void {
    this.draft.update((draft) => {
      if (!draft) return draft;
      const statuses = draft.statuses.map((status, i) =>
        i === index
          ? { ...status, next: checked ? [...new Set([...status.next, key])] : status.next.filter((next) => next !== key) }
          : status,
      );
      return { ...draft, statuses };
    });
  }

  toggleRequired(index: number, key: string, checked: boolean): void {
    this.draft.update((draft) => {
      if (!draft) return draft;
      const statuses = draft.statuses.map((status, i) =>
        i === index
          ? { ...status, requiredFields: checked ? [...new Set([...status.requiredFields, key])] : status.requiredFields.filter((field) => field !== key) }
          : status,
      );
      return { ...draft, statuses };
    });
  }

  toggleJson(): void {
    const next = !this.jsonMode();
    if (next) {
      const draft = this.draft();
      const body = draft ? { ...draft.extra, confirmed: draft.confirmed, statuses: draft.statuses } : (this.config()?.workflows[this.selected()] ?? {});
      this.jsonText.set(JSON.stringify(body, null, 2));
    }
    this.jsonMode.set(next);
  }

  save(): void {
    if (this.busy()) return;
    let body: unknown;
    if (this.jsonMode() || this.isProject()) {
      try {
        body = JSON.parse(this.jsonText());
      } catch {
        this.error.set('JSON ไม่ถูกต้อง');
        return;
      }
    } else {
      const draft = this.draft();
      if (!draft) return;
      if (draft.statuses.some((status) => !status.key.trim())) {
        this.error.set('กรุณากรอก key ของทุกสถานะ');
        return;
      }
      body = { ...draft.extra, confirmed: draft.confirmed, statuses: draft.statuses };
    }
    this.busy.set(true);
    this.error.set('');
    this.api.put(`/meta/workflow/${this.selected()}`, body).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.show('บันทึก workflow แล้ว');
        this.meta.load(true);
        this.load();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(error));
      },
    });
  }
}
