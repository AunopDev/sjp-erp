import { uid, ymd } from './util.js'

// ---------- formula (safe: only numbers and + - * / ( ) after substitution) ----------
const SAFE = /^[0-9+\-*/().\s]*$/
function calc(expr) {
  if (!SAFE.test(expr) || !expr.trim()) return NaN
  try {
    // eslint-disable-next-line no-new-func
    const v = Function('"use strict"; return (' + expr + ')')()
    return typeof v === 'number' && isFinite(v) ? v : NaN
  } catch (e) { return NaN }
}
const num = v => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? 0 : Number(v))

// {field}  → number; SUM({rows.colA*colB}) → sum over rows
export function evalFormula(expr, rec) {
  if (!expr) return NaN
  let e = expr.replace(/SUM\(\s*\{([\w]+)\.([^}]+)\}\s*\)/g, (_, rk, inner) => {
    const rows = Array.isArray(rec[rk]) ? rec[rk] : []
    let total = 0
    for (const r of rows) {
      const ex = inner.replace(/[A-Za-z_]\w*/g, id => '(' + num(r[id]) + ')')
      const v = calc(ex)
      total += isNaN(v) ? 0 : v
    }
    return '(' + total + ')'
  })
  e = e.replace(/\{(\w+)\}/g, (_, k) => '(' + num(rec[k]) + ')')
  return calc(e)
}
export function formulaText(f, rec) {
  const v = evalFormula(f.formula, rec)
  if (isNaN(v)) return ''
  return Math.round(v * 100) / 100
}

// ---------- templates ----------
const F = (key, label, type = 'text', x = {}) => ({ key, label, type, system: false, ...x })
const S = (key, label, color, x = {}) => ({ key, label, color, next: [], requiredFields: [], enabled: true, approverRole: '', approverUser: '', ...x })

export const TEMPLATES = [
  {
    id: 'blank', name: 'โมดูลเปล่า', desc: 'เริ่มจากฟิลด์ “ชื่อเรื่อง” แล้วเพิ่มฟิลด์ สถานะ และมุมมองเอง',
    module: { prefix: 'REC', titleField: 'title', cols: ['title'], filters: [], view: 'table' },
    fields: [F('title', 'ชื่อเรื่อง', 'text', { required: true }), F('note', 'รายละเอียด', 'textarea')],
    statuses: null
  },
  {
    id: 'pipeline', name: 'ติดตามโอกาสขาย (บอร์ดคัมบัง)', desc: 'ลูกค้าเป้าหมาย/โอกาสขาย ลากการ์ดเปลี่ยนสถานะ พร้อมสรุปมูลค่า',
    module: { prefix: 'LEAD', titleField: 'title', cols: ['title', 'customer', 'value', 'owner', 'closeDate'], filters: ['source'], view: 'kanban', groupField: 'status', summary: ['value'] },
    fields: [
      F('title', 'ชื่อโอกาส/งาน', 'text', { required: true }),
      F('customer', 'ลูกค้า', 'ref', { ref: 'customers' }),
      F('value', 'มูลค่าโดยประมาณ', 'number', { suffix: 'บาท' }),
      F('owner', 'ผู้รับผิดชอบ', 'ref', { ref: 'users', default: '@me' }),
      F('closeDate', 'คาดว่าจะปิดการขาย', 'date'),
      F('source', 'ช่องทางที่มา', 'select', { options: ['ลูกค้าเดิม', 'หน่วยงานภาครัฐ', 'แนะนำต่อ', 'เว็บไซต์', 'อื่นๆ'] }),
      F('note', 'บันทึก', 'textarea')
    ],
    statuses: [S('new', 'ติดต่อแล้ว', 'blue'), S('quote', 'ส่งใบเสนอราคา', 'indigo'), S('nego', 'ต่อรอง', 'amber'), S('won', 'ชนะ', 'green', { final: true }), S('lost', 'แพ้/ยกเลิก', 'red', { final: true })]
  },
  {
    id: 'request', name: 'ใบขอซื้อ/ขออนุมัติภายใน', desc: 'รายการหลายบรรทัด คำนวณยอดรวมอัตโนมัติ พร้อมสถานะอนุมัติ (ยังไม่ตั้งผู้อนุมัติ)',
    module: { prefix: 'REQ', titleField: 'title', cols: ['title', 'requester', 'project', 'total', 'needDate'], filters: [], view: 'table', summary: ['total'] },
    fields: [
      F('title', 'เรื่องที่ขอ', 'text', { required: true }),
      F('requester', 'ผู้ขอ', 'ref', { ref: 'users', default: '@me' }),
      F('project', 'โครงการ (ถ้ามี)', 'ref', { ref: 'projects' }),
      F('needDate', 'วันที่ต้องการ', 'date'),
      F('items', 'รายการ', 'rows', { cols: [{ key: 'name', label: 'รายการ', type: 'text' }, { key: 'qty', label: 'จำนวน', type: 'number' }, { key: 'price', label: 'ราคา/หน่วย', type: 'number' }] }),
      F('total', 'ยอดรวม', 'formula', { formula: 'SUM({items.qty*price})', suffix: 'บาท' }),
      F('reason', 'เหตุผล', 'textarea'),
      F('files', 'เอกสารแนบ', 'file')
    ],
    statuses: [S('draft', 'ร่าง', 'gray'), S('wait', 'รออนุมัติ', 'amber'), S('ok', 'อนุมัติแล้ว', 'green'), S('rej', 'ไม่อนุมัติ', 'red', { final: true }), S('done', 'ดำเนินการแล้ว', 'teal', { final: true })]
  },
  {
    id: 'asset', name: 'ทะเบียนทรัพย์สิน/เครื่องมือ', desc: 'รายการเครื่องมือ ผู้ถือครอง ที่ตั้ง และสถานะ',
    module: { prefix: 'AST', titleField: 'name', cols: ['name', 'assetNo', 'category', 'holder', 'site', 'cost'], filters: ['category'], view: 'table', summary: ['cost'] },
    fields: [
      F('name', 'ชื่อทรัพย์สิน', 'text', { required: true }),
      F('assetNo', 'เลขทะเบียนทรัพย์สิน', 'text', { unique: true }),
      F('category', 'ประเภท', 'select', { options: ['เครื่องมือช่าง', 'อุปกรณ์ทดสอบ', 'ยานพาหนะ', 'คอมพิวเตอร์/IT', 'อื่นๆ'] }),
      F('holder', 'ผู้ถือครอง', 'ref', { ref: 'users' }),
      F('site', 'ที่ตั้ง/ไซต์', 'ref', { ref: 'sites' }),
      F('buyDate', 'วันที่ซื้อ', 'date'),
      F('cost', 'มูลค่า', 'number', { suffix: 'บาท' }),
      F('photos', 'รูปภาพ', 'file'),
      F('note', 'หมายเหตุ', 'textarea')
    ],
    statuses: [S('use', 'ใช้งาน', 'green'), S('fix', 'ซ่อม', 'amber'), S('lost', 'สูญหาย', 'red'), S('retire', 'ปลดระวาง', 'gray', { final: true })]
  },
  {
    id: 'visit', name: 'บันทึกการเข้าไซต์', desc: 'ปฏิทินการเข้าไซต์ของช่าง พร้อมผลและเรื่องที่ต้องติดตาม',
    module: { prefix: 'VST', titleField: 'purpose', cols: ['date', 'site', 'tech', 'purpose', 'followUp'], filters: ['tech'], view: 'calendar', dateField: 'date' },
    fields: [
      F('date', 'วันที่เข้าไซต์', 'date', { required: true, default: '@today' }),
      F('site', 'ไซต์', 'ref', { ref: 'sites', required: true }),
      F('tech', 'ช่าง/ผู้เข้าไซต์', 'ref', { ref: 'users', default: '@me' }),
      F('purpose', 'วัตถุประสงค์', 'text', { required: true }),
      F('result', 'ผลการเข้าไซต์', 'textarea'),
      F('followUp', 'ต้องติดตามต่อ', 'boolean'),
      F('followNote', 'รายละเอียดที่ต้องติดตาม', 'textarea', { showIf: { field: 'followUp', value: true } }),
      F('photos', 'รูปถ่าย', 'file')
    ],
    statuses: null
  }
]

export function buildModule(tpl, name, group, prefix) {
  const slug = uid().replace(/-/g, '').slice(0, 6)
  const key = 'm_' + slug
  const module = {
    key, name, desc: tpl.desc, group: group || 'โมดูลของฉัน', active: true, view: 'table', groupField: '', dateField: '', summary: [],
    ...tpl.module, prefix: (prefix || tpl.module.prefix || 'REC').toUpperCase()
  }
  return {
    module, fields: structuredClone(tpl.fields),
    workflow: tpl.statuses ? { confirmed: true, statuses: structuredClone(tpl.statuses) } : null
  }
}

export const defaultFor = (f, user) => {
  if (f.default === undefined || f.default === '') return undefined
  if (f.default === '@today') return ymd(new Date())
  if (f.default === '@me') return user?.id
  if (f.type === 'number') return Number(f.default)
  if (f.type === 'boolean') return f.default === true || f.default === 'true'
  return f.default
}
