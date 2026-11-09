const DEFAULT_TIMEZONE = 'Asia/Bangkok';

export const nowIso = (): string => new Date().toISOString();

/** Date-only string (YYYY-MM-DD) in the configured business timezone. */
export function todayStr(timeZone = process.env.APP_TIMEZONE || DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const isDateOnly = (value: unknown): value is string => {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Add calendar months without the Jan-31 → Mar-3 overflow bug: 31 Jan + 1m = 28/29 Feb. */
export function addMonthsClamped(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function nextDue(date: string, frequency: string): string {
  switch (frequency) {
    case 'รายวัน':
      return addDays(date, 1);
    case 'รายสัปดาห์':
      return addDays(date, 7);
    case 'รายเดือน':
      return addMonthsClamped(date, 1);
    case 'รายไตรมาส':
      return addMonthsClamped(date, 3);
    default:
      return addDays(date, 1);
  }
}

export function diffDays(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00.000Z`).getTime() - new Date(`${a}T00:00:00.000Z`).getTime()) / 86400000);
}

const TH_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
const TH_DATETIME: Intl.DateTimeFormatOptions = { ...TH_DATE, hour: '2-digit', minute: '2-digit' };

export function fmtThaiDate(value: unknown, timeZone = process.env.APP_TIMEZONE || DEFAULT_TIMEZONE): string {
  if (!value) return '–';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('th-TH', { ...TH_DATE, timeZone }).format(date);
}

export function fmtThaiDateTime(value: unknown, timeZone = process.env.APP_TIMEZONE || DEFAULT_TIMEZONE): string {
  if (!value) return '–';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('th-TH', { ...TH_DATETIME, timeZone }).format(date);
}
