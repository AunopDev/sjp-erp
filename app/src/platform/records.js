// Records: generic create / read / update / delete driven only by entity definitions,
// plus declarative business rules, the event bus and report calculation.
import { checkValue, coerce, computeFormulas, defaultValue } from './parts.js'
import { access, bucket, diffRecord, entOf, findRecord, isAdmin, needAccess, needRecord, open, recordAllowed, registry, requireAdmin, restore, snapshot, systemCtx, writeAudit } from './core.js'
import { clone, fail, fmtMoney, isBlank, nowIso, resolveExpr, round2, tr, uid } from './util.js'

const refId = (ref, mod) => (ref.includes('.') ? ref : `${mod}.${ref}`)

function nextCode(P, cid, ent) {
  const c = (P.counters[cid] = P.counters[cid] || {})
  c[ent.id] = (c[ent.id] || 0) + 1
  return ent.prefix + '-' + String(c[ent.id]).padStart(4, '0')
}
export function labelOf(P, cid, reg, entityId, id) {
  const ent = reg.entities[entityId]
  const rec = (P.data[cid]?.[entityId] || []).find(x => x.id === id)
  if (!rec) return null
  const t = ent && rec[ent.titleField]
  return t ? `${rec.code ? rec.code + ' · ' : ''}${typeof t === 'object' ? tr(t) : t}` : rec.code
}
export function decorate(P, cid, reg, ent, rec) {
  const labels = {}
  for (const f of ent.fields) if (f.type === 'ref' && rec[f.key]) labels[f.key] = labelOf(P, cid, reg, refId(f.ref, ent.module), rec[f.key]) || '(ไม่พบ)'
  return { ...rec, _labels: labels }
}
const visibleField = (f, v) => !f.showIf || v[f.showIf.field] === f.showIf.value

function refProblem(P, cid, reg, targetId, id, name) {
  if (!reg.entities[targetId]) return `“${name}” ลิงก์ไปเอกสาร ${targetId} ไม่ได้ เพราะโมดูลที่เกี่ยวข้องไม่ได้เปิดใช้งาน`
  const t = (P.data[cid]?.[targetId] || []).find(r => r.id === id && !r._deleted)
  return t ? '' : `“${name}” ชี้ไปรายการที่ไม่มีอยู่ในบริษัทนี้`
}

export function buildValues(P, ctx, reg, ent, input, existing) {
  const cid = ctx.company, lang = ctx.lang || 'th'
  const out = existing ? { ...existing } : {}
  const errors = {}
  for (const f of ent.fields) {
    if (f.type === 'formula' || f.system) continue
    if (f.readOnly && !ctx.system) continue
    if (Object.prototype.hasOwnProperty.call(input, f.key)) {
      const v = coerce(f, input[f.key])
      if (v === undefined) delete out[f.key]; else out[f.key] = v
    } else if (!existing) {
      const d = defaultValue(f, ctx.user)
      if (d !== undefined) out[f.key] = d
    }
  }
  computeFormulas(ent.fields, out)
  for (const f of ent.fields) {
    if (f.type === 'formula' || f.system) continue
    const name = tr(f.label, lang)
    const v = out[f.key]
    if (!visibleField(f, out)) continue
    if (f.required && (isBlank(v) || (f.type === 'rows' && !v.length))) { errors[f.key] = lang === 'en' ? `Please fill in "${name}"` : `กรุณากรอก “${name}”`; continue }
    const m = checkValue(f, v, lang)
    if (m) { errors[f.key] = m; continue }
    if (f.type === 'ref' && v !== undefined) {
      const m2 = refProblem(P, cid, reg, refId(f.ref, ent.module), v, name)
      if (m2) errors[f.key] = m2
    }
    if (f.type === 'rows' && v) {
      for (const c of f.columns.filter(c => c.type === 'ref')) for (let i = 0; i < v.length; i++) if (v[i][c.key] !== undefined) {
        const m2 = refProblem(P, cid, reg, refId(c.ref, ent.module), v[i][c.key], `${name} #${i + 1} ${tr(c.label, lang)}`)
        if (m2) errors[f.key] = m2
      }
    }
    if (f.unique && v !== undefined) {
      const dup = (P.data[cid]?.[ent.id] || []).find(r => !r._deleted && r.id !== existing?.id && String(r[f.key]).toLowerCase() === String(v).toLowerCase())
      if (dup) errors[f.key] = lang === 'en' ? `"${name}" already exists (${dup.code})` : `“${name}” ซ้ำกับรายการ ${dup.code}`
    }
  }
  const keys = Object.keys(errors)
  if (keys.length) fail('VALIDATION', errors[keys[0]] + (keys.length > 1 ? ` (และอีก ${keys.length - 1} ข้อ)` : ''), { fields: errors }, 422)
  return out
}

// ---------- declarative business rules ----------
const sumCol = (rows, k) => (rows || []).reduce((a, r) => a + Number(r[k] || 0), 0)
export function runRules(P, ctx, reg, ent, rec, selfId, only) {
  for (const r of ent.rules || []) {
    if (r.on && !r.on.includes(only)) continue
    const msg = d => (r.message ? tr(r.message, ctx.lang) : d)
    const bad = (m, extra = {}) => fail('RULE_VIOLATION', m, { rule: r.type, ...extra }, 422)
    switch (r.type) {
      case 'balanced': {
        const rows = rec[r.rows] || []
        if (rows.length < (r.minRows || 2)) bad(msg(`ต้องมีรายการบัญชีอย่างน้อย ${r.minRows || 2} บรรทัด`))
        rows.forEach((x, i) => {
          const d = Number(x[r.debit] || 0), c = Number(x[r.credit] || 0)
          if ((d > 0) === (c > 0)) bad(`บรรทัดที่ ${i + 1} ต้องมีเดบิตหรือเครดิตอย่างใดอย่างหนึ่งเท่านั้น (ห้ามว่างทั้งคู่หรือมีทั้งคู่)`)
        })
        const d = round2(sumCol(rows, r.debit)), c = round2(sumCol(rows, r.credit))
        if (d !== c) bad(`เดบิตรวม ${fmtMoney(d)} ไม่เท่ากับเครดิตรวม ${fmtMoney(c)} (ต่างกัน ${fmtMoney(Math.abs(d - c))}) — บันทึกบัญชีคู่ต้องเดบิตเท่ากับเครดิตเสมอ`, { debit: d, credit: c })
        if (d <= 0) bad('ยอดรวมต้องมากกว่า 0')
        break
      }
      case 'minRows':
        if ((rec[r.rows] || []).length < (r.min || 1)) bad(msg(`ต้องมีรายการอย่างน้อย ${r.min || 1} แถว`))
        break
      case 'compare': {
        const a = rec[r.field], b = r.other ? rec[r.other] : r.value
        if (a === undefined || b === undefined) break
        const ok = { '>': a > b, '>=': a >= b, '<': a < b, '<=': a <= b, '==': a === b, '!=': a !== b }[r.op]
        if (!ok) bad(msg(`ค่าของ ${r.field} ไม่ผ่านเงื่อนไข ${r.op}`))
        break
      }
      case 'maxByReport': {
        const rep = reg.reports[`${ent.module}.${r.report}`]
        if (!rep) break
        const key = rec[r.key], qty = Number(rec[r.value] || 0)
        if (key === undefined) break
        const have = reportValues(P, ctx.company, rep, { excludeId: selfId }).get(key)?.value || 0
        if (qty > have + 1e-9) bad(msg(`ยอดคงเหลือไม่พอ (คงเหลือ ${have} ต้องการ ${qty})`), { available: have, requested: qty })
        break
      }
      default: break
    }
  }
}

// ---------- CRUD ----------
export function createRecord(P, ctx, entityId, values, opts = {}) {
  const reg = opts.reg || open(P, ctx), cid = ctx.company
  const ent = entOf(reg, entityId)
  needAccess(P, ctx, reg, ent, 'create')
  const rec = buildValues(P, ctx, reg, ent, values || {}, null)
  runRules(P, ctx, reg, ent, rec, null, 'save')
  if (ent.workflow) rec[ent.wfField] = ent.workflow.initial
  Object.assign(rec, { id: uid(), code: nextCode(P, cid, ent), _createdAt: nowIso(), _createdBy: ctx.user?.id, _updatedAt: nowIso(), _updatedBy: ctx.user?.id })
  bucket(P, cid, entityId).push(rec)
  writeAudit(P, ctx, { action: 'create', entity: entityId, rec, summary: { th: `สร้าง${tr(ent.label)} ${rec.code}`, en: `Created ${tr(ent.label, 'en')} ${rec.code}` } })
  publish(P, ctx, `${ent.module}.${ent.key}.created`, payloadOf(P, ctx, reg, ent, rec))
  return decorate(P, cid, reg, ent, rec)
}

export function lockedState(ent, rec) {
  const st = ent.workflow?.states.find(s => s.key === rec[ent.wfField])
  return st?.locked ? st : null
}
export function updateRecord(P, ctx, entityId, id, changes) {
  const reg = open(P, ctx), cid = ctx.company
  const ent = entOf(reg, entityId)
  const scope = needAccess(P, ctx, reg, ent, 'edit')
  const rec = findRecord(P, cid, entityId, id)
  needRecord(P, ctx, scope, rec)
  const lk = lockedState(ent, rec)
  if (lk) fail('LOCKED', `เอกสารอยู่ในสถานะ “${tr(lk.label)}” ซึ่งล็อกการแก้ไข`, { state: lk.key }, 409)
  if (ent.wfField && changes && Object.prototype.hasOwnProperty.call(changes, ent.wfField)) fail('VALIDATION', 'เปลี่ยนสถานะได้ผ่านขั้นตอน workflow เท่านั้น', {}, 422)
  const before = clone(rec)
  const next = buildValues(P, ctx, reg, ent, changes || {}, rec)
  runRules(P, ctx, reg, ent, next, id, 'save')
  const diff = diffRecord(ent, before, next)
  if (!diff.length) return decorate(P, cid, reg, ent, rec)
  for (const k of Object.keys(rec)) if (!k.startsWith('_') && k !== 'id' && k !== 'code' && !(k in next)) delete rec[k]
  Object.assign(rec, next, { _updatedAt: nowIso(), _updatedBy: ctx.user?.id })
  writeAudit(P, ctx, { action: 'update', entity: entityId, rec, summary: { th: `แก้ไข${tr(ent.label)} ${rec.code}`, en: `Updated ${tr(ent.label, 'en')} ${rec.code}` }, changes: diff })
  publish(P, ctx, `${ent.module}.${ent.key}.updated`, payloadOf(P, ctx, reg, ent, rec))
  return decorate(P, cid, reg, ent, rec)
}

export function deleteRecord(P, ctx, entityId, id) {
  const reg = open(P, ctx), cid = ctx.company
  const ent = entOf(reg, entityId)
  const scope = needAccess(P, ctx, reg, ent, 'delete')
  const rec = findRecord(P, cid, entityId, id)
  needRecord(P, ctx, scope, rec)
  const lk = lockedState(ent, rec)
  if (lk) fail('LOCKED', `เอกสารอยู่ในสถานะ “${tr(lk.label)}” ซึ่งล็อก ไม่สามารถลบได้`, {}, 409)
  rec._deleted = true; rec._deletedAt = nowIso(); rec._deletedBy = ctx.user?.id
  writeAudit(P, ctx, { action: 'delete', entity: entityId, rec, summary: { th: `ลบ${tr(ent.label)} ${rec.code}`, en: `Deleted ${tr(ent.label, 'en')} ${rec.code}` } })
  publish(P, ctx, `${ent.module}.${ent.key}.deleted`, payloadOf(P, ctx, reg, ent, rec))
  return { id }
}

export function listRecords(P, ctx, entityId, q = {}) {
  const reg = open(P, ctx), cid = ctx.company
  const ent = entOf(reg, entityId)
  const scope = needAccess(P, ctx, reg, ent, 'view')
  let list = (P.data[cid]?.[entityId] || []).filter(r => !r._deleted && recordAllowed(P, ctx, scope, r))
  for (const [k, v] of Object.entries(q.filters || {})) if (!isBlank(v)) list = list.filter(r => String(r[k]) === String(v))
  const text = String(q.search || '').trim().toLowerCase()
  if (text) {
    list = list.filter(r => {
      const hay = [r.code, ...ent.fields.filter(f => ['text', 'textarea', 'select'].includes(f.type)).map(f => r[f.key]), ...Object.values(decorate(P, cid, reg, ent, r)._labels)]
      return hay.some(x => x !== undefined && String(x).toLowerCase().includes(text))
    })
  }
  const sort = q.sort || '-_createdAt'
  const key = sort.replace(/^-/, ''), dir = sort.startsWith('-') ? -1 : 1
  list = [...list].sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * dir)
  const pageSize = Math.min(Number(q.pageSize) || 50, 500), page = Math.max(Number(q.page) || 1, 1)
  return { total: list.length, page, pageSize, items: list.slice((page - 1) * pageSize, page * pageSize).map(r => decorate(P, cid, reg, ent, r)) }
}

// ============================================================ event bus
export function payloadOf(P, ctx, reg, ent, rec) {
  return { company: ctx.company, entity: ent.id, module: ent.module, recordId: rec.id, record: clone(rec), labels: decorate(P, ctx.company, reg, ent, rec)._labels, by: { id: ctx.user?.id, name: ctx.user?.name }, at: nowIso() }
}
const evMatch = (pat, name) => pat === name || (pat.endsWith('*') && name.startsWith(pat.slice(0, -1)))

// Modules never call each other: they publish events, and any module that subscribed in its definition reacts.
// A failing subscriber is rolled back and logged; it can never break the publisher.
export function publish(P, ctx, name, payload) {
  const cid = ctx.company
  const depth = ctx._depth || 0
  const reg = registry(P, cid)
  const entry = { id: uid(), at: nowIso(), company: cid, event: name, recordId: payload?.recordId || null, deliveries: [] }
  for (const sub of reg.subs.filter(s => evMatch(s.event, name))) {
    if (depth >= 4) { entry.deliveries.push({ module: sub.module, ok: false, error: 'เหตุการณ์ต่อเนื่องลึกเกินไป (ป้องกันการวนซ้ำ)' }); continue }
    const snap = snapshot(P, cid)
    try {
      const sys = systemCtx(cid, `ระบบ (${sub.module})`, depth + 1)
      const made = runAction(P, sys, registry(P, cid), sub, sub.action, { ...payload, event: name })
      entry.deliveries.push({ module: sub.module, ok: true, produced: made })
    } catch (e) {
      restore(P, cid, snap)
      entry.deliveries.push({ module: sub.module, ok: false, error: e.message || String(e) })
    }
  }
  P.events.push(entry)
  if (P.events.length > 300) P.events.splice(0, P.events.length - 300)
  return entry
}
export function listEvents(P, ctx, limit = 100) {
  open(P, ctx); requireAdmin(P, ctx)
  return P.events.filter(e => e.company === ctx.company).slice(-limit).reverse()
}

const ACTION_TYPES = {
  // createRecord: { entity, forEach?, map }
  createRecord(P, sys, reg, sub, a, scope) {
    const id = a.entity.includes('.') ? a.entity : `${sub.module}.${a.entity}`
    const items = a.forEach ? (resolveExpr(a.forEach, scope) || []) : [null]
    const made = []
    for (const item of items) {
      const sc = { ...scope, line: item }
      const values = {}
      for (const [k, expr] of Object.entries(a.map || {})) { const v = resolveExpr(expr, sc); if (v !== undefined) values[k] = v }
      made.push(createRecord(P, sys, id, values, { reg }).code)
    }
    return made
  },
  // setFields: { entity, where:{field:expr}, set:{field:expr} }
  setFields(P, sys, reg, sub, a, scope) {
    const id = a.entity.includes('.') ? a.entity : `${sub.module}.${a.entity}`
    const rows = (P.data[sys.company]?.[id] || []).filter(r => !r._deleted && Object.entries(a.where || {}).every(([k, e]) => r[k] === resolveExpr(e, scope)))
    const made = []
    for (const r of rows) {
      const set = {}
      for (const [k, e] of Object.entries(a.set || {})) set[k] = resolveExpr(e, scope)
      updateRecord(P, sys, id, r.id, set)
      made.push(r.code)
    }
    return made
  }
}
export function registerAction(type, fn) { ACTION_TYPES[type] = fn }
export function runAction(P, sys, reg, sub, action, scope) {
  const fn = ACTION_TYPES[action.type]
  if (!fn) fail('BAD_REQUEST', `ไม่รู้จักการกระทำชนิด “${action.type}”`)
  return fn(P, sys, reg, sub, action, scope)
}

// ============================================================ report calculation
export function reportValues(P, cid, rep, { excludeId } = {}) {
  const map = new Map()
  const slot = k => { if (!map.has(k)) map.set(k, { key: k, value: 0, debit: 0, credit: 0 }); return map.get(k) }
  if (rep.type === 'sum') {
    for (const s of rep.sources || []) {
      const id = s.entity.includes('.') ? s.entity : `${rep.module}.${s.entity}`
      for (const r of P.data[cid]?.[id] || []) {
        if (r._deleted || r.id === excludeId || r[rep.groupBy] === undefined) continue
        slot(r[rep.groupBy]).value += (s.sign || 1) * Number(r[rep.value] || 0)
      }
    }
  } else if (rep.type === 'rowsSum') {
    const id = rep.entity.includes('.') ? rep.entity : `${rep.module}.${rep.entity}`
    for (const r of P.data[cid]?.[id] || []) {
      if (r._deleted || r.id === excludeId) continue
      if (rep.where && !Object.entries(rep.where).every(([k, v]) => r[k] === v)) continue
      for (const row of r[rep.rows] || []) {
        if (row[rep.groupBy] === undefined) continue
        const s = slot(row[rep.groupBy])
        for (const v of rep.values || []) s[v] += Number(row[v] || 0)
      }
    }
  }
  for (const v of map.values()) { v.value = round2(v.value); v.debit = round2(v.debit); v.credit = round2(v.credit) }
  return map
}
void isAdmin; void access
