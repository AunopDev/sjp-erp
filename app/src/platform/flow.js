// Workflow transitions, single-record reads, reports and the screen metadata the UI is allowed to see.
import { access, entOf, findRecord, isAdmin, needAccess, needRecord, open, recordAllowed, registry, restore, snapshot, systemCtx, userRoles, writeAudit, diffRecord } from './core.js'
import { buildValues, decorate, labelOf, payloadOf, publish, reportValues, runAction, runRules } from './records.js'
import { clone, fail, isBlank, nowIso, resolveExpr, round2, tr } from './util.js'

export function getRecord(P, ctx, entityId, id) {
  const reg = open(P, ctx), cid = ctx.company
  const ent = entOf(reg, entityId)
  const scope = needAccess(P, ctx, reg, ent, 'view')
  const rec = findRecord(P, cid, entityId, id)
  needRecord(P, ctx, scope, rec)
  return { ...decorate(P, cid, reg, ent, rec), _actions: availableTransitions(P, ctx, reg, ent, rec, scope) }
}

// ============================================================ workflow
function mayRun(P, ctx, reg, ent, t) {
  if (ctx.system || isAdmin(P, ctx)) return true
  if (!access(P, ctx, reg, ent, 'view')) return false
  const a = t.approvers
  const roles = (a.roles || []).map(r => (r.includes('.') ? r : `${ent.module}.${r}`))
  return (a.users || []).includes(ctx.user?.id) || userRoles(P, ctx).some(r => roles.includes(r))
}
export function availableTransitions(P, ctx, reg, ent, rec, scope) {
  const wf = ent.workflow
  if (!wf) return []
  const edit = access(P, ctx, reg, ent, 'edit')
  return (wf.transitions || []).filter(t => (t.from || []).includes(rec[ent.wfField])).filter(t => {
    if (t.approvers) return mayRun(P, ctx, reg, ent, t) && recordAllowed(P, ctx, scope, rec)
    return !!edit && recordAllowed(P, ctx, edit, rec)
  }).map(t => ({ key: t.key, label: t.label, to: t.to, requireComment: !!t.requireComment, approval: !!t.approvers }))
}

export function transition(P, ctx, entityId, id, key, opts = {}) {
  const reg = open(P, ctx), cid = ctx.company
  const ent = entOf(reg, entityId)
  const wf = ent.workflow
  if (!wf) fail('BAD_REQUEST', `“${tr(ent.label)}” ไม่มี workflow`, {}, 400)
  const t = (wf.transitions || []).find(x => x.key === key)
  if (!t) fail('NOT_FOUND', `ไม่พบขั้นตอน “${key}” ใน workflow`, {}, 404)
  const viewScope = needAccess(P, ctx, reg, ent, 'view')
  const rec = findRecord(P, cid, entityId, id)
  needRecord(P, ctx, viewScope, rec)
  const stNow = wf.states.find(s => s.key === rec[ent.wfField])
  if (!(t.from || []).includes(rec[ent.wfField])) fail('INVALID_TRANSITION', `ทำ “${tr(t.label)}” ไม่ได้ในสถานะ “${tr(stNow?.label)}”`, { state: rec[ent.wfField] }, 409)
  if (t.approvers) {
    if (!mayRun(P, ctx, reg, ent, t)) {
      const names = (t.approvers.roles || []).map(r => tr(reg.roles[r.includes('.') ? r : `${ent.module}.${r}`]?.label) || r).join(', ')
      fail('FORBIDDEN', `เฉพาะผู้อนุมัติ${names ? ` (บทบาท: ${names})` : ''} เท่านั้นที่ทำ “${tr(t.label)}” ได้`, { transition: key }, 403)
    }
  } else needAccess(P, ctx, reg, ent, 'edit')
  const comment = String(opts.comment || '').trim()
  if (t.requireComment && !comment) fail('VALIDATION', `ต้องระบุเหตุผลเมื่อ “${tr(t.label)}”`, { fields: { comment: 'required' } }, 422)

  const snap = snapshot(P, cid)
  const before = clone(rec)
  try {
    let merged = rec
    if (opts.fields && Object.keys(opts.fields).length) merged = buildValues(P, ctx, reg, ent, opts.fields, rec)
    for (const k of t.requireFields || []) if (isBlank(merged[k])) fail('VALIDATION', `ต้องกรอก “${tr(ent.fields.find(f => f.key === k)?.label || k)}” ก่อน “${tr(t.label)}”`, { fields: { [k]: 'required' } }, 422)
    if (t.validate !== false) runRules(P, ctx, reg, ent, merged, id, t.key)
    Object.assign(rec, merged)
    const scopeVars = { record: rec, user: ctx.user, comment, today: nowIso().slice(0, 10) }
    for (const [k, expr] of Object.entries(t.set || {})) if (ent.fields.some(f => f.key === k)) rec[k] = resolveExpr(expr, scopeVars)
    rec[ent.wfField] = t.to
    rec._updatedAt = nowIso(); rec._updatedBy = ctx.user?.id
    const to = wf.states.find(s => s.key === t.to)
    writeAudit(P, ctx, {
      action: 'transition', entity: entityId, rec,
      summary: { th: `${tr(t.label)} ${rec.code}: ${tr(stNow?.label)} → ${tr(to?.label)}${comment ? ' — ' + comment : ''}`, en: `${tr(t.label, 'en')} ${rec.code}: ${tr(stNow?.label, 'en')} → ${tr(to?.label, 'en')}${comment ? ' — ' + comment : ''}` },
      changes: diffRecord(ent, before, rec)
    })
    const sys = systemCtx(cid, `ระบบ (${ent.module})`, (ctx._depth || 0) + 1)
    for (const a of t.actions || []) runAction(P, sys, registry(P, cid), { module: ent.module }, a, { record: rec, user: ctx.user, comment, labels: decorate(P, cid, reg, ent, rec)._labels })
  } catch (e) {
    restore(P, cid, snap)
    throw e
  }
  const fresh = (P.data[cid]?.[entityId] || []).find(x => x.id === id)
  const payload = { ...payloadOf(P, ctx, reg, ent, fresh), transition: key, comment, from: stNow?.key, to: t.to }
  for (const ev of [].concat(t.emits || [])) publish(P, ctx, ev, payload)
  publish(P, ctx, `${ent.module}.${ent.key}.${key}`, payload)
  return { ...decorate(P, cid, reg, ent, fresh), _actions: availableTransitions(P, ctx, registry(P, cid), ent, fresh, viewScope) }
}

// ============================================================ reports
export function runReport(P, ctx, reportId) {
  const reg = open(P, ctx), cid = ctx.company
  const rep = reg.reports[reportId]
  if (!rep) fail('NOT_FOUND', `ไม่พบรายงาน “${reportId}” (โมดูลอาจไม่ได้ติดตั้ง/เปิดใช้งาน)`, {}, 404)
  const srcIds = (rep.type === 'sum' ? rep.sources.map(s => s.entity) : [rep.entity]).map(e => (e.includes('.') ? e : `${rep.module}.${e}`))
  for (const id of srcIds) needAccess(P, ctx, reg, entOf(reg, id), 'view')
  const map = reportValues(P, cid, rep)
  const gEnt = rep.groupEntity ? (rep.groupEntity.includes('.') ? rep.groupEntity : `${rep.module}.${rep.groupEntity}`) : null
  if (gEnt && reg.entities[gEnt]) for (const r of P.data[cid]?.[gEnt] || []) if (!r._deleted && !map.has(r.id)) map.set(r.id, { key: r.id, value: 0, debit: 0, credit: 0 })
  const rows = [...map.values()]
    .map(v => ({ ...v, label: gEnt ? (labelOf(P, cid, reg, gEnt, v.key) || '(ไม่พบ)') : String(v.key), balance: round2(v.debit - v.credit) }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const totals = { value: round2(rows.reduce((a, r) => a + r.value, 0)), debit: round2(rows.reduce((a, r) => a + r.debit, 0)), credit: round2(rows.reduce((a, r) => a + r.credit, 0)) }
  return { id: reportId, label: rep.label, type: rep.type, columns: rep.columns || (rep.type === 'sum' ? ['label', 'value'] : ['label', ...(rep.values || [])]), valueLabel: rep.valueLabel, rows, totals }
}

// ============================================================ screen metadata (what the UI may show)
export function menuFor(P, ctx) {
  const reg = open(P, ctx)
  const out = []
  for (const g of reg.menu) {
    const items = []
    for (const it of g.items) {
      if (it.kind === 'entity') {
        const ent = reg.entities[`${g.module}.${it.target}`]
        if (ent && access(P, ctx, reg, ent, 'view')) items.push({ kind: 'entity', id: ent.id, label: it.label || ent.label })
      } else if (it.kind === 'report') {
        const rep = reg.reports[`${g.module}.${it.target}`]
        const srcs = rep ? (rep.type === 'sum' ? rep.sources.map(s => s.entity) : [rep.entity]) : []
        const ok = rep && srcs.every(s => { const e = reg.entities[s.includes('.') ? s : `${g.module}.${s}`]; return e && access(P, ctx, reg, e, 'view') })
        if (ok) items.push({ kind: 'report', id: rep.id, label: it.label || rep.label })
      }
    }
    if (items.length) out.push({ module: g.module, title: g.title, items })
  }
  return out
}
export function screenFor(P, ctx, entityId) {
  const reg = open(P, ctx)
  const ent = entOf(reg, entityId)
  needAccess(P, ctx, reg, ent, 'view')
  const can = Object.fromEntries(['view', 'create', 'edit', 'delete'].map(a => [a, !!access(P, ctx, reg, ent, a)]))
  return { id: ent.id, module: ent.module, key: ent.key, label: ent.label, fields: clone(ent.fields), list: ent.list, titleField: ent.titleField, workflow: clone(ent.workflow || null), can }
}
export function optionsForRef(P, ctx, refEntityId) {
  const reg = open(P, ctx)
  const ent = entOf(reg, refEntityId)
  needAccess(P, ctx, reg, ent, 'view')
  return (P.data[ctx.company]?.[refEntityId] || []).filter(r => !r._deleted).map(r => ({ value: r.id, label: labelOf(P, ctx.company, reg, refEntityId, r.id) }))
}
