import { describe, expect, it } from 'vitest';
import { displayValue, fmtDate, fmtDateTime } from './util';

describe('displayValue', () => {
  it('never leaks empty or object sentinels', () => {
    expect(displayValue(undefined)).toBe('–');
    expect(displayValue(null)).toBe('–');
    expect(displayValue('')).toBe('–');
    expect(displayValue({ foo: 'bar' })).toBe('–');
    expect(displayValue({ name: 'ไฟล์ตัวอย่าง' })).toBe('ไฟล์ตัวอย่าง');
    expect(displayValue('[object Object]')).toBe('–');
    expect(displayValue('undefined')).toBe('–');
  });

  it('keeps normal values and formatting predictable', () => {
    expect(displayValue('ข้อความยาว')).toBe('ข้อความยาว');
    expect(displayValue(0)).toBe('0');
    expect(displayValue(false)).toBe('ไม่');
    expect(fmtDate('2026-11-09')).not.toBe('–');
    expect(fmtDateTime('2026-11-09T10:30:00.000Z')).not.toBe('–');
    expect(fmtDate({ bad: true })).toBe('–');
  });
});
