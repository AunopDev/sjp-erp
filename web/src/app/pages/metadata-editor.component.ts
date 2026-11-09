import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService, apiErrorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { MetaService } from '../core/meta.service';
import { ModalComponent } from '../shared/modal.component';
import { ToastService } from '../shared/toast.service';
import type { EntityDef, FieldDef, FieldType, RoleRow } from '../core/models';

interface FullConfig {
  entities: Record<string, EntityDef>;
  workflows: Record<string, unknown>;
  lists: { teams: string[]; depts: string[] };
  resources: Record<string, string>;
}

const FIELD_TYPES: [FieldType, string][] = [
  ['text', 'ข้อความสั้น'],
  ['textarea', 'ข้อความยาว'],
  ['number', 'ตัวเลข'],
  ['date', 'วันที่'],
  ['datetime', 'วันที่-เวลา'],
  ['select', 'ตัวเลือก'],
  ['multiselect', 'เลือกหลายค่า'],
  ['boolean', 'ใช่/ไม่ใช่'],
  ['ref', 'เชื่อมข้อมูล'],
  ['file', 'ไฟล์แนบ'],
  ['rows', 'ตารางย่อย'],
  ['section', 'หัวข้อคั่น'],
  ['email', 'อีเมล'],
  ['phone', 'โทรศัพท์'],
  ['url', 'ลิงก์'],
];

@Component({
  selector: 'app-metadata-editor',
  standalone: true,
  imports: [ModalComponent],
  template: `
    <div class="card">
      <div class="row" style="margin-bottom:12px">
        <div class="field"><label>โมดูล / เอกสาร</label>
          <select [value]="selectedKey()" (change)="select($any($event.target).value)">
            @for (entity of entities(); track entity.key) { <option [value]="entity.key" [selected]="entity.key === selectedKey()">{{ entity.label }}{{ entity.custom ? ' (สร้างเอง)' : '' }}</option> }
          </select>
        </div>
        <span class="grow"></span>
        @if (auth.can('settings','edit')) { <button type="button" class="btn primary" (click)="newOpen.set(true)">+ สร้างโมดูล</button> }
        @if (draft()?.custom) { <button type="button" class="btn danger" (click)="removeModule()">ลบโมดูล</button> }
      </div>

      @if (draft(); as d) {
        <div class="form-grid">
          <div class="field"><label>ชื่อโมดูล/เอกสาร *</label><input [value]="d.label" (input)="set('label', $any($event.target).value)" /></div>
          <div class="field"><label>Prefix เลขที่</label><input [value]="d.prefix" (input)="set('prefix', $any($event.target).value.toUpperCase())" maxlength="8" /></div>
          <div class="field"><label>ฟิลด์ที่ใช้เป็นชื่อรายการ</label><select [value]="d.title" (change)="set('title', $any($event.target).value)">@for (field of d.fields; track field.key) { <option [value]="field.key" [selected]="field.key === d.title">{{ field.label }}</option> }<option value="code" [selected]="d.title === 'code'">รหัสเอกสาร</option></select></div>
          <label class="check"><input type="checkbox" [checked]="!!d.scoped" (change)="set('scoped', $any($event.target).checked)" /> จำกัดข้อมูลตาม scope ของผู้ใช้</label>
        </div>

        <div class="form-grid" style="margin-top:12px">
          <div class="field wide"><label>คอลัมน์ในตารางรายการ</label>
            <div class="row">
              @for (option of columnOptions(); track option.key) {
                <label class="check"><input type="checkbox" [checked]="hasCol(option.key)" (change)="toggleCol(option.key, $any($event.target).checked)" /> {{ option.label }}</label>
              }
            </div>
          </div>
          <div class="field wide"><label>ตัวกรองในหน้ารายการ</label>
            <div class="row">
              @for (option of filterOptions(); track option.key) {
                <label class="check"><input type="checkbox" [checked]="hasFilter(option.key)" (change)="toggleFilter(option.key, $any($event.target).checked)" /> {{ option.label }}</label>
              }
            </div>
          </div>
        </div>

        <h3 style="margin:16px 0 8px">ฟิลด์ ({{ d.fields.length }})</h3>
        <div class="table-wrap"><table class="tbl meta-fields">
          <thead><tr><th style="width:92px"></th><th>ชื่อฟิลด์</th><th>key</th><th>ชนิด</th><th>บังคับ</th><th>ซ่อน</th><th>ตัวเลือก/เชื่อม</th><th></th></tr></thead>
          <tbody>
            @for (field of d.fields; track field.key; let i = $index) {
              <tr draggable="true"
                  [class.dragging]="dragIndex() === i"
                  [class.drag-over]="dragOverIndex() === i && dragIndex() !== i"
                  (dragstart)="dragStart(i, $event)"
                  (dragover)="dragOver(i, $event)"
                  (drop)="dropField(i, $event)"
                  (dragend)="dragEnd()">
                <td class="drag-cell">
                  <span class="drag-handle" title="ลากเพื่อจัดลำดับ">⠿</span>
                  <span class="drag-buttons">
                    <button type="button" class="btn ghost sm" [disabled]="i === 0" (click)="moveField(i, -1)" title="เลื่อนขึ้น">↑</button>
                    <button type="button" class="btn ghost sm" [disabled]="i === d.fields.length - 1" (click)="moveField(i, 1)" title="เลื่อนลง">↓</button>
                  </span>
                </td>
                <td><input [value]="field.label" (input)="setField(i, 'label', $any($event.target).value)" /></td>
                <td>
                  <div class="key-cell">
                    <input [value]="field.key" [disabled]="originalKeys().has(field.key)" (input)="setField(i, 'key', $any($event.target).value)" style="max-width:150px" />
                    @if (originalKeys().has(field.key)) {
                      <button type="button" class="btn ghost sm" (click)="openRename(i)">เปลี่ยน key</button>
                    }
                  </div>
                </td>
                <td><select [value]="field.type" (change)="changeType(i, $any($event.target).value)">@for (type of fieldTypes; track type[0]) { <option [value]="type[0]" [selected]="type[0] === field.type">{{ type[1] }}</option> }</select></td>
                <td><input type="checkbox" [checked]="!!field.required" (change)="setField(i, 'required', $any($event.target).checked)" /></td>
                <td><input type="checkbox" [checked]="!!field.hidden" (change)="setField(i, 'hidden', $any($event.target).checked)" /></td>
                <td style="min-width:220px">
                  @if (field.type === 'select' || field.type === 'multiselect') {
                    <input [value]="(field.options || []).join(', ')" (input)="setOptions(i, $any($event.target).value)" placeholder="ตัวเลือก คั่นด้วย ," />
                  } @else if (field.type === 'ref') {
                    <select [value]="field.ref || ''" (change)="setField(i, 'ref', $any($event.target).value)"><option value="" [selected]="!field.ref">–</option>@for (entity of entities(); track entity.key) { <option [value]="entity.key" [selected]="entity.key === field.ref">{{ entity.label }}</option> }<option value="users" [selected]="field.ref === 'users'">ผู้ใช้</option></select>
                  } @else if (field.type === 'formula') {
                    <input [value]="field.formula || ''" (input)="setField(i, 'formula', $any($event.target).value)" placeholder="{qty}*{price}" />
                  } @else if (field.type === 'rows') {
                    <span class="muted small">{{ (field.cols || []).length }} คอลัมน์</span>
                  } @else { <span class="muted small">–</span> }
                </td>
                <td><button type="button" class="btn ghost sm" (click)="removeField(i)">ลบ</button></td>
              </tr>
            }
          </tbody>
        </table></div>
        <div class="row" style="margin-top:8px"><button type="button" class="btn" (click)="addField()">+ เพิ่มฟิลด์</button><span class="grow"></span><button type="button" class="btn primary" [disabled]="saving()" (click)="save()">{{ saving() ? 'กำลังบันทึก…' : 'บันทึกโครงสร้าง' }}</button></div>
        @if (draftMessage()) { <div class="err">{{ draftMessage() }}</div> }
        <p class="muted small">ลากแถวเพื่อจัดลำดับฟิลด์ หรือใช้ปุ่ม ↑/↓ · เปลี่ยน key ของฟิลด์เดิมได้ผ่านปุ่ม “เปลี่ยน key” (ระบบย้ายข้อมูลเดิมให้)</p>
      }

      <div class="row" style="margin-top:18px"><h3 style="margin:0">ตัวเลือกด่วน</h3><span class="grow"></span><button type="button" class="btn sm" (click)="saveLists()">บันทึกทีม/แผนก</button></div>
      <div class="form-grid" style="margin-top:8px">
        <div class="field"><label>ทีม (บรรทัดละ 1)</label><textarea rows="4" [value]="teams()" (input)="teams.set($any($event.target).value)"></textarea></div>
        <div class="field"><label>แผนก (บรรทัดละ 1)</label><textarea rows="4" [value]="depts()" (input)="depts.set($any($event.target).value)"></textarea></div>
      </div>
    </div>

    @if (newOpen()) {
      <app-modal title="สร้างโมดูลใหม่" [wide]="true" (closed)="newOpen.set(false)">
        <div class="form-grid">
          <div class="field"><label>ชื่อโมดูล *</label><input [value]="newModule().label" (input)="setNew('label', $any($event.target).value)" /></div>
          <div class="field"><label>key (a-z, 0-9, _) *</label><input [value]="newModule().key" (input)="setNew('key', $any($event.target).value)" /></div>
          <div class="field"><label>Prefix เลขที่</label><input [value]="newModule().prefix" (input)="setNew('prefix', $any($event.target).value.toUpperCase())" maxlength="8" /></div>
        </div>
        <p class="muted small">เริ่มจากฟิลด์ “ชื่อเรื่อง” แล้วค่อยเพิ่มฟิลด์/สถานะภายหลัง</p>
        <div class="field"><label>ให้สิทธิ์ดู/สร้าง/แก้ไข (ไม่บังคับ)</label><div class="row">@for (role of roles(); track role.id) { @if (!role.isAdmin) { <label class="check"><input type="checkbox" [checked]="newRoleIds().includes(role.id)" (change)="toggleRole(role.id, $any($event.target).checked)" /> {{ role.name }}</label> } }</div></div>
        @if (newError()) { <div class="err">{{ newError() }}</div> }
        <div modal-footer><button type="button" class="btn" (click)="newOpen.set(false)">ยกเลิก</button><button type="button" class="btn primary" [disabled]="newBusy()" (click)="createModule()">สร้างโมดูล</button></div>
      </app-modal>
    }

    @if (renameTarget(); as field) {
      <app-modal title="เปลี่ยน key ฟิลด์" (closed)="closeRename()">
        <div class="notice warn">
          การเปลี่ยน key จะบันทึกทันทีและย้ายข้อมูลเดิมทั้งหมดไปยัง key ใหม่ — การแก้ไขอื่นที่ยังไม่บันทึกจะถูกโหลดใหม่
        </div>
        <div class="form-grid">
          <div class="field"><label>ฟิลด์</label><input [value]="field.label" disabled /></div>
          <div class="field"><label>key เดิม</label><input [value]="field.key" disabled /></div>
          <div class="field"><label>key ใหม่ *</label><input [value]="renameValue()" (input)="renameValue.set($any($event.target).value.trim())" placeholder="new_field_key" /></div>
        </div>
        <p class="muted small">ระบบจะย้ายข้อมูลใน records, คอลัมน์ตาราง, ตัวกรอง, เงื่อนไขแสดงผล, สูตรคำนวณ และฟิลด์บังคับใน workflow ให้อัตโนมัติ</p>
        @if (renameError()) { <div class="err">{{ renameError() }}</div> }
        <div modal-footer>
          <button type="button" class="btn" (click)="closeRename()">ยกเลิก</button>
          <button type="button" class="btn primary" [disabled]="renameBusy() || !renameValue() || renameValue() === field.key" (click)="renameField()">
            {{ renameBusy() ? 'กำลังเปลี่ยน…' : 'เปลี่ยน key' }}
          </button>
        </div>
      </app-modal>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetadataEditorComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly meta = inject(MetaService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly config = signal<FullConfig | null>(null);
  readonly selectedKey = signal('');
  readonly draft = signal<EntityDef | null>(null);
  readonly originalKeys = signal<Set<string>>(new Set());
  readonly saving = signal(false);
  readonly draftMessage = signal('');
  readonly roles = signal<RoleRow[]>([]);
  readonly newOpen = signal(false);
  readonly newBusy = signal(false);
  readonly newError = signal('');
  readonly newModule = signal({ label: '', key: '', prefix: 'DOC' });
  readonly newRoleIds = signal<string[]>([]);
  readonly teams = signal('');
  readonly depts = signal('');
  readonly fieldTypes = FIELD_TYPES;
  readonly dragIndex = signal<number | null>(null);
  readonly dragOverIndex = signal<number | null>(null);
  readonly renameIndex = signal<number | null>(null);
  readonly renameValue = signal('');
  readonly renameBusy = signal(false);
  readonly renameError = signal('');
  readonly renameTarget = computed(() => {
    const draft = this.draft();
    const index = this.renameIndex();
    if (!draft || index === null) return null;
    return draft.fields[index] ?? null;
  });

  readonly entities = computed(() => Object.values(this.config()?.entities ?? {}).sort((a, b) => a.label.localeCompare(b.label, 'th')));
  readonly columnOptions = computed(() => {
    const draft = this.draft();
    if (!draft) return [] as { key: string; label: string }[];
    const options = [{ key: 'code', label: 'รหัสเอกสาร' }];
    for (const field of draft.fields) {
      if (field.type === 'section') continue;
      if (!options.some((option) => option.key === field.key)) options.push({ key: field.key, label: field.label });
    }
    if (this.workflowStatuses(draft).length && !options.some((option) => option.key === 'status')) {
      options.push({ key: 'status', label: 'สถานะ' });
    }
    return options;
  });
  readonly filterOptions = computed(() => {
    const draft = this.draft();
    if (!draft) return [] as { key: string; label: string }[];
    const options = draft.fields
      .filter((field) => !['section', 'rows', 'file'].includes(field.type))
      .map((field) => ({ key: field.key, label: field.label }));
    if (this.workflowStatuses(draft).length) options.unshift({ key: 'status', label: 'สถานะ' });
    return options;
  });

  ngOnInit(): void {
    this.load();
    this.api.get<RoleRow[]>('/roles').subscribe({ next: (roles) => this.roles.set(roles) });
  }

  load(): void {
    this.api.get<FullConfig>('/meta/config').subscribe({
      next: (config) => {
        this.config.set(config);
        const first = this.selectedKey() && config.entities[this.selectedKey()] ? this.selectedKey() : Object.keys(config.entities)[0];
        if (first) this.select(first);
        this.teams.set((config.lists.teams ?? []).join('\n'));
        this.depts.set((config.lists.depts ?? []).join('\n'));
      },
      error: (error: unknown) => this.toast.error(apiErrorMessage(error)),
    });
  }

  select(key: string): void {
    const entity = this.config()?.entities[key];
    if (!entity) return;
    this.selectedKey.set(key);
    this.draft.set(JSON.parse(JSON.stringify(entity)));
    this.originalKeys.set(new Set(entity.fields.map((field) => field.key)));
    this.draftMessage.set('');
  }

  set(key: keyof EntityDef, value: unknown): void {
    this.draft.update((draft) => (draft ? { ...draft, [key]: value } : draft));
  }

  setField(index: number, key: keyof FieldDef, value: unknown): void {
    this.draft.update((draft) => {
      if (!draft) return draft;
      const fields = draft.fields.map((field, i) => (i === index ? { ...field, [key]: value } : field));
      return { ...draft, fields };
    });
  }

  setOptions(index: number, value: string): void {
    this.setField(index, 'options', value.split(',').map((item) => item.trim()).filter((item) => item.length > 0));
  }

  hasCol(key: string): boolean {
    return (this.draft()?.cols ?? []).includes(key);
  }

  toggleCol(key: string, checked: boolean): void {
    this.draft.update((draft) => {
      if (!draft) return draft;
      const cols = checked
        ? [...draft.cols.filter((col) => col !== key), key]
        : draft.cols.filter((col) => col !== key);
      return { ...draft, cols };
    });
  }

  hasFilter(key: string): boolean {
    return (this.draft()?.filters ?? []).includes(key);
  }

  toggleFilter(key: string, checked: boolean): void {
    this.draft.update((draft) => {
      if (!draft) return draft;
      const filters = checked
        ? [...draft.filters.filter((filter) => filter !== key), key]
        : draft.filters.filter((filter) => filter !== key);
      return { ...draft, filters };
    });
  }

  private workflowStatuses(draft: EntityDef): { key: string }[] {
    const key = draft.workflowKey ?? draft.key;
    const workflow = this.config()?.workflows[key] as { statuses?: { key: string }[] } | undefined;
    return workflow?.statuses ?? [];
  }

  changeType(index: number, type: FieldType): void {
    this.draft.update((draft) => {
      if (!draft) return draft;
      const fields = draft.fields.map((field, i) => {
        if (i !== index) return field;
        const next: FieldDef = { ...field, type };
        if (type === 'select') next.options = field.options?.length ? field.options : ['ตัวเลือก 1'];
        if (type === 'rows' && !field.cols?.length) next.cols = [{ key: 'c1', label: 'รายการ', type: 'text' }];
        return next;
      });
      return { ...draft, fields };
    });
  }

  addField(): void {
    this.draft.update((draft) => {
      if (!draft) return draft;
      let n = draft.fields.length + 1;
      while (draft.fields.some((field) => field.key === `field${n}`)) n++;
      return { ...draft, fields: [...draft.fields, { key: `field${n}`, label: 'ฟิลด์ใหม่', type: 'text' }] };
    });
  }

  removeField(index: number): void {
    if (!confirm('ลบฟิลด์นี้ออกจากแบบฟอร์ม?')) return;
    this.draft.update((draft) => (draft ? { ...draft, fields: draft.fields.filter((_, i) => i !== index) } : draft));
  }

  dragStart(index: number, event: DragEvent): void {
    this.dragIndex.set(index);
    this.dragOverIndex.set(index);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    }
  }

  dragOver(index: number, event: DragEvent): void {
    if (this.dragIndex() === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverIndex.set(index);
  }

  dropField(index: number, event: DragEvent): void {
    event.preventDefault();
    const from = this.dragIndex();
    if (from === null || from === index) {
      this.dragEnd();
      return;
    }
    this.draft.update((draft) => {
      if (!draft) return draft;
      const fields = [...draft.fields];
      const [moved] = fields.splice(from, 1);
      if (!moved) return draft;
      fields.splice(index, 0, moved);
      return { ...draft, fields };
    });
    this.dragEnd();
  }

  dragEnd(): void {
    this.dragIndex.set(null);
    this.dragOverIndex.set(null);
  }

  moveField(index: number, delta: number): void {
    const target = index + delta;
    this.draft.update((draft) => {
      if (!draft || target < 0 || target >= draft.fields.length) return draft;
      const fields = [...draft.fields];
      const [moved] = fields.splice(index, 1);
      if (!moved) return draft;
      fields.splice(target, 0, moved);
      return { ...draft, fields };
    });
  }

  openRename(index: number): void {
    const field = this.draft()?.fields[index];
    if (!field) return;
    this.renameIndex.set(index);
    this.renameValue.set(field.key);
    this.renameError.set('');
  }

  closeRename(): void {
    if (this.renameBusy()) return;
    this.renameIndex.set(null);
    this.renameValue.set('');
    this.renameError.set('');
  }

  renameField(): void {
    const draft = this.draft();
    const field = this.renameTarget();
    const to = this.renameValue().trim();
    if (!draft || !field || !to || to === field.key || this.renameBusy()) return;
    this.renameBusy.set(true);
    this.renameError.set('');
    this.api.post<{ from: string; to: string; migrated: number }>(
      `/meta/entity/${draft.key}/rename-field`,
      { from: field.key, to },
    ).subscribe({
      next: (result) => {
        this.renameBusy.set(false);
        this.renameIndex.set(null);
        this.renameValue.set('');
        this.toast.show(`เปลี่ยน key ${result.from} → ${result.to} แล้ว (${result.migrated} รายการ)`);
        this.meta.clearOptions();
        this.meta.load(true);
        this.load();
      },
      error: (error: unknown) => {
        this.renameBusy.set(false);
        this.renameError.set(apiErrorMessage(error));
      },
    });
  }

  save(): void {
    const draft = this.draft();
    if (!draft || this.saving()) return;
    this.saving.set(true);
    this.draftMessage.set('');
    this.api.put<EntityDef>(`/meta/entity/${draft.key}`, draft).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.show('บันทึกโครงสร้างโมดูลแล้ว');
        this.meta.clearOptions();
        this.meta.load(true);
        this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.draftMessage.set(apiErrorMessage(error));
      },
    });
  }

  removeModule(): void {
    const draft = this.draft();
    if (!draft?.custom) return;
    if (!confirm(`ลบโมดูล “${draft.label}”? ข้อมูลต้องว่างก่อน`)) return;
    this.api.delete(`/meta/entity/${draft.key}`).subscribe({
      next: () => {
        this.toast.show('ลบโมดูลแล้ว');
        this.meta.load(true);
        this.load();
      },
      error: (error: unknown) => this.toast.error(apiErrorMessage(error)),
    });
  }

  setNew(key: 'label' | 'key' | 'prefix', value: string): void {
    this.newModule.update((module) => ({ ...module, [key]: value }));
  }

  toggleRole(id: string, checked: boolean): void {
    this.newRoleIds.update((ids) => (checked ? [...ids, id] : ids.filter((roleId) => roleId !== id)));
  }

  createModule(): void {
    const module = this.newModule();
    if (!module.label.trim() || !module.key.trim()) return this.toast.error('กรอกชื่อและ key ของโมดูล');
    this.newBusy.set(true);
    this.newError.set('');
    const body: EntityDef & { roleIds: string[] } = {
      key: module.key.trim(),
      label: module.label.trim(),
      prefix: module.prefix || 'DOC',
      resource: module.key.trim(),
      title: 'name',
      cols: ['code', 'name'],
      filters: [],
      fields: [{ key: 'name', label: 'ชื่อเรื่อง', type: 'text', required: true }],
      custom: true,
      scoped: false,
      roleIds: this.newRoleIds(),
    };
    this.api.post<EntityDef>('/meta/entities', body).subscribe({
      next: (entity) => {
        this.newBusy.set(false);
        this.newOpen.set(false);
        this.selectedKey.set(entity.key);
        this.meta.clearOptions();
        this.meta.load(true);
        this.load();
        this.toast.show('สร้างโมดูลแล้ว');
      },
      error: (error: unknown) => {
        this.newBusy.set(false);
        this.newError.set(apiErrorMessage(error));
      },
    });
  }

  saveLists(): void {
    this.api.put('/meta/lists', {
      teams: this.teams().split('\n').map((s) => s.trim()).filter(Boolean),
      depts: this.depts().split('\n').map((s) => s.trim()).filter(Boolean),
    }).subscribe({
      next: () => {
        this.meta.load(true);
        this.toast.show('บันทึกทีม/แผนกแล้ว');
      },
      error: (error: unknown) => this.toast.error(apiErrorMessage(error)),
    });
  }
}
