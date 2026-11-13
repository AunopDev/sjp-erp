import { describe, expect, it } from 'vitest';
import { addMonthsClamped, dateKeyOf, isDateOnly, nextDue, timeKeyOf, todayStr } from './dates.js';

describe('date helpers', () => {
  it('keeps date-only values in the business timezone format', () => {
    expect(todayStr('Asia/Bangkok')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(isDateOnly('2026-02-29')).toBe(false);
    expect(isDateOnly('2028-02-29')).toBe(true);
  });

  it('renders instants in the business timezone, not UTC', () => {
    expect(dateKeyOf('2026-11-10T02:00:00.000Z', 'Asia/Bangkok')).toBe('2026-11-10');
    expect(timeKeyOf('2026-11-10T02:00:00.000Z', 'Asia/Bangkok')).toBe('09:00');
    expect(dateKeyOf('2026-11-09T23:30:00.000Z', 'Asia/Bangkok')).toBe('2026-11-10');
    expect(timeKeyOf('2026-11-09T23:30:00.000Z', 'Asia/Bangkok')).toBe('06:30');
  });

  it('clamps month-end instead of drifting into the next month', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('advances PM frequencies predictably', () => {
    expect(nextDue('2026-01-31', 'รายเดือน')).toBe('2026-02-28');
    expect(nextDue('2026-01-31', 'รายไตรมาส')).toBe('2026-04-30');
    expect(nextDue('2026-01-31', 'รายสัปดาห์')).toBe('2026-02-07');
  });
});
