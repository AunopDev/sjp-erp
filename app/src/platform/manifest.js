// Validates module definition files and explains problems in plain Thai.
import { FORMAT_VERSION, parseVer, tr } from './util.js'
import { isPart, PARTS, COMPONENTS } from './parts.js'

export const ACTIONS = ['view', 'create', 'edit', 'delete']
export const RULE_TYPES = ['balanced', 'minRows', 'compare', 'maxByReport']
export const REPORT_TYPES = ['sum', 'rowsSum']
const KEY = /^[a-z][A-Za-z0-9_]*$/
const NAME = /^[a-z][a-z0-9_]*$/

// lookup(name) → manifest of an installed dependency (optional, makes cross-module refs verifiable)
export function validateManifest(m, { lookup = () => null } = {}) {
  const errs = []
  const e = msg => errs.push(msg)
  if (!m || typeof m !== 'object' || Array.isArray(m)) return ['ไฟล์คำนิยามโมดูลต้องเป็นออบเจ็กต์ JSON']
  if (m.formatVersion === undefined) e('ไม่มี formatVersion (เลขเวอร์ชันของรูปแบบไฟล์) ในคำนิยามโมดูล')
  else if (!Number.isInteger(m.formatVersion) || m.formatVersion < 1) e('formatVersion ต้องเป็นจำนวนเต็มตั้งแต่ 1')
  else if (m.formatVersion > FORMAT_VERSION) e(`คำนิยามนี้ใช้รูปแบบไฟล์เวอร์ชัน ${m.formatVersion} ซึ่งใหม่กว่าที่ระบบรองรับ (รองรับถึงเวอร์ชัน ${FORMAT_VERSION}) — กรุณาอัปเดตระบบก่อน`)
  if (!NAME.test(m.name || '')) e('ชื่อโมดูล (name) ต้องเป็นตัวพิมพ์เล็กภาษาอังกฤษ/ตัวเลข/ขีดล่าง และขึ้นต้นด้วยตัวอักษร')
  if (!parseVer(m.version)) e(`เลขเวอร์ชันของโมดูล "${m.version ?? ''}" ไม่ถูกต้อง ต้องอยู่ในรูป 1.0.0`)
  if (!m.title) e('ต้องมีชื่อโมดูล (title) อย่างน้อยเป็นภาษาไทย')
  const deps = m.dependsOn || []
  if (!Array.isArray(deps)) e('dependsOn ต้องเป็นรายการ')
  const depNames = new Set()
  for (const d of Array.isArray(deps) ? deps : []) {
    if (!d || !NAME.test(d.name || '')) { e('รายการ dependsOn มีชื่อโมดูลที่ไม่ถูกต้อง'); continue }
    if (d.name === m.name) e('โมดูลไม่สามารถพึ่งพาตัวเองได้')
    depNames.add(d.name)
  }

  const comps = new Map()
  for (const c of m.components || []) {
    if (!KEY.test(c.key || '')) { e(`component "${c.key}" มี key ไม่ถูกต้อง`); continue }
    if (c.formatVersion === undefined) e(`component "${c.key}" ไม่มี formatVersion`)
    comps.set(c.key, c)
  }
  const keys = new Set()
  const entities = m.entities || []
  if (!Array.isArray(entities)) e('entities ต้องเป็นรายการ')
  const allEntityKeys = new Set(entities.map(x => x?.key))
  for (const en of Array.isArray(entities) ? entities : []) {
    const at = `เอกสาร "${en?.key}"`
    if (!KEY.test(en?.key || '')) { e(`${at}: key ไม่ถูกต้อง (ใช้ภาษาอังกฤษ/ตัวเลข/ขีดล่าง ขึ้นต้นด้วยตัวอักษรพิมพ์เล็ก)`); continue }
    if (keys.has(en.key)) e(`${at}: key ซ้ำ`)
    keys.add(en.key)
    if (en.formatVersion === undefined) e(`${at}: ไม่มี formatVersion`)
    else if (en.formatVersion > FORMAT_VERSION) e(`${at}: ใช้รูปแบบไฟล์เวอร์ชัน ${en.formatVersion} ที่ระบบยังไม่รองรับ`)
    if (!en.label) e(`${at}: ต้องมีชื่อ (label)`)
    if (!/^[A-Z][A-Z0-9]{0,7}$/.test(en.prefix || '')) e(`${at}: prefix เลขที่เอกสารต้องเป็นตัวพิมพ์ใหญ่ 1–8 ตัว`)
    const fkeys = new Set()
    for (const f of en.fields || []) {
      if (f.component) {
        if (!comps.has(f.component) && !COMPONENTS[f.component]) e(`${at}: ใช้ component "${f.component}" ที่ไม่มีอยู่`)
        if (!KEY.test(f.key || '')) e(`${at}: component "${f.component}" ต้องมี key`)
        fkeys.add(f.key)
        continue
      }
      if (!KEY.test(f.key || '')) { e(`${at}: ฟิลด์ "${f.key}" มี key ไม่ถูกต้อง`); continue }
      if (fkeys.has(f.key)) e(`${at}: ฟิลด์ "${f.key}" ซ้ำ`)
      fkeys.add(f.key)
      if (!isPart(f.type)) { e(`${at}: ฟิลด์ "${f.key}" ใช้ชนิด "${f.type}" ที่ไม่มีในระบบ (ชนิดที่รองรับ: ${Object.keys(PARTS).join(', ')})`); continue }
      if (!f.label) e(`${at}: ฟิลด์ "${f.key}" ต้องมีชื่อ (label)`)
      if (f.type === 'select' && !(f.options || []).length) e(`${at}: ฟิลด์ตัวเลือก "${f.key}" ต้องมีตัวเลือกอย่างน้อย 1 ค่า`)
      if (f.type === 'formula' && !f.formula) e(`${at}: ฟิลด์สูตร "${f.key}" ต้องมีสูตร`)
      if (f.type === 'rows' && !(f.columns || []).length) e(`${at}: ตารางรายการ "${f.key}" ต้องมีคอลัมน์`)
      const refs = f.type === 'rows' ? (f.columns || []).filter(c => c.type === 'ref') : f.type === 'ref' ? [f] : []
      for (const r of refs) checkRef(r.ref, `${at}: ฟิลด์ "${f.key}"`)
    }
    if (en.titleField && !fkeys.has(en.titleField) && !(en.fields || []).some(f => f.component)) e(`${at}: titleField "${en.titleField}" ไม่ใช่ฟิลด์ของเอกสาร`)
    const wf = en.workflow
    if (wf) {
      const st = new Set((wf.states || []).map(s => s.key))
      if (!st.size) e(`${at}: workflow ต้องมีสถานะอย่างน้อย 1 สถานะ`)
      if (!st.has(wf.initial)) e(`${at}: workflow initial "${wf.initial}" ไม่อยู่ในรายการสถานะ`)
      for (const t of wf.transitions || []) {
        if (!KEY.test(t.key || '')) e(`${at}: transition "${t.key}" มี key ไม่ถูกต้อง`)
        for (const x of t.from || []) if (!st.has(x)) e(`${at}: transition "${t.key}" ออกจากสถานะ "${x}" ที่ไม่มี`)
        if (!st.has(t.to)) e(`${at}: transition "${t.key}" ไปสถานะ "${t.to}" ที่ไม่มี`)
        for (const ev of [].concat(t.emits || [])) if (!String(ev).startsWith(m.name + '.')) e(`${at}: เหตุการณ์ "${ev}" ต้องขึ้นต้นด้วยชื่อโมดูล "${m.name}."`)
      }
    }
    for (const r of en.rules || []) if (!RULE_TYPES.includes(r.type)) e(`${at}: กฎชนิด "${r.type}" ไม่มีในระบบ (รองรับ: ${RULE_TYPES.join(', ')})`)
  }
  function checkRef(ref, at) {
    if (!ref) { e(`${at} ต้องระบุเอกสารปลายทาง (ref)`); return }
    if (!ref.includes('.')) { if (!allEntityKeys.has(ref)) e(`${at} ลิงก์ไปเอกสาร "${ref}" ที่ไม่มีในโมดูลนี้`); return }
    const [mod, ent] = ref.split('.')
    if (mod === m.name) { if (!allEntityKeys.has(ent)) e(`${at} ลิงก์ไปเอกสาร "${ref}" ที่ไม่มี`); return }
    if (!depNames.has(mod)) { e(`${at} ลิงก์ไปเอกสารของโมดูล "${mod}" แต่ไม่ได้ประกาศไว้ใน dependsOn`); return }
    const dep = lookup(mod)
    if (dep && !(dep.entities || []).some(x => x.key === ent)) e(`${at} ลิงก์ไปเอกสาร "${ref}" ซึ่งไม่มีในโมดูล ${mod} เวอร์ชัน ${dep.version}`)
  }

  const roleKeys = new Set()
  for (const r of m.roles || []) {
    if (!KEY.test(r.key || '')) { e(`บทบาท "${r.key}" มี key ไม่ถูกต้อง`); continue }
    roleKeys.add(r.key)
    for (const [ent, acts] of Object.entries(r.perms || {})) {
      const local = !ent.includes('.')
      if (local && !allEntityKeys.has(ent)) e(`บทบาท "${r.key}" กำหนดสิทธิ์ให้เอกสาร "${ent}" ที่ไม่มี`)
      if (!local && !depNames.has(ent.split('.')[0]) && ent.split('.')[0] !== m.name) e(`บทบาท "${r.key}" กำหนดสิทธิ์ให้เอกสารของโมดูล "${ent.split('.')[0]}" ที่ไม่ได้อยู่ใน dependsOn`)
      for (const a of acts) if (!ACTIONS.includes(a)) e(`บทบาท "${r.key}" ใช้สิทธิ์ "${a}" ที่ไม่มีในระบบ (${ACTIONS.join(', ')})`)
    }
  }
  for (const en of entities) for (const t of en?.workflow?.transitions || []) {
    for (const r of t.approvers?.roles || []) {
      const [mod, key] = r.includes('.') ? r.split('.') : [m.name, r]
      if (mod === m.name && !roleKeys.has(key)) e(`transition "${t.key}" ของ "${en.key}" ระบุผู้อนุมัติเป็นบทบาท "${r}" ที่ไม่ได้ประกาศ`)
    }
  }
  for (const r of m.reports || []) {
    if (!KEY.test(r.key || '')) e(`รายงาน "${r.key}" มี key ไม่ถูกต้อง`)
    if (!REPORT_TYPES.includes(r.type)) e(`รายงาน "${r.key}" ใช้ชนิด "${r.type}" ที่ไม่มีในระบบ`)
  }
  for (const it of m.menu || []) {
    if (it.kind !== 'entity' && it.kind !== 'report') e(`รายการเมนู "${tr(it.label) || it.target}" ต้องมี kind เป็น entity หรือ report`)
    if (it.kind === 'entity' && !allEntityKeys.has(it.target)) e(`เมนู "${tr(it.label)}" ชี้ไปเอกสาร "${it.target}" ที่ไม่มี`)
    if (it.kind === 'report' && !(m.reports || []).some(r => r.key === it.target)) e(`เมนู "${tr(it.label)}" ชี้ไปรายงาน "${it.target}" ที่ไม่มี`)
  }
  for (const s of m.subscriptions || []) {
    if (!s.event || !s.action?.type) e('การรับเหตุการณ์ (subscriptions) ต้องมี event และ action.type')
  }
  for (const mg of m.migrations || []) {
    if (!parseVer(mg.from) || !parseVer(mg.to)) e('migration ต้องมี from/to เป็นเลขเวอร์ชัน เช่น 1.0.0')
  }
  return errs
}
