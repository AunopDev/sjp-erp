// Module Builder (no-code): creates modules and entities from a plain definition. The result is installed at once,
// so the new entity immediately has a form, a list page and an API — they are all generated from the definition.
import { validateManifest } from './manifest.js'
import { isPart } from './parts.js'
import { installManifest, applyUpgrade } from './lifecycle.js'
import { installedOf, open, requireAdmin } from './core.js'
import { FORMAT_VERSION, clone, cmpVer, fail, parseVer, tr } from './util.js'

const ALL = ['view', 'create', 'edit', 'delete']
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

export function createCustomModule(P, ctx, { title, name, description = '' }) {
  open(P, ctx); requireAdmin(P, ctx)
  const t = typeof title === 'string' ? { th: title.trim(), en: title.trim() } : title
  if (!tr(t)) fail('VALIDATION', 'กรุณาตั้งชื่อโมดูล', {}, 422)
  let nm = slug(name) || `x_${Math.random().toString(36).slice(2, 8)}`
  if (!/^[a-z]/.test(nm)) nm = 'x_' + nm
  if (installedOf(P, ctx.company)[nm]) fail('CONFLICT', `มีโมดูลชื่อ “${nm}” อยู่แล้ว`, {}, 409)
  const manifest = {
    formatVersion: FORMAT_VERSION, name: nm, version: '1.0.0', title: t, description, builder: true, dependsOn: [],
    entities: [], roles: [{ key: 'user', label: { th: 'ผู้ใช้โมดูล', en: 'Module user' }, perms: {} }], menu: [], reports: [], subscriptions: [], migrations: []
  }
  installManifest(P, ctx, manifest)
  return nm
}

function normalizeEntity(def) {
  const e = clone(def)
  e.formatVersion = FORMAT_VERSION
  e.key = e.key || slug(tr(e.label, 'en')) || 'doc'
  if (!/^[a-z]/.test(e.key)) e.key = 'x' + e.key
  e.prefix = String(e.prefix || e.key.slice(0, 3)).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'DOC'
  if (!/^[A-Z]/.test(e.prefix)) e.prefix = 'D' + e.prefix
  const seen = new Set()
  e.fields = (e.fields || []).map((f, i) => {
    const g = { ...f }
    if (!g.key) g.key = (slug(tr(g.label, 'en')) || `field${i + 1}`).replace(/^(\d)/, 'f$1')
    g.key = g.key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()).replace(/^[A-Z]/, c => c.toLowerCase())
    while (seen.has(g.key)) g.key += 'x'
    seen.add(g.key)
    if (typeof g.label === 'string') g.label = { th: g.label, en: g.label }
    if (g.type === 'select') g.options = (g.options || []).map(o => (typeof o === 'string' ? { value: o, label: { th: o, en: o } } : o))
    return g
  })
  return e
}

// Saves (creates or changes) one entity of a builder module, bumps the module version and migrates existing data.
export function saveEntity(P, ctx, moduleName, def) {
  open(P, ctx); requireAdmin(P, ctx)
  const rec = installedOf(P, ctx.company)[moduleName]
  if (!rec) fail('NOT_FOUND', `ไม่พบโมดูล “${moduleName}”`, {}, 404)
  if (!rec.manifest.builder) fail('FORBIDDEN', 'แก้ไขได้เฉพาะโมดูลที่สร้างจาก Module Builder (โมดูลสำเร็จรูปให้อัปเวอร์ชันผ่านแพ็กเกจ)', {}, 403)
  const ent = normalizeEntity(def)
  if (!tr(ent.label)) fail('VALIDATION', 'กรุณาตั้งชื่อเอกสาร', {}, 422)
  if (!ent.fields.length) fail('VALIDATION', 'เอกสารต้องมีอย่างน้อย 1 ฟิลด์', {}, 422)
  for (const f of ent.fields) if (!f.component && !isPart(f.type)) fail('VALIDATION', `ฟิลด์ “${f.key}” ใช้ชนิดที่ไม่รองรับ`, {}, 422)

  const next = clone(rec.manifest)
  const old = next.entities.find(e => e.key === ent.key)
  let bump = 'minor'
  const steps = []
  if (old) {
    const had = new Map(old.fields.map(f => [f.key, f]))
    const has = new Set(ent.fields.map(f => f.key))
    bump = 'patch'
    for (const f of ent.fields) {
      const o = had.get(f.key)
      if (!o) { bump = 'minor'; steps.push({ op: 'addField', entity: ent.key, field: f }) }
      else if (o.type !== f.type) fail('VALIDATION', `ไม่อนุญาตให้เปลี่ยนชนิดฟิลด์ “${tr(f.label)}” จาก ${o.type} เป็น ${f.type} เพราะอาจทำให้ข้อมูลเดิมเสียหาย — ให้เพิ่มฟิลด์ใหม่แทน`, {}, 422)
    }
    for (const k of had.keys()) if (!has.has(k)) { bump = 'minor'; steps.push({ op: 'removeField', entity: ent.key, field: k }) }
    next.entities[next.entities.indexOf(old)] = ent
  } else next.entities.push(ent)

  // everyone holding the module's "user" role may use every entity of the module
  const role = next.roles.find(r => r.key === 'user')
  if (role) role.perms[ent.key] = ALL
  // a step that needs approval gets a ready-made "approver" role (can see the document and press the approve button)
  const needsApprover = (ent.workflow?.transitions || []).some(t => (t.approvers?.roles || []).includes('approver'))
  let approver = next.roles.find(r => r.key === 'approver')
  if (needsApprover && !approver) next.roles.push(approver = { key: 'approver', label: { th: 'ผู้อนุมัติ', en: 'Approver' }, perms: {} })
  if (approver) approver.perms[ent.key] = ['view']
  if (!next.menu.some(m => m.kind === 'entity' && m.target === ent.key)) next.menu.push({ kind: 'entity', target: ent.key })

  const [a, b, c] = parseVer(rec.version)
  next.version = bump === 'minor' ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`
  next.migrations = [...(next.migrations || []), { from: rec.version, to: next.version, steps }]
  const errs = validateManifest(next, { lookup: n => installedOf(P, ctx.company)[n]?.manifest || null })
  if (errs.length) fail('INVALID_MODULE', `ไม่สามารถบันทึกเอกสารได้:\n- ${errs.join('\n- ')}`, { errors: errs }, 422)
  if (cmpVer(next.version, rec.version) <= 0) fail('INVALID_MODULE', 'เลขเวอร์ชันไม่เพิ่มขึ้น', {}, 500)
  const r = applyUpgrade(P, ctx, next)
  return { module: moduleName, entity: `${moduleName}.${ent.key}`, version: r.to, migrated: r.migrated }
}

export function removeEntity(P, ctx, moduleName, entityKey) {
  open(P, ctx); requireAdmin(P, ctx)
  const rec = installedOf(P, ctx.company)[moduleName]
  if (!rec?.manifest.builder) fail('FORBIDDEN', 'ลบได้เฉพาะเอกสารในโมดูลที่สร้างจาก Module Builder', {}, 403)
  const next = clone(rec.manifest)
  next.entities = next.entities.filter(e => e.key !== entityKey)
  next.menu = next.menu.filter(m => m.target !== entityKey)
  delete next.roles[0]?.perms?.[entityKey]
  const [a, b] = parseVer(rec.version)
  next.version = `${a}.${b + 1}.0`
  next.migrations = [...(next.migrations || []), { from: rec.version, to: next.version, steps: [] }]
  return applyUpgrade(P, ctx, next)
}
