export const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Safe display value: never leak `undefined`, `null` or `[object Object]` into the UI.
 * Objects are only shown when they expose a human-readable `name`.
 */
export function displayValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '–';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '–';
  if (typeof value === 'boolean') return value ? 'ใช่' : 'ไม่';
  if (Array.isArray(value)) {
    const parts = value.map((item) => displayValue(item)).filter((item) => item !== '–');
    return parts.length ? parts.join(', ') : '–';
  }
  if (typeof value === 'object') {
    const name = (value as { name?: unknown }).name;
    return typeof name === 'string' && name.trim() ? name : '–';
  }
  const text = String(value).trim();
  return !text || text === '[object Object]' || text === 'undefined' || text === 'null' ? '–' : text;
}


/** Local date-only value, not UTC. Fixes the 00:00–06:59 off-by-one bug. */
export function todayStr(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function nowLocalInput(date = new Date()): string {
  return `${todayStr(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function toLocalInput(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return nowLocalInput(date);
}

export function isoFromLocalInput(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

const numFmt = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });

type DateLang = 'th' | 'en';

function dateParts(value: unknown): { day: string; month: string; year: number; hour: string; minute: string } | null {
  if (!value) return null;
  const text = displayValue(value);
  if (text === '–') return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00`) : new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return {
    day: String(date.getDate()).padStart(2, '0'),
    month: String(date.getMonth() + 1).padStart(2, '0'),
    year: date.getFullYear(),
    hour: String(date.getHours()).padStart(2, '0'),
    minute: String(date.getMinutes()).padStart(2, '0'),
  };
}

/** dd/MM/yyyy — Thai UI uses พ.ศ., English UI uses ค.ศ. */
export function fmtDate(value: unknown, lang: DateLang = 'th'): string {
  const parts = dateParts(value);
  if (!parts) return displayValue(value);
  const year = lang === 'th' ? parts.year + 543 : parts.year;
  return `${parts.day}/${parts.month}/${year}`;
}

/** dd/MM/yyyy HH:mm — Thai UI uses พ.ศ., English UI uses ค.ศ. */
export function fmtDateTime(value: unknown, lang: DateLang = 'th'): string {
  const parts = dateParts(value);
  if (!parts) return displayValue(value);
  const year = lang === 'th' ? parts.year + 543 : parts.year;
  return `${parts.day}/${parts.month}/${year} ${parts.hour}:${parts.minute}`;
}

export function fmtNum(value: unknown): string {
  if (value === undefined || value === null || value === '') return '–';
  const n = Number(value);
  return Number.isFinite(n) ? numFmt.format(n) : displayValue(value);
}

export function fmtMoney(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n)
    ? n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';
}

export function fmtDuration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || Number.isNaN(hours)) return '–';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} นาที`;
  if (hours < 48) return `${hours.toFixed(1).replace(/\.0$/, '')} ชม.`;
  return `${Math.floor(hours / 24)} วัน ${Math.round(hours % 24)} ชม.`;
}

export function ageHours(receivedAt: unknown, end: unknown = null): number {
  const start = new Date(String(receivedAt ?? '')).getTime();
  const finish = end ? new Date(String(end)).getTime() : Date.now();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, (finish - start) / 3600000);
}

export function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

export function labelOf(value: unknown): string {
  return displayValue(value);
}

/**
 * CSV cell: quote correctly and neutralise formula injection only for strings.
 * Numbers (including negative numbers) stay numeric in Excel.
 */
export function csvCell(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number') return String(value);
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return `\uFEFF${[headers.join(','), ...rows.map((row) => row.map(csvCell).join(','))].join('\r\n')}`;
}

export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
  const blob = new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 500);
}

/** Tab-separated text for pasting a filtered table into chat or a spreadsheet. */
export function toTsv(headers: string[], rows: unknown[][]): string {
  const cell = (value: unknown): string => {
    if (value === undefined || value === null || value === '') return '';
    return displayValue(value).replace(/[\t\r\n]+/g, ' ');
  };
  return [headers, ...rows].map((row) => row.map(cell).join('\t')).join('\r\n');
}

/** Copy text, with a fallback for browsers outside a secure context. */
export async function copyText(text: string): Promise<boolean> {  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the textarea fallback */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Detects an intentional horizontal swipe and ignores taps, diagonal drags and
 * vertical scrolling. `left` means the finger moved towards the start edge.
 */
export function horizontalSwipe(dx: number, dy: number, threshold = 60): 'left' | 'right' | null {
  if (Math.abs(dx) < threshold) return null;
  if (Math.abs(dx) < Math.abs(dy) * 1.4) return null;
  return dx < 0 ? 'left' : 'right';
}

export interface ListNeighbours {
  index: number;
  total: number;
  prev: string;
  next: string;
}

/** Position of `id` inside a saved list order, with its previous/next ids. */
export function listNeighbours(ids: string[] | null, id: string): ListNeighbours | null {
  if (!ids) return null;
  const index = ids.indexOf(id);
  if (index < 0) return null;
  return { index, total: ids.length, prev: ids[index - 1] ?? '', next: ids[index + 1] ?? '' };
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return todayStr(d);
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms = 250): T {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return ((...args: never[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}
