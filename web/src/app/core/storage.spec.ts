import { beforeEach, describe, expect, it } from 'vitest';
import {
  readColumnPrefs,
  readDensity,
  readNavClosedGroups,
  readNavFavorites,
  readNavRecent,
  readTableViews,
  writeColumnPrefs,
  writeDensity,
  writeNavClosedGroups,
  writeNavFavorites,
  writeNavRecent,
  writeTableViews,
} from './storage';

describe('navigation storage', () => {
  beforeEach(() => localStorage.clear());

  it('returns null before the user has saved favorites', () => {
    expect(readNavFavorites()).toBeNull();
    expect(readNavClosedGroups()).toBeNull();
    expect(readNavRecent()).toEqual([]);
  });

  it('round-trips navigation lists', () => {
    writeNavFavorites(['/', '/tickets']);
    writeNavRecent(['/calendar']);
    writeNavClosedGroups(['ข้อมูลหลัก']);

    expect(readNavFavorites()).toEqual(['/', '/tickets']);
    expect(readNavRecent()).toEqual(['/calendar']);
    expect(readNavClosedGroups()).toEqual(['ข้อมูลหลัก']);
  });

  it('ignores malformed or non-string values', () => {
    localStorage.setItem('sjp-nav-favorites', 'not-json');
    expect(readNavFavorites()).toBeNull();

    localStorage.setItem('sjp-nav-recent', JSON.stringify(['/ok', 42, null, {}]));
    expect(readNavRecent()).toEqual(['/ok']);
  });
});

describe('table preferences', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to compact density and no hidden columns', () => {
    expect(readDensity()).toBe('compact');
    expect(readColumnPrefs('tickets')).toEqual([]);
    expect(readTableViews('tickets')).toEqual([]);
  });

  it('round-trips density, columns and saved views', () => {
    writeDensity('comfy');
    writeColumnPrefs('tickets', ['customer']);
    writeTableViews('tickets', [{ id: '1', name: 'งานค้าง' }]);

    expect(readDensity()).toBe('comfy');
    expect(readColumnPrefs('tickets')).toEqual(['customer']);
    expect(readTableViews('tickets')).toEqual([{ id: '1', name: 'งานค้าง' }]);
  });

  it('survives malformed stored json', () => {
    localStorage.setItem('sjp-cols-tickets', 'not-json');
    localStorage.setItem('sjp-views-tickets', 'not-json');
    expect(readColumnPrefs('tickets')).toEqual([]);
    expect(readTableViews('tickets')).toEqual([]);
  });
});
