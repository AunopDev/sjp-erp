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

export const readTheme = (): 'dark' | 'light' => {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
};

export const writeTheme = (theme: 'dark' | 'light'): void => {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
};

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
