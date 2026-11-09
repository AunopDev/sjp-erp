import { ChangeDetectionStrategy, Component, OnInit, computed, effect, input, output, signal } from '@angular/core';
import { displayValue, downloadCsv } from '../core/util';
import { IconComponent } from './icon.component';
import { StateComponent } from './state.component';

export type AnyRow = Record<string, any>;

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

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [IconComponent, StateComponent],
  template: `
    <div class="dt">
      @if (tabs().length) {
        <div class="utabs" role="tablist">
          @for (item of tabs(); track item.key) {
            <button type="button" role="tab" [attr.aria-selected]="tab() === item.key" [class.active]="tab() === item.key" (click)="tab.set(item.key)">
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
        @if (canExport()) {
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
      <div class="tablecard">
        @if (!rows().length) {
          <app-state kind="empty" [message]="emptyText()" [actionLabel]="emptyActionLabel()" (action)="emptyAction.emit()" />
        } @else if (!filtered().length) {
          <app-state kind="empty" message="ไม่พบรายการที่ตรงกับการค้นหา/ตัวกรอง" />
        } @else {
          <div class="table-wrap">
            <table class="tbl">
              <thead>
                <tr>
                  @for (column of columns(); track column.key) {
                    <th class="sortable" [attr.aria-sort]="sort().key === column.key ? (sort().dir === 1 ? 'ascending' : 'descending') : 'none'" (click)="toggleSort(column.key)">
                      {{ column.label }}
                      @if (sort().key === column.key) { {{ sort().dir === 1 ? '▲' : '▼' }} }
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of pageRows(); track row['id']) {
                  <tr [class]="'click ' + rowClass()(row)" (click)="rowClick.emit(row)">
                    @for (column of columns(); track column.key) {
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
        <span class="muted">
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
export class DataTableComponent implements OnInit {
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
  readonly rowClass = input<(row: AnyRow) => string>(() => '');
  readonly initialTab = input('');
  readonly initialFilters = input<Record<string, string>>({});

  readonly rowClick = output<Record<string, unknown>>();
  readonly emptyAction = output<void>();

  readonly q = signal('');
  readonly fv = signal<Record<string, string>>({});
  readonly sort = signal<{ key: string; dir: 1 | -1 }>({ key: '', dir: 1 });
  readonly page = signal(1);
  readonly size = signal(25);
  readonly tab = signal('');
  readonly showFilters = signal(false);
  readonly sizes = [10, 25, 50, 100];

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
  }

  ngOnInit(): void {
    this.size.set(this.pageSize());
    this.fv.set({ ...this.initialFilters() });
    this.tab.set(this.initialTab() || this.tabs()[0]?.key || '');
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
    const data = rows.map((row) => this.columns().map((column) => this.rawValue(row, column) ?? ''));
    downloadCsv(`${this.exportName()}-${new Date().toISOString().slice(0, 10)}.csv`, this.columns().map((c) => c.label), data);
  }
}

export type RecordRowInput = Record<string, unknown> & { id: string };
