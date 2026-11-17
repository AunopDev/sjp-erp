import { beforeEach, describe, expect, it } from 'vitest';
import {
  readColumnPrefs,
  readDetailNav,
  readDensity,
  readNavClosedGroups,
  readNavFavorites,
  readNavRecent,
  readTableViews,
  readThemePref,
  writeColumnPrefs,
  writeDensity,
  writeDetailNav,
  writeNavClosedGroups,
  writeNavFavorites,
  writeNavRecent,
  writeTableViews,
  writeThemePref,
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

describe('theme preference', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to following the operating system', () => {
    expect(readThemePref()).toBe('system');
  });

  it('round-trips explicit light and dark choices', () => {
    writeThemePref('light');
    expect(readThemePref()).toBe('light');

    writeThemePref('dark');
    expect(readThemePref()).toBe('dark');
  });

  it('clears the key when the choice goes back to system', () => {
    writeThemePref('light');
    writeThemePref('system');
    expect(localStorage.getItem('sjp-theme')).toBeNull();
    expect(readThemePref()).toBe('system');
  });
});

describe('detail navigation order', () => {
  beforeEach(() => sessionStorage.clear());

  it('round-trips the visible id order for a list', () => {
    writeDetailNav('items', ['a', 'b', 'c']);
    expect(readDetailNav('items')).toEqual(['a', 'b', 'c']);
  });

  it('expires orders older than the freshness window', () => {
    sessionStorage.setItem(
      'sjp-detail-nav-items',
      JSON.stringify({ ids: ['a'], at: Date.now() - 31 * 60_000 }),
    );
    expect(readDetailNav('items')).toBeNull();
  });

  it('ignores malformed payloads', () => {
    sessionStorage.setItem('sjp-detail-nav-items', 'not-json');
    expect(readDetailNav('items')).toBeNull();
    sessionStorage.setItem('sjp-detail-nav-items', JSON.stringify({ ids: [42, 'a'], at: Date.now() }));
    expect(readDetailNav('items')).toEqual(['a']);
  });
});
