export const TOKEN_KEY = 'sjp-erp-token';
export const THEME_KEY = 'sjp-theme';
export const SIDEBAR_KEY = 'sjp-sidebar-collapsed';
export const NAV_FAVORITES_KEY = 'sjp-nav-favorites';
export const NAV_RECENT_KEY = 'sjp-nav-recent';
export const NAV_CLOSED_GROUPS_KEY = 'sjp-nav-closed-groups';

export const readToken = (): string => {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
};

export const writeToken = (token: string): void => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage can be disabled */
  }
};

/** Read a non-HttpOnly cookie (used for the double-submit CSRF token). */
export const readCookie = (name: string): string => {
  try {
    const prefix = `${name}=`;
    for (const part of document.cookie.split(';')) {
      const value = part.trim();
      if (value.startsWith(prefix)) return decodeURIComponent(value.slice(prefix.length));
    }
    return '';
  } catch {
    return '';
  }
};

/** `system` follows the OS preference; the other two are explicit choices. */
export type ThemePref = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const readThemePref = (): ThemePref => {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
};

export const writeThemePref = (pref: ThemePref): void => {
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* ignore */
  }
};

export const systemPrefersDark = (): boolean => {
  try {
    return typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return true;
  }
};

export const resolveTheme = (pref: ThemePref = readThemePref()): ResolvedTheme =>
  pref === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : pref;

/** Resolved theme for code that only needs the theme currently painted. */
export const readTheme = (): ResolvedTheme => resolveTheme();

/** Kept for explicit light/dark writes; clears the `system` override. */
export const writeTheme = (theme: ResolvedTheme): void => writeThemePref(theme);

export const readSidebarCollapsed = (): boolean => {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
};

export const writeSidebarCollapsed = (collapsed: boolean): void => {
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
  } catch {
    /* ignore */
  }
};

/** Returns `null` when the key has never been written, so callers can seed defaults. */
function readStringList(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string' && value.length > 0);
  } catch {
    return null;
  }
}

function writeStringList(key: string, values: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch {
    /* storage can be disabled */
  }
}

export const readNavFavorites = (): string[] | null => readStringList(NAV_FAVORITES_KEY);
export const writeNavFavorites = (paths: string[]): void => writeStringList(NAV_FAVORITES_KEY, paths);

export const readNavRecent = (): string[] => readStringList(NAV_RECENT_KEY) ?? [];
export const writeNavRecent = (paths: string[]): void => writeStringList(NAV_RECENT_KEY, paths);

export const readNavClosedGroups = (): string[] | null => readStringList(NAV_CLOSED_GROUPS_KEY);
export const writeNavClosedGroups = (labels: string[]): void => writeStringList(NAV_CLOSED_GROUPS_KEY, labels);

export const DENSITY_KEY = 'sjp-density';

export type Density = 'compact' | 'comfy';

export const readDensity = (): Density => {
  try {
    return localStorage.getItem(DENSITY_KEY) === 'comfy' ? 'comfy' : 'compact';
  } catch {
    return 'compact';
  }
};

export const writeDensity = (density: Density): void => {
  try {
    localStorage.setItem(DENSITY_KEY, density);
  } catch {
    /* storage can be disabled */
  }
};

const DETAIL_NAV_PREFIX = 'sjp-detail-nav-';

/**
 * Remembers the visible order of a list (session-scoped) so the record detail
 * page can offer previous/next without another round trip.
 */
export const writeDetailNav = (key: string, ids: string[]): void => {
  try {
    sessionStorage.setItem(DETAIL_NAV_PREFIX + key, JSON.stringify({ ids, at: Date.now() }));
  } catch {
    /* storage can be disabled */
  }
};

export const readDetailNav = (key: string, maxAgeMs = 30 * 60_000): string[] | null => {
  try {
    const raw = sessionStorage.getItem(DETAIL_NAV_PREFIX + key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const value = parsed as { ids?: unknown; at?: unknown };
    if (!Array.isArray(value.ids) || typeof value.at !== 'number') return null;
    if (Date.now() - value.at > maxAgeMs) return null;
    const ids = value.ids.filter((id): id is string => typeof id === 'string');
    return ids.length ? ids : null;
  } catch {
    return null;
  }
};

const COLUMN_PREFIX = 'sjp-cols-';

export const readColumnPrefs = (table: string): string[] => {
  try {
    const raw = localStorage.getItem(COLUMN_PREFIX + table);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
};

export const writeColumnPrefs = (table: string, keys: string[]): void => {
  try {
    localStorage.setItem(COLUMN_PREFIX + table, JSON.stringify(keys));
  } catch {
    /* storage can be disabled */
  }
};

const VIEWS_PREFIX = 'sjp-views-';

export const readTableViews = (table: string): unknown[] => {
  try {
    const raw = localStorage.getItem(VIEWS_PREFIX + table);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const writeTableViews = (table: string, views: unknown[]): void => {
  try {
    localStorage.setItem(VIEWS_PREFIX + table, JSON.stringify(views));
  } catch {
    /* storage can be disabled */
  }
};
