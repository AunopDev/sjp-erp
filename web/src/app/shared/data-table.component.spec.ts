import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataTableComponent } from './data-table.component';
import { readDetailNav } from '../core/storage';

const writeText = vi.fn(() => Promise.resolve());

describe('DataTableComponent copy list', () => {
  beforeEach(async () => {
    writeText.mockClear();
    sessionStorage.clear();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await TestBed.configureTestingModule({ imports: [DataTableComponent] }).compileComponents();
  });

  it('copies the filtered rows as TSV and confirms in the button', async () => {
    const fixture = TestBed.createComponent(DataTableComponent);
    fixture.componentRef.setInput('columns', [
      { key: 'code', label: 'รหัส' },
      { key: 'name', label: 'ชื่อ' },
    ]);
    fixture.componentRef.setInput('rows', [
      { id: '1', code: 'T-1', name: 'แจ้งซ่อม' },
      { id: '2', code: 'T-2', name: 'งาน PM' },
    ]);
    fixture.componentRef.setInput('exportName', 'tickets');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const button = [...host.querySelectorAll('button')].find((node) =>
      node.textContent?.includes('คัดลอกรายการ'),
    ) as HTMLButtonElement | undefined;
    expect(button?.textContent).toContain('(2)');

    button?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledWith('รหัส\tชื่อ\r\nT-1\tแจ้งซ่อม\r\nT-2\tงาน PM');
    expect(button?.textContent).toContain('คัดลอกแล้ว');
  });

  it('disables copying when the current filters match nothing', () => {    const fixture = TestBed.createComponent(DataTableComponent);
    fixture.componentRef.setInput('columns', [{ key: 'code', label: 'รหัส' }]);
    fixture.componentRef.setInput('rows', [{ id: '1', code: 'T-1' }]);
    fixture.componentRef.setInput('exportName', 'tickets');
    fixture.detectChanges();

    fixture.componentInstance.q.set('ไม่มีทางเจอ');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const button = [...host.querySelectorAll('button')].find((node) =>
      node.textContent?.includes('คัดลอกรายการ'),
    ) as HTMLButtonElement | undefined;
    expect(button?.disabled).toBe(true);
  });

  it('remembers the filtered order when a row is opened', async () => {
    const fixture = TestBed.createComponent(DataTableComponent);
    fixture.componentRef.setInput('columns', [
      { key: 'code', label: 'รหัส' },
      { key: 'name', label: 'ชื่อ' },
    ]);
    fixture.componentRef.setInput('rows', [
      { id: '1', code: 'T-1', name: 'แจ้งซ่อม' },
      { id: '2', code: 'T-2', name: 'งาน PM' },
    ]);
    fixture.componentRef.setInput('exportName', 'tickets');
    fixture.detectChanges();

    const row = (fixture.nativeElement as HTMLElement).querySelector('tbody tr') as HTMLElement;
    row.click();

    expect(readDetailNav('tickets')).toEqual(['1', '2']);
  });
});
