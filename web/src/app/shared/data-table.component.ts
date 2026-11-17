import { ChangeDetectionStrategy, Component, ElementRef, HostListener, OnDestroy, OnInit, computed, effect, inject, input, output, signal } from '@angular/core';
import { displayValue, downloadCsv, copyText, toTsv } from '../core/util';
import { readColumnPrefs, readTableViews, writeColumnPrefs, writeDetailNav, writeTableViews } from '../core/storage';
import { IconComponent } from './icon.component';
import { StateComponent } from './state.component';

export type AnyRow = Record<string, unknown> & { _labels?: Record<string, string> };

export interface ColumnDef {
  key: string;
  label: string;
  value?: (row: AnyRow) => unknown;
  badge?: (row: AnyRow) => string;
  width?: string;
}

export interface FilterDef {
  key: string;
  label: string;
  options: [string, string][];
  get: (row: AnyRow) => unknown;
}

export interface TabDef {
  key: string;
  label: string;
  test?: (row: AnyRow) => boolean;
}

interface SavedView {
  id: string;
  name: string;
  q: string;
  fv: Record<string, string>;
  tab: string;
  sort: { key: string; dir: 1 | -1 };
}

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [IconComponent, StateComponent],
  template: `
    <div class="dt">
      @if (tabs().length) {
        <div class="utabs" role="group" aria-label="ตัวกรองสถานะ">
          @for (item of tabs(); track item.key) {
            <button type="button" [attr.aria-pressed]="tab() === item.key" [class.active]="tab() === item.key" (click)="tab.set(item.key)">
              {{ item.label }}<span class="tab-count">{{ countFor(item) }}</span>
            </button>
          }
        </div>
      }
      <div class="table-tools">
        <div class="searchbox">
          <app-icon name="search" [size]="18" />
          <input type="search" [placeholder]="searchPlaceholder()" [value]="q()" (input)="onSearch($event)" aria-label="ค้นหา" />
          @if (q()) {
            <button type="button" class="search-clear" (click)="q.set('')" aria-label="ล้างคำค้น">×</button>
          }
        </div>
        @if (filters().length) {
          <button type="button" class="btn tool" [class.on]="showFilters() || activeFilterCount()" (click)="showFilters.set(!showFilters())">
            <app-icon name="filter" [size]="18" /> ตัวกรอง
            @if (activeFilterCount()) { <span class="tab-count">{{ activeFilterCount() }}</span> }
          </button>
        }
        <span class="grow"></span>
        <ng-content />
        <div class="views-wrap">
          <button type="button" class="btn tool" [class.on]="viewMenu()" [attr.aria-expanded]="viewMenu()" aria-haspopup="true" (click)="toggleViewMenu()">
            <app-icon name="folder" [size]="18" /> มุมมอง
            @if (savedViews().length) { <span class="tab-count">{{ savedViews().length }}</span> }
          </button>
          @if (viewMenu()) {
            <div class="views-menu" role="dialog" aria-label="มุมมองที่บันทึก">
              <div class="view-save">
                <input [value]="viewName()" (input)="viewName.set($any($event.target).value)" placeholder="ตั้งชื่อมุมมอง…" aria-label="ชื่อมุมมอง" />
                <button type="button" class="btn sm primary" [disabled]="!viewName().trim()" (click)="saveView()">บันทึก</button>
              </div>
              @if (!savedViews().length) {
                <div class="view-empty">ยังไม่มีมุมมองที่บันทึก</div>
              } @else {
                @for (view of savedViews(); track view.id) {
                  <div class="view-row">
                    <button type="button" class="view-apply" (click)="applyView(view)">{{ view.name }}</button>
                    <button type="button" class="view-del" (click)="deleteView(view.id, $event)" aria-label="ลบมุมมอง">×</button>
                  </div>
                }
              }
            </div>
          }
        </div>
        <div class="cols-wrap">
          <button type="button" class="btn tool" [class.on]="columnMenu()" [attr.aria-expanded]="columnMenu()" aria-haspopup="true" (click)="toggleColumnMenu()">
            <app-icon name="columns" [size]="18" /> คอลัมน์
          </button>
          @if (columnMenu()) {
            <div class="cols-menu" role="group" aria-label="เลือกคอลัมน์ที่แสดง">
              @for (column of columns(); track column.key) {
                <label class="cols-item">
                  <input type="checkbox" [checked]="!hiddenColumns().includes(column.key)" (change)="toggleColumn(column.key)" />
                  <span>{{ column.label }}</span>
                </label>
              }
            </div>
          }
        </div>
        @if (canExport()) {
          <button
            type="button"
            class="btn tool"
            [disabled]="!filtered().length"
            (click)="copyList()"
            [attr.aria-label]="'คัดลอกรายการที่กรองแล้ว ' + filtered().length + ' รายการ'"
          >
            <app-icon name="copy" [size]="18" />
            <span aria-live="polite">
              {{ copyState() === 'done' ? 'คัดลอกแล้ว' : copyState() === 'fail' ? 'คัดลอกไม่ได้' : 'คัดลอกรายการ (' + filtered().length + ')' }}
            </span>
          </button>
          <button type="button" class="btn tool" [disabled]="!filtered().length" (click)="exportCsv()">
            <app-icon name="download" [size]="18" /> ส่งออก CSV
          </button>
        }
      </div>
      @if (showFilters() && filters().length) {
        <div class="filter-row">
          @for (filter of filters(); track filter.key) {
            <select [value]="fv()[filter.key] || ''" (change)="setFilter(filter.key, $event)" [attr.aria-label]="filter.label">
              <option value="" [selected]="!fv()[filter.key]">{{ filter.label }}: ทั้งหมด</option>
              @for (option of filter.options; track option[0]) {
                <option [value]="option[0]" [selected]="option[0] === fv()[filter.key]">{{ option[1] }}</option>
              }
            </select>
          }
          @if (activeFilterCount()) {
            <button type="button" class="btn sm" (click)="fv.set({})">ล้างตัวกรอง</button>
          }
        </div>
      }
      @if (error() && rows().length) {
        <div class="notice bad" role="alert">
          {{ error() }}
          <button type="button" class="btn sm" (click)="retry.emit()">ลองใหม่</button>
        </div>
      }
      <div class="tablecard">
        @if (error() && !rows().length) {
          <app-state kind="error" [message]="error()" actionLabel="ลองใหม่" (action)="retry.emit()" />
        } @else if (!rows().length) {
          <app-state kind="empty" [message]="emptyText()" [actionLabel]="emptyActionLabel()" (action)="emptyAction.emit()" />
        } @else if (!filtered().length) {
          <app-state
            kind="empty"
            message="ไม่พบรายการที่ตรงกับการค้นหา/ตัวกรอง"
            actionLabel="ล้างตัวกรอง"
            (action)="clearFilters()"
          />
        } @else {
          <div class="table-wrap">
            <table class="tbl">
              <thead>
                <tr>
                  @for (column of visibleColumns(); track column.key) {
                    <th scope="col" class="sortable" [attr.aria-sort]="sort().key === column.key ? (sort().dir === 1 ? 'ascending' : 'descending') : 'none'">
                      <button type="button" class="th-sort" (click)="toggleSort(column.key)">
                        {{ column.label }}
                        @if (sort().key === column.key) { {{ sort().dir === 1 ? '▲' : '▼' }} }
                      </button>
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of pageRows(); track row['id']) {
                  <tr
                    [class]="'click ' + rowClass()(row)"
                    tabindex="0"
                    (click)="onRowClick(row)"
                    (keydown)="onRowKey($event, row)"
                  >
                    @for (column of visibleColumns(); track column.key) {
                      <td [attr.data-label]="column.label">
                        @if (column.badge) {
                          <span class="badge {{ column.badge(row) }}">{{ cell(row, column) }}</span>
                        } @else {
                          {{ cell(row, column) }}
                        }
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
      <div class="pager">
        <span class="muted" role="status" aria-live="polite">
          {{ filtered().length ? ((page() - 1) * size() + 1) + '–' + min(filtered().length, page() * size()) + ' จาก ' + filtered().length : '0 รายการ' }}
          @if (filtered().length !== rows().length && !tabs().length) { (ทั้งหมด {{ rows().length }}) }
        </span>
        <select [value]="size()" (change)="setSize($event)" aria-label="จำนวนต่อหน้า">
          @for (n of sizes; track n) { <option [value]="n" [selected]="n === size()">{{ n }} / หน้า</option> }
        </select>
        <span class="grow"></span>
        <button type="button" class="btn sm" [disabled]="currentPage() <= 1" (click)="page.set(currentPage() - 1)">ก่อนหน้า</button>
        <span>หน้า {{ currentPage() }} / {{ pages() }}</span>
        <button type="button" class="btn sm" [disabled]="currentPage() >= pages()" (click)="page.set(currentPage() + 1)">ถัดไป</button>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataTableComponent implements OnInit, OnDestroy {
  readonly columns = input.required<ColumnDef[]>();
  readonly rows = input<RecordRowInput[]>([]);
  readonly filters = input<FilterDef[]>([]);
  readonly tabs = input<TabDef[]>([]);
  readonly pageSize = input(25);
  readonly exportName = input('export');
  readonly canExport = input(true);
  readonly searchPlaceholder = input('ค้นหา…');
  readonly emptyText = input('ยังไม่มีข้อมูล');
  readonly emptyActionLabel = input('');
  readonly error = input('');
  readonly rowClass = input<(row: AnyRow) => string>(() => '');
  readonly initialTab = input('');
  readonly initialFilters = input<Record<string, string>>({});

  readonly rowClick = output<Record<string, unknown>>();
  readonly emptyAction = output<void>();
  readonly retry = output<void>();

  readonly q = signal('');
  readonly fv = signal<Record<string, string>>({});
  readonly sort = signal<{ key: string; dir: 1 | -1 }>({ key: '', dir: 1 });
  readonly page = signal(1);
  readonly size = signal(25);
  readonly tab = signal('');
  readonly showFilters = signal(false);
  readonly hiddenColumns = signal<string[]>([]);
  readonly columnMenu = signal(false);
  readonly savedViews = signal<SavedView[]>([]);
  readonly viewMenu = signal(false);
  readonly viewName = signal('');
  readonly copyState = signal<'idle' | 'done' | 'fail'>('idle');
  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  readonly sizes = [10, 25, 50, 100];
  private readonly host = inject(ElementRef) as ElementRef<HTMLElement>;

  readonly visibleColumns = computed(() => {
    const hidden = new Set(this.hiddenColumns());
    const visible = this.columns().filter((column) => !hidden.has(column.key));
    return visible.length ? visible : this.columns();
  });

  readonly filtered = computed(() => {
    let out = this.rows();
    const tabTest = this.tabs().find((t) => t.key === this.tab())?.test;
    if (tabTest) out = out.filter(tabTest);
    const filters = this.fv();
    for (const filter of this.filters()) {
      const value = filters[filter.key];
      if (value) out = out.filter((row) => String(filter.get(row) ?? '') === value);
    }
    const search = this.q().trim().toLowerCase();
    if (search) {
      out = out.filter((row) =>
        this.columns().some((column) => String(this.rawValue(row, column) ?? '').toLowerCase().includes(search)),
      );
    }
    const sort = this.sort();
    if (sort.key) {
      const column = this.columns().find((c) => c.key === sort.key);
      if (column) {
        out = [...out].sort((a, b) => {
          const x = this.rawValue(a, column);
          const y = this.rawValue(b, column);
          if (x === undefined || x === null || x === '') return 1;
          if (y === undefined || y === null || y === '') return -1;
          if (typeof x === 'number' && typeof y === 'number') return (x - y) * sort.dir;
          return String(x).localeCompare(String(y), 'th', { numeric: true }) * sort.dir;
        });
      }
    }
    return out;
  });
  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.size())));
  readonly currentPage = computed(() => Math.min(this.page(), this.pages()));
  readonly pageRows = computed(() => {
    const page = this.currentPage();
    return this.filtered().slice((page - 1) * this.size(), page * this.size());
  });
  readonly activeFilterCount = computed(() => Object.values(this.fv()).filter(Boolean).length);

  constructor() {
    effect(() => {
      this.q();
      this.fv();
      this.size();
      this.tab();
      this.page.set(1);
    });
    effect(() => {
      this.hiddenColumns.set(readColumnPrefs(this.exportName()));
    });
    effect(() => {
      const raw = readTableViews(this.exportName());
      this.savedViews.set(raw.filter((view): view is SavedView => this.isSavedView(view)));
    });
  }

  private isSavedView(value: unknown): value is SavedView {
    if (!value || typeof value !== 'object') return false;
    const view = value as Partial<SavedView>;
    return typeof view.id === 'string' && typeof view.name === 'string' && typeof view.q === 'string';
  }

  toggleViewMenu(): void {
    const next = !this.viewMenu();
    this.viewMenu.set(next);
    this.columnMenu.set(false);
  }

  toggleColumnMenu(): void {
    const next = !this.columnMenu();
    this.columnMenu.set(next);
    this.viewMenu.set(false);
  }

  saveView(): void {
    const name = this.viewName().trim();
    if (!name) return;
    const existing = this.savedViews().find((view) => view.name.toLowerCase() === name.toLowerCase());
    const view: SavedView = {
      id: existing?.id ?? `${Date.now()}`,
      name,
      q: this.q(),
      fv: { ...this.fv() },
      tab: this.tab(),
      sort: { ...this.sort() },
    };
    const next = existing
      ? this.savedViews().map((item) => (item.id === existing.id ? view : item))
      : [...this.savedViews(), view].slice(-12);
    this.savedViews.set(next);
    writeTableViews(this.exportName(), next);
    this.viewName.set('');
  }

  applyView(view: SavedView): void {
    this.q.set(view.q ?? '');
    this.fv.set({ ...(view.fv ?? {}) });
    this.tab.set(view.tab ?? '');
    this.sort.set(view.sort?.key ? view.sort : { key: '', dir: 1 });
    this.viewMenu.set(false);
  }

  deleteView(id: string, event: MouseEvent): void {
    event.stopPropagation();
    const next = this.savedViews().filter((view) => view.id !== id);
    this.savedViews.set(next);
    writeTableViews(this.exportName(), next);
  }

  ngOnInit(): void {
    this.size.set(this.pageSize());
    this.fv.set({ ...this.initialFilters() });
    this.tab.set(this.initialTab() || this.tabs()[0]?.key || '');
  }

  ngOnDestroy(): void {
    if (this.copyTimer) clearTimeout(this.copyTimer);
  }

  onSearch(event: Event): void {
    this.q.set((event.target as HTMLInputElement).value);
  }

  setFilter(key: string, event: Event): void {
    this.fv.update((filters) => ({ ...filters, [key]: (event.target as HTMLSelectElement).value }));
  }

  setSize(event: Event): void {
    this.size.set(Number((event.target as HTMLSelectElement).value));
  }

  toggleSort(key: string): void {
    this.sort.update((sort) => (sort.key === key ? { key, dir: sort.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  onRowKey(event: KeyboardEvent, row: AnyRow): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.onRowClick(row);
  }

  onRowClick(row: AnyRow): void {
    writeDetailNav(this.exportName(), this.filtered().map((item) => String(item['id'])));
    this.rowClick.emit(row);
  }

  clearFilters(): void {
    this.q.set('');
    this.fv.set({});
  }

  toggleColumn(key: string): void {
    const current = this.hiddenColumns();
    const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
    if (this.columns().length - next.length < 1) return;
    this.hiddenColumns.set(next);
    writeColumnPrefs(this.exportName(), next);
  }

  @HostListener('document:pointerdown', ['$event'])
  onPointer(event: PointerEvent): void {
    if (!this.columnMenu() && !this.viewMenu()) return;
    const target = event.target as Node | null;
    if (target && this.host.nativeElement.contains(target)) return;
    this.columnMenu.set(false);
    this.viewMenu.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.columnMenu.set(false);
    this.viewMenu.set(false);
  }

  countFor(tab: TabDef): number {
    return tab.test ? this.rows().filter(tab.test).length : this.rows().length;
  }

  rawValue(row: AnyRow, column: ColumnDef): unknown {
    return column.value ? column.value(row) : row[column.key];
  }

  cell(row: AnyRow, column: ColumnDef): string {
    return displayValue(this.rawValue(row, column));
  }

  min(a: number, b: number): number {
    return Math.min(a, b);
  }

  exportCsv(): void {
    const rows = this.filtered();
    const columns = this.visibleColumns();
    const data = rows.map((row) => columns.map((column) => this.rawValue(row, column) ?? ''));
    downloadCsv(`${this.exportName()}-${new Date().toISOString().slice(0, 10)}.csv`, columns.map((c) => c.label), data);
  }

  /** Copies the current filter/sort result as TSV — handy for LINE or a spreadsheet. */
  async copyList(): Promise<void> {
    const rows = this.filtered();
    if (!rows.length) return;
    const columns = this.visibleColumns();
    const text = toTsv(
      columns.map((column) => column.label),
      rows.map((row) => columns.map((column) => this.rawValue(row, column))),
    );
    const ok = await copyText(text);
    this.copyState.set(ok ? 'done' : 'fail');
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copyState.set('idle'), 2200);
  }
}

export type RecordRowInput = Record<string, unknown> & { id: string };
