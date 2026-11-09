export const uid = () =>
  (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36))

export const nowIso = () => new Date().toISOString()

export function hashPw(pw) {
  let h = 2166136261
  const str = 'sjp|' + pw
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}

export const isEmpty = v =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

export function fmtDate(v) {
  if (!v) return '–'
  const d = new Date(v)
  if (isNaN(d)) return String(v)
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}
export function fmtDateTime(v) {
  if (!v) return '–'
  const d = new Date(v)
  if (isNaN(d)) return String(v)
  return d.toLocaleString('th-TH', { year: '2-digit', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
export const fmtNum = v => (v === undefined || v === null || v === '' ? '–' : Number(v).toLocaleString('th-TH'))

export const hoursBetween = (a, b = new Date()) => (new Date(b) - new Date(a)) / 3600000
export function fmtDuration(h) {
  if (h === null || h === undefined || isNaN(h)) return '–'
  if (h < 1) return Math.max(1, Math.round(h * 60)) + ' นาที'
  if (h < 48) return h.toFixed(1).replace(/\.0$/, '') + ' ชม.'
  return Math.floor(h / 24) + ' วัน ' + Math.round(h % 24) + ' ชม.'
}

export const toLocalInput = iso => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
export const todayStr = () => new Date().toISOString().slice(0, 10)
export const addDays = (d, n) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
export const ymd = d => {
  const x = new Date(d)
  const p = n => String(n).padStart(2, '0')
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`
}

function csvCell(v) {
  if (v === undefined || v === null) return ''
  let t = Array.isArray(v) || typeof v === 'object' ? JSON.stringify(v) : String(v)
  if (/^[=+\-@]/.test(t)) t = "'" + t
  return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t
}
export function toCsv(headers, rows) {
  return '﻿' + [headers.join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\r\n')
}
export function downloadFile(name, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(a.href)
    a.remove()
  }, 500)
}
export function parseCsv(text) {
  text = text.replace(/^﻿/, '')
  const rows = []
  let row = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else if (c !== '\r') cur += c
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows.filter(r => r.some(x => x !== ''))
}

export function fmtAgo(v) {
  const m = (Date.now() - new Date(v).getTime()) / 60000
  if (isNaN(m)) return '–'
  if (m < 1) return 'เมื่อสักครู่'
  if (m < 60) return Math.floor(m) + ' นาทีที่แล้ว'
  if (m < 1440) return Math.floor(m / 60) + ' ชั่วโมงที่แล้ว'
  if (m < 43200) return Math.floor(m / 1440) + ' วันที่แล้ว'
  return fmtDate(v)
}
