// Level 1 — Parts (field types) and level 2 — Components (reusable groups of parts).
// Both are plain data; every definition carries formatVersion.
import { evalFormula } from '../lib/modules.js'
import { FORMAT_VERSION, isBlank, round2, tr } from './util.js'

const P = (key, th, en, x = {}) => [key, { formatVersion: FORMAT_VERSION, key, label: { th, en }, ...x }]

export const PARTS = Object.fromEntries([
  P('text', 'ข้อความสั้น', 'Text', { icon: 'Aa' }),
  P('textarea', 'ข้อความยาว', 'Long text', { icon: '¶' }),
  P('number', 'ตัวเลข', 'Number', { icon: '#' }),
  P('money', 'จำนวนเงิน', 'Money', { icon: '฿' }),
  P('date', 'วันที่', 'Date', { icon: '◷' }),
  P('select', 'ตัวเลือก', 'Choice', { icon: '▾' }),
  P('boolean', 'ใช่/ไม่ใช่', 'Yes / No', { icon: '☑' }),
  P('ref', 'ลิงก์ไปเอกสารอื่น', 'Link to document', { icon: '↗' }),
  P('file', 'ไฟล์แนบ', 'Attachment', { icon: '⎘' }),
  P('formula', 'สูตรคำนวณ', 'Formula', { icon: 'ƒ' }),
  P('rows', 'ตารางรายการ', 'Line table', { icon: '▦' })
])

export const isPart = t => Object.prototype.hasOwnProperty.call(PARTS, t)

// options may be ["a","b"] or [{value,label}] → always [{value,label}]
export const optionsOf = f => (f.options || []).map(o => (typeof o === 'object' ? { value: o.value, label: o.label ?? o.value } : { value: o, label: o }))

const DATE = /^\d{4}-\d{2}-\d{2}$/
const isDate = v => DATE.test(v) && !isNaN(new Date(v + 'T00:00:00Z'))

// Cleans one raw value to the part's storage type. Returns undefined for "empty".
export function coerce(f, v) {
  if (isBlank(v)) return undefined
  switch (f.type) {
    case 'number': return typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
    case 'money': return round2(typeof v === 'number' ? v : Number(String(v).replace(/,/g, '')))
    case 'boolean': return v === true || v === 'true' || v === 1 || v === '1'
    case 'rows': return Array.isArray(v) ? v.map(r => coerceRow(f, r)).filter(r => Object.keys(r).length) : v
    case 'file': return Array.isArray(v) ? v : [v]
    case 'text': case 'textarea': case 'date': case 'select': case 'ref': return typeof v === 'string' ? v.trim() : v
    default: return v
  }
}
function coerceRow(f, r) {
  const out = {}
  for (const c of f.columns || []) {
    if (c.type === 'formula') continue
    const v = coerce(c, r?.[c.key])
    if (v !== undefined) out[c.key] = v
  }
  for (const c of f.columns || []) if (c.type === 'formula') {
    const x = evalFormula(c.formula, out)
    if (!isNaN(x)) out[c.key] = round2(x)
  }
  return out
}

// Type-level validation of a (coerced) value. Returns message or ''.
export function checkValue(f, v, lang = 'th') {
  if (v === undefined) return ''
  const name = tr(f.label, lang) || f.key
  switch (f.type) {
    case 'number': case 'money':
      if (typeof v !== 'number' || !isFinite(v)) return lang === 'en' ? `"${name}" must be a number` : `"${name}" ต้องเป็นตัวเลข`
      if (f.min !== undefined && v < f.min) return lang === 'en' ? `"${name}" must be at least ${f.min}` : `"${name}" ต้องไม่น้อยกว่า ${f.min}`
      if (f.max !== undefined && v > f.max) return lang === 'en' ? `"${name}" must be at most ${f.max}` : `"${name}" ต้องไม่เกิน ${f.max}`
      if (f.type === 'money' && v < 0 && !f.allowNegative) return lang === 'en' ? `"${name}" must not be negative` : `"${name}" ต้องไม่ติดลบ`
      return ''
    case 'date': return isDate(v) ? '' : (lang === 'en' ? `"${name}" is not a valid date (YYYY-MM-DD)` : `"${name}" ไม่ใช่วันที่ที่ถูกต้อง (ปปปป-ดด-วว)`)
    case 'select': return optionsOf(f).some(o => o.value === v) ? '' : (lang === 'en' ? `"${name}" has an invalid choice` : `"${name}" เลือกค่าที่ไม่อยู่ในรายการ`)
    case 'boolean': return typeof v === 'boolean' ? '' : (lang === 'en' ? `"${name}" must be yes/no` : `"${name}" ต้องเป็นใช่/ไม่ใช่`)
    case 'text': case 'textarea':
      if (typeof v !== 'string') return lang === 'en' ? `"${name}" must be text` : `"${name}" ต้องเป็นข้อความ`
      if (f.maxLength && v.length > f.maxLength) return lang === 'en' ? `"${name}" is longer than ${f.maxLength} characters` : `"${name}" ยาวเกิน ${f.maxLength} ตัวอักษร`
      return ''
    case 'rows': {
      if (!Array.isArray(v)) return lang === 'en' ? `"${name}" must be a list` : `"${name}" ต้องเป็นรายการ`
      for (let i = 0; i < v.length; i++) for (const c of f.columns || []) {
        if (c.required && isBlank(v[i][c.key])) return lang === 'en' ? `"${name}" row ${i + 1}: "${tr(c.label, lang)}" is required` : `"${name}" แถวที่ ${i + 1}: กรุณากรอก "${tr(c.label, lang)}"`
        const e = c.type === 'ref' ? '' : checkValue(c, v[i][c.key], lang)
        if (e) return `${name} #${i + 1}: ${e}`
      }
      return ''
    }
    default: return ''
  }
}

export function defaultValue(f, user) {
  const d = f.default
  if (d === undefined || d === '') return undefined
  if (d === '@today') return new Date().toISOString().slice(0, 10)
  if (d === '@me') return user?.id
  return coerce(f, d)
}

export function computeFormulas(fields, rec) {
  for (const f of fields) if (f.type === 'formula') {
    const x = evalFormula(f.formula, rec)
    rec[f.key] = isNaN(x) ? 0 : round2(x)
  }
  return rec
}

// ---------- components ----------
// layout "block": its fields are copied into the entity as <key>_<field> and shown as a section
// layout "rows":  becomes one line-table part whose columns are the component's fields
const C = (key, th, en, layout, fields) => [key, { formatVersion: FORMAT_VERSION, key, label: { th, en }, layout, fields }]
const f = (key, th, en, type = 'text', x = {}) => ({ key, type, label: { th, en }, ...x })

export const COMPONENTS = Object.fromEntries([
  C('address', 'บล็อกที่อยู่', 'Address block', 'block', [
    f('line1', 'ที่อยู่', 'Address'), f('subdistrict', 'ตำบล/แขวง', 'Sub-district'), f('district', 'อำเภอ/เขต', 'District'),
    f('province', 'จังหวัด', 'Province'), f('postcode', 'รหัสไปรษณีย์', 'Postcode', 'text', { maxLength: 10 })
  ]),
  C('approvalBlock', 'บล็อกอนุมัติ', 'Approval block', 'block', [
    f('approvedBy', 'ผู้อนุมัติ', 'Approved by', 'text', { readOnly: true }), f('approvedAt', 'วันที่อนุมัติ', 'Approved on', 'date', { readOnly: true }),
    f('approvalNote', 'หมายเหตุการอนุมัติ', 'Approval note', 'textarea', { readOnly: true })
  ]),
  C('lineItems', 'ตารางรายการสินค้า', 'Line items', 'rows', [
    f('description', 'รายการ', 'Description', 'text'), f('qty', 'จำนวน', 'Qty', 'number', { required: true, min: 0 }),
    f('unitPrice', 'ราคา/หน่วย', 'Unit price', 'money'), f('amount', 'จำนวนเงิน', 'Amount', 'formula', { formula: '{qty}*{unitPrice}' })
  ])
])

// Expands { component, key, ... } entries of an entity into plain parts.
export function expandFields(fields, lookup = {}) {
  const out = []
  for (const fd of fields || []) {
    if (!fd.component) { out.push(fd); continue }
    const comp = lookup[fd.component] || COMPONENTS[fd.component]
    if (!comp) { out.push({ ...fd, type: 'text', _missingComponent: fd.component }); continue }
    if (comp.layout === 'rows') {
      const columns = (fd.columns || comp.fields).map(c => ({ ...c }))
      out.push({ key: fd.key, type: 'rows', label: fd.label || comp.label, required: fd.required, columns, component: comp.key })
    } else {
      for (const cf of comp.fields) {
        out.push({ ...cf, key: `${fd.key}_${cf.key}`, group: { key: fd.key, label: fd.label || comp.label }, component: comp.key, ...(fd.overrides?.[cf.key] || {}) })
      }
    }
  }
  return out
}
