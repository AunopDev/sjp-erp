import { describe, expect, it } from 'vitest';
import { displayValue, fmtDate, fmtDateTime, horizontalSwipe, listNeighbours, toTsv } from './util';

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

  it('formats dates as dd/MM/yyyy with the language year', () => {
    expect(fmtDate('2026-11-13')).toBe('13/11/2569');
    expect(fmtDate('2026-11-13', 'en')).toBe('13/11/2026');
    expect(fmtDateTime('2026-11-13T10:30:00')).toBe('13/11/2569 10:30');
    expect(fmtDateTime('2026-11-13T10:30:00', 'en')).toBe('13/11/2026 10:30');
  });
});

describe('toTsv', () => {
  it('builds a header row and tab-separated cells', () => {
    const text = toTsv(['รหัส', 'ชื่อ'], [['T-001', 'แจ้งซ่อม'], ['T-002', 'PM']]);
    expect(text).toBe('รหัส\tชื่อ\r\nT-001\tแจ้งซ่อม\r\nT-002\tPM');
  });

  it('keeps blanks empty and strips tabs/newlines so columns never shift', () => {
    expect(toTsv(['a', 'b'], [[null, 'x\ty'], [undefined, 'line\nbreak']])).toBe(
      'a\tb\r\n\tx y\r\n\tline break',
    );
  });
});

describe('horizontalSwipe', () => {
  it('reads a long, flat drag as a swipe', () => {
    expect(horizontalSwipe(-80, 6)).toBe('left');
    expect(horizontalSwipe(90, -10)).toBe('right');
  });

  it('ignores taps, short moves and vertical scrolling', () => {
    expect(horizontalSwipe(20, 2)).toBeNull();
    expect(horizontalSwipe(-40, 0)).toBeNull();
    expect(horizontalSwipe(-70, 120)).toBeNull();
  });
});

describe('listNeighbours', () => {
  it('returns the position and both siblings', () => {
    expect(listNeighbours(['a', 'b', 'c'], 'b')).toEqual({ index: 1, total: 3, prev: 'a', next: 'c' });
  });

  it('leaves the missing edge empty', () => {
    expect(listNeighbours(['a', 'b'], 'a')).toEqual({ index: 0, total: 2, prev: '', next: 'b' });
    expect(listNeighbours(['a', 'b'], 'b')).toEqual({ index: 1, total: 2, prev: 'a', next: '' });
  });

  it('returns null when the record is not in the list', () => {
    expect(listNeighbours(['a', 'b'], 'z')).toBeNull();
    expect(listNeighbours(null, 'a')).toBeNull();
  });
});
