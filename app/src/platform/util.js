// Small helpers shared by the metadata-driven platform (pure JS, runs in the browser and in node tests)
import { uid, nowIso } from '../lib/util.js'

export { uid, nowIso }
export const FORMAT_VERSION = 1

export class PlatformError extends Error {
  constructor(code, message, details = {}, status = 400) {
    super(message)
    this.name = 'PlatformError'
    this.code = code
    this.details = details
    this.status = status
  }
}
export const fail = (code, message, details, status) => { throw new PlatformError(code, message, details, status) }

// label = "text" | { th, en }
export function tr(label, lang = 'th') {
  if (label === null || label === undefined) return ''
  if (typeof label !== 'object') return String(label)
  return label[lang] || label.th || label.en || Object.values(label)[0] || ''
}

// ---------- versions ----------
export function parseVer(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v || '').trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}
export function cmpVer(a, b) {
  const x = parseVer(a), y = parseVer(b)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1
  return 0
}
// range: "*", "1.2.3", ">=1.0.0", "^1.2.0", "~1.2.0", or several joined by spaces (AND)
export function satisfies(version, range) {
  const r = String(range || '*').trim()
  if (!r || r === '*') return true
  return r.split(/\s+/).every(part => {
    const m = /^(>=|<=|>|<|=|\^|~)?(\d+\.\d+\.\d+)$/.exec(part)
    if (!m) return false
    const op = m[1] || '=', base = m[2], c = cmpVer(version, base), b = parseVer(base), v = parseVer(version)
    switch (op) {
      case '>=': return c >= 0
      case '>': return c > 0
      case '<=': return c <= 0
      case '<': return c < 0
      case '=': return c === 0
      case '^': return c >= 0 && v[0] === b[0]
      case '~': return c >= 0 && v[0] === b[0] && v[1] === b[1]
      default: return false
    }
  })
}

// ---------- paths & expressions ----------
export function getPath(obj, path) {
  let cur = obj
  for (const k of String(path).split('.')) {
    if (cur === null || cur === undefined) return undefined
    cur = cur[k]
  }
  return cur
}
// "$record.code" → value from scope; anything else is a literal
export function resolveExpr(expr, scope) {
  if (typeof expr !== 'string' || expr[0] !== '$') return expr
  if (expr === '$now') return nowIso()
  if (expr === '$today') return nowIso().slice(0, 10)
  return getPath(scope, expr.slice(1))
}

export const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100
export const isBlank = v => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
export const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)))
export const sameVal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export function checksum(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(16).padStart(8, '0')
}
export const fmtMoney = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
