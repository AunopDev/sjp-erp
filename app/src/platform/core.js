// Core shared by the platform kernel files: state shape, company/member helpers, registry, permissions, audit.
// State lives in one plain JSON object (P) so it can be persisted, cloned and tested without a browser.
// Every function takes (P, ctx, ...) where ctx = { company, user:{id,name}, isSuper?, lang? }.
import { satisfies, FORMAT_VERSION, PlatformError, clone, fail, nowIso, sameVal, tr, uid } from './util.js'
import { expandFields } from './parts.js'

export { FORMAT_VERSION, PlatformError }

// ============================================================ state
export function newPlatform() {
  return { formatVersion: FORMAT_VERSION, companies: [], members: [], library: {}, installed: {}, archive: {}, data: {}, counters: {}, audit: [], events: [] }
}
export const installedOf = (P, cid) => (P.installed[cid] = P.installed[cid] || {})
export const bucket = (P, cid, entityId) => {
  const d = (P.data[cid] = P.data[cid] || {})
  return (d[entityId] = d[entityId] || [])
}
export const systemCtx = (cid, who = 'ระบบ', depth = 0) => ({ company: cid, system: true, user: { id: 'system', name: who }, _depth: depth })

// ============================================================ companies & members
export function createCompany(P, ctx, name) {
  if (!ctx.user) fail('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', {}, 401)
  if (!ctx.isSuper) fail('FORBIDDEN', 'เฉพาะผู้ดูแลระบบเท่านั้นที่เพิ่มบริษัทได้', {}, 403)
  if (!String(name || '').trim()) fail('VALIDATION', 'กรุณากรอกชื่อบริษัท', {}, 422)
  const c = { id: 'co-' + uid().slice(0, 8), name: String(name).trim(), createdAt: nowIso() }
  P.companies.push(c)
  P.members.push({ company: c.id, user: ctx.user.id, name: ctx.user.name, roles: ['admin'] })
  writeAudit(P, { ...ctx, company: c.id }, { action: 'company', entity: 'platform.company', rec: c, summary: { th: `สร้างบริษัท ${c.name}`, en: `Created company ${c.name}` } })
  return c
}
export function companiesFor(P, ctx) {
  return P.companies.filter(c => ctx.isSuper || P.members.some(m => m.company === c.id && m.user === ctx.user?.id))
}
export const userRoles = (P, ctx) => P.members.find(x => x.company === ctx.company && x.user === ctx.user?.id)?.roles || []
export const isAdmin = (P, ctx) => !!(ctx.system || ctx.isSuper || userRoles(P, ctx).includes('admin'))
export function requireAdmin(P, ctx) {
  if (!isAdmin(P, ctx)) fail('FORBIDDEN', 'เฉพาะผู้ดูแลระบบของบริษัทเท่านั้นที่จัดการโมดูลได้', {}, 403)
}
export function setMemberRoles(P, ctx, userId, roles, name = '') {
  open(P, ctx); requireAdmin(P, ctx)
  const reg = registry(P, ctx.company)
  for (const r of roles) if (r !== 'admin' && !reg.roles[r]) fail('VALIDATION', `ไม่พบบทบาท "${r}" (โมดูลที่มีบทบาทนี้อาจยังไม่ได้ติดตั้ง/เปิดใช้งาน)`, {}, 422)
  let m = P.members.find(x => x.company === ctx.company && x.user === userId)
  if (!m) P.members.push(m = { company: ctx.company, user: userId, name, roles: [] })
  m.roles = [...new Set(roles)]
  if (name) m.name = name
  writeAudit(P, ctx, { action: 'roles', entity: 'platform.member', rec: { id: userId, code: name || userId }, summary: { th: `กำหนดบทบาทให้ ${name || userId}: ${roles.join(', ') || '(ไม่มี)'}`, en: `Set roles for ${name || userId}: ${roles.join(', ') || '(none)'}` } })
  return m
}
export function listMembers(P, ctx) {
  open(P, ctx); requireAdmin(P, ctx)
  return P.members.filter(m => m.company === ctx.company).map(m => clone(m))
}

// ============================================================ registry (what is live in one company)
export function activeSet(inst) {
  const act = new Set(Object.keys(inst).filter(n => inst[n].enabled))
  let changed = true
  while (changed) {
    changed = false
    for (const n of [...act]) {
      const ok = (inst[n].manifest.dependsOn || []).every(d => act.has(d.name) && satisfies(inst[d.name].version, d.version))
      if (!ok) { act.delete(n); changed = true }
    }
  }
  return act
}

function expandEntity(modName, e, comps) {
  const fields = expandFields(e.fields, comps)
  const wf = e.workflow
  if (wf && !fields.some(f => f.key === (wf.field || 'status'))) {
    fields.push({ key: wf.field || 'status', type: 'select', label: { th: 'สถานะ', en: 'Status' }, options: wf.states.map(s => ({ value: s.key, label: s.label })), readOnly: true, system: true })
  }
  const first = fields.find(f => f.type !== 'rows' && f.type !== 'formula')
  return {
    ...e, id: `${modName}.${e.key}`, module: modName, fields, wfField: wf ? (wf.field || 'status') : null,
    titleField: e.titleField || first?.key,
    list: { columns: e.list?.columns || fields.filter(f => f.type !== 'rows' && f.type !== 'textarea' && !f.system).slice(0, 5).map(f => f.key), filters: e.list?.filters || [] }
  }
}
const normPerms = (mod, perms = {}) => Object.fromEntries(Object.entries(perms).map(([k, v]) => [k.includes('.') ? k : `${mod}.${k}`, v]))

export function registry(P, cid) {
  const inst = P.installed[cid] || {}
  const active = activeSet(inst)
  const reg = { modules: inst, active, blocked: {}, entities: {}, roles: {}, reports: {}, subs: [], menu: [] }
  for (const n of Object.keys(inst)) {
    if (inst[n].enabled && !active.has(n)) {
      reg.blocked[n] = (inst[n].manifest.dependsOn || []).filter(d => !active.has(d.name) || !satisfies(inst[d.name]?.version || '0.0.0', d.version)).map(d => d.name)
    }
  }
  for (const n of active) {
    const m = inst[n].manifest
    const comps = {}
    for (const c of m.components || []) { comps[c.key] = c; comps[`${n}.${c.key}`] = c }
    for (const e of m.entities || []) reg.entities[`${n}.${e.key}`] = expandEntity(n, e, comps)
    for (const r of m.roles || []) reg.roles[`${n}.${r.key}`] = { ...r, id: `${n}.${r.key}`, module: n, perms: normPerms(n, r.perms), scopes: normPerms(n, r.scopes) }
    for (const r of m.reports || []) reg.reports[`${n}.${r.key}`] = { ...r, id: `${n}.${r.key}`, module: n }
    for (const s of m.subscriptions || []) reg.subs.push({ ...s, module: n })
    reg.menu.push({ module: n, title: m.title, items: m.menu || [] })
  }
  return reg
}

export function open(P, ctx) {
  if (!ctx || !ctx.company) fail('BAD_REQUEST', 'ไม่ได้ระบุบริษัท', {}, 400)
  if (!P.companies.some(c => c.id === ctx.company)) fail('NOT_FOUND', 'ไม่พบบริษัทนี้', {}, 404)
  if (!ctx.system) {
    if (!ctx.user) fail('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', {}, 401)
    if (!ctx.isSuper && !P.members.some(m => m.company === ctx.company && m.user === ctx.user.id)) fail('FORBIDDEN', 'คุณไม่ได้เป็นสมาชิกของบริษัทนี้', {}, 403)
  }
  return registry(P, ctx.company)
}

// ============================================================ permissions
const ACT_TH = { view: 'ดู', create: 'สร้าง', edit: 'แก้ไข', delete: 'ลบ' }
// returns null (no access) | 'all' | 'own'
export function access(P, ctx, reg, ent, action) {
  if (ctx.system || isAdmin(P, ctx)) return 'all'
  let best = null
  for (const rk of userRoles(P, ctx)) {
    const r = reg.roles[rk]
    const acts = r?.perms[ent.id]
    if (acts && (acts.includes(action) || acts.includes('*'))) {
      if ((r.scopes[ent.id] || 'all') === 'all') return 'all'
      best = 'own'
    }
  }
  return best
}
export function needAccess(P, ctx, reg, ent, action) {
  const a = access(P, ctx, reg, ent, action)
  if (!a) fail('FORBIDDEN', `คุณไม่มีสิทธิ์${ACT_TH[action] || action} “${tr(ent.label)}”`, { entity: ent.id, action }, 403)
  return a
}
export function recordAllowed(P, ctx, scope, rec) {
  if (ctx.system || isAdmin(P, ctx)) return true
  if (rec._createdBy === ctx.user?.id) return true
  if (rec._acl && (rec._acl.users?.length || rec._acl.roles?.length)) {
    return !!(rec._acl.users || []).includes(ctx.user?.id) || userRoles(P, ctx).some(r => (rec._acl.roles || []).includes(r))
  }
  return scope === 'all'
}
export function needRecord(P, ctx, scope, rec) {
  if (!recordAllowed(P, ctx, scope, rec)) fail('FORBIDDEN', 'คุณไม่มีสิทธิ์เข้าถึงรายการนี้ (สิทธิ์ระดับรายการข้อมูล)', { id: rec.id }, 403)
}
export function entOf(reg, entityId) {
  const e = reg.entities[entityId]
  if (!e) fail('NOT_FOUND', `ไม่พบเอกสารชนิด “${entityId}” (โมดูลที่เกี่ยวข้องอาจไม่ได้ติดตั้งหรือถูกปิดอยู่)`, { entity: entityId }, 404)
  return e
}
export const findRecord = (P, cid, entityId, id) => {
  const r = (P.data[cid]?.[entityId] || []).find(x => x.id === id && !x._deleted)
  if (!r) fail('NOT_FOUND', 'ไม่พบรายการนี้', { id }, 404)
  return r
}

// ============================================================ audit
export function writeAudit(P, ctx, { action, entity, rec, summary, changes = [] }) {
  P.audit.push({
    id: uid(), at: nowIso(), company: ctx.company, userId: ctx.user?.id || null, userName: ctx.user?.name || 'ระบบ',
    action, entity, recordId: rec?.id || null, recordCode: rec?.code || rec?.name || '', summary, changes
  })
  if (P.audit.length > 20000) P.audit.splice(0, P.audit.length - 20000)
}
export function diffRecord(ent, before, after) {
  const out = []
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (k.startsWith('_') || k === 'id' || k === 'code') continue
    if (!sameVal(before[k], after[k])) out.push({ field: k, label: ent.fields.find(f => f.key === k)?.label || k, from: before[k] ?? null, to: after[k] ?? null })
  }
  return out
}
export function listAudit(P, ctx, q = {}) {
  const reg = open(P, ctx)
  if (q.entity) needAccess(P, ctx, reg, entOf(reg, q.entity), 'view')
  else requireAdmin(P, ctx)
  let list = P.audit.filter(a => a.company === ctx.company)
  if (q.entity) list = list.filter(a => a.entity === q.entity)
  if (q.recordId) list = list.filter(a => a.recordId === q.recordId)
  if (q.userId) list = list.filter(a => a.userId === q.userId)
  return list.slice(-(q.limit || 200)).reverse()
}
export function setRecordAccess(P, ctx, entityId, id, acl) {
  const reg = open(P, ctx), ent = entOf(reg, entityId)
  needAccess(P, ctx, reg, ent, 'edit')
  const rec = findRecord(P, ctx.company, entityId, id)
  if (!isAdmin(P, ctx) && rec._createdBy !== ctx.user.id) fail('FORBIDDEN', 'เฉพาะผู้สร้างรายการหรือผู้ดูแลระบบเท่านั้นที่กำหนดสิทธิ์รายการได้', {}, 403)
  const before = clone(rec._acl)
  rec._acl = { users: acl.users || [], roles: acl.roles || [] }
  writeAudit(P, ctx, { action: 'acl', entity: entityId, rec, summary: { th: `กำหนดสิทธิ์ระดับรายการ ${rec.code}`, en: `Set record access on ${rec.code}` }, changes: [{ field: '_acl', label: { th: 'สิทธิ์ระดับรายการ', en: 'Record access' }, from: before ?? null, to: rec._acl }] })
  return rec._acl
}

// snapshot / restore make multi-step operations all-or-nothing
export function snapshot(P, cid) {
  return { data: clone(P.data[cid]), counters: clone(P.counters[cid]), audit: P.audit.length, installed: clone(P.installed[cid]), archive: clone(P.archive[cid]) }
}
export function restore(P, cid, snap) {
  for (const [k, v] of [['data', snap.data], ['counters', snap.counters], ['installed', snap.installed], ['archive', snap.archive]]) {
    if (v === undefined) delete P[k][cid]; else P[k][cid] = v
  }
  P.audit.length = Math.min(P.audit.length, snap.audit)
}
