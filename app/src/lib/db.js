import { ENT } from './schema.js'
import { uid, nowIso, isEmpty, hashPw, todayStr, ymd, addDays } from './util.js'

// ---------- session / permissions ----------
export const cur = s => s.users.find(u => u.id === s.session)
export const roleOf = (s, u = cur(s)) => s.config.roles.find(r => r.id === u?.roleId)
export function can(s, res, action) {
  const r = roleOf(s)
  if (!r) return false
  if (r.isAdmin) return true
  return !!(r.perms && r.perms[res] && r.perms[res][action])
}
export function need(s, res, action) {
  if (!can(s, res, action)) throw new Error('คุณไม่มีสิทธิ์ดำเนินการนี้')
}
export const canEntity = (s, entity, action) => can(s, ENT[entity].res, action)

const SCOPED = ['projects', 'tickets', 'purchaseOrders', 'stockMoves', 'pmPlans', 'pmRecords', 'serials', 'sites']
export function inScope(s, entity, rec) {
  const u = cur(s), r = roleOf(s)
  if (!u || !r) return false
  const custom = !!ENT[entity]?.custom
  if (r.isAdmin || r.scope === 'all' || !(SCOPED.includes(entity) || custom)) return true
  const mine = rec.assignee === u.id || rec.manager === u.id || rec._createdBy === u.id || (custom && Object.values(rec).includes(u.id))
  if (mine) return true
  switch (r.scope) {
    case 'own': return false
    case 'team': return !!rec.team && rec.team === u.team
    case 'dept': {
      const o = s.users.find(x => x.id === (rec.assignee || rec.manager || rec._createdBy))
      return !!o && o.dept === u.dept
    }
    case 'project': return entity === 'projects' ? (u.projectIds || []).includes(rec.id) : (u.projectIds || []).includes(rec.project)
    case 'site': return entity === 'sites' ? (u.siteIds || []).includes(rec.id) : (u.siteIds || []).includes(rec.site)
    default: return true
  }
}

export function rows(s, entity, { archived = false } = {}) {
  if (!can(s, ENT[entity].res, 'view')) return []
  return (s.data[entity] || []).filter(r => (archived ? true : !r._deleted) && inScope(s, entity, r))
}
export const getRec = (s, entity, id) => (s.data[entity] || []).find(r => r.id === id)
function mustGet(s, entity, id) {
  const r = getRec(s, entity, id)
  if (!r) throw new Error('ไม่พบรายการ')
  return r
}

// ---------- config helpers ----------
export const fieldsOf = (s, entity) => s.config.fields[entity] || []
export function optionsOf(s, f) {
  if (f.optionsFrom) return s.config.lists[f.optionsFrom] || []
  return f.options || []
}
export function label(s, entity, id) {
  if (!id) return '–'
  if (entity === 'users') return s.users.find(u => u.id === id)?.name || '(ไม่พบ)'
  const r = getRec(s, entity, id)
  if (!r) return '(ไม่พบ)'
  const t = r[ENT[entity].title]
  return entity === 'purchaseOrders' || entity === 'stockMoves' || entity === 'pmRecords' ? r.code : t || r.code
}

// ---------- audit ----------
export function audit(s, action, entity, rec, summary, changes) {
  const u = cur(s)
  s.audit.push({
    id: uid(), at: nowIso(), userId: u?.id || null, userName: u?.name || 'ระบบ',
    action, entity, recId: rec?.id || null, recCode: rec?.code || rec?.[ENT[entity]?.title] || '',
    summary, changes: changes || []
  })
  if (s.audit.length > 3000) s.audit.splice(0, s.audit.length - 3000)
}

function nextCode(s, prefix) {
  s.counters[prefix] = (s.counters[prefix] || 0) + 1
  return prefix + '-' + String(s.counters[prefix]).padStart(4, '0')
}

// ---------- validation ----------
export function validate(s, entity, values, selfId) {
  const errs = {}
  for (const f of fieldsOf(s, entity)) {
    if (f.hidden || f.type === 'section' || f.type === 'formula') continue
    if (f.showIf && values[f.showIf.field] !== f.showIf.value) continue
    const v = values[f.key]
    if (f.required && (isEmpty(v) || (f.type === 'rows' && !v.some(r => Object.values(r).some(x => !isEmpty(x)))))) {
      errs[f.key] = `กรุณากรอก "${f.label}"`
      continue
    }
    if (f.type === 'number' && !isEmpty(v) && isNaN(Number(v))) errs[f.key] = `"${f.label}" ต้องเป็นตัวเลข`
    if (f.type === 'number' && !isEmpty(v) && Number(v) < 0 && f.key !== 'lat' && f.key !== 'lng') errs[f.key] = `"${f.label}" ต้องไม่ติดลบ`
    if (f.unique && !isEmpty(v)) {
      const dup = (s.data[entity] || []).find(r => !r._deleted && r.id !== selfId && String(r[f.key]).trim().toLowerCase() === String(v).trim().toLowerCase())
      if (dup) errs[f.key] = `"${f.label}" ซ้ำกับรายการที่มีอยู่แล้ว`
    }
  }
  return errs
}
function throwErrs(errs) {
  const k = Object.keys(errs)
  if (k.length) {
    const e = new Error(errs[k[0]] + (k.length > 1 ? ` (และอีก ${k.length - 1} ข้อ)` : ''))
    e.fieldErrors = errs
    throw e
  }
}

// ---------- generic CRUD ----------
export function insert(s, entity, values, opts = {}) {
  if (!opts.force) need(s, ENT[entity].res, 'create')
  if (opts.reqId) {
    const hit = s.processed[opts.reqId]
    if (hit) return getRec(s, entity, hit) || hit
  }
  throwErrs(validate(s, entity, values))
  const u = cur(s)
  const rec = {
    ...values, id: uid(), code: nextCode(s, ENT[entity].prefix),
    _createdAt: nowIso(), _createdBy: u?.id, _updatedAt: nowIso(), _updatedBy: u?.id
  }
  const wfm = s.config.workflows[entity]
  if (wfm && rec.status === undefined) rec.status = (wfm.statuses.find(x => x.enabled) || {}).key
  if (!s.data[entity]) s.data[entity] = []
  s.data[entity].push(rec)
  if (opts.reqId) {
    s.processed[opts.reqId] = rec.id
    const keys = Object.keys(s.processed)
    if (keys.length > 300) keys.slice(0, 100).forEach(k => delete s.processed[k])
  }
  audit(s, 'create', entity, rec, `สร้าง${ENT[entity].label} ${rec.code}`)
  return rec
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
export function diffOf(s, entity, before, after) {
  const ch = []
  const fs = fieldsOf(s, entity)
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (k.startsWith('_') || k === 'timeline' || k === 'history') continue
    if (!same(before[k], after[k])) ch.push({ field: fs.find(f => f.key === k)?.label || k, from: before[k], to: after[k] })
  }
  return ch
}

export function patch(s, entity, id, changes, opts = {}) {
  if (!opts.force) need(s, ENT[entity].res, 'edit')
  const rec = mustGet(s, entity, id)
  if (rec._deleted) throw new Error('รายการนี้ถูกยกเลิก/ซ่อนแล้ว')
  if (!opts.force && !inScope(s, entity, rec)) throw new Error('ไม่มีสิทธิ์เข้าถึงรายการนี้')
  const before = structuredClone(rec)
  const next = { ...rec, ...changes }
  if (!opts.skipValidate) throwErrs(validate(s, entity, next, id))
  Object.assign(rec, changes, { _updatedAt: nowIso(), _updatedBy: cur(s)?.id })
  const ch = diffOf(s, entity, before, rec)
  if (ch.length) audit(s, opts.action || 'update', entity, rec, opts.summary || `แก้ไข${ENT[entity].label} ${rec.code || ''}`, ch)
  return rec
}

export function archive(s, entity, id, reason) {
  need(s, ENT[entity].res, 'delete')
  if (!reason || !reason.trim()) throw new Error('ต้องระบุเหตุผล')
  const rec = mustGet(s, entity, id)
  rec._deleted = true; rec._deletedAt = nowIso(); rec._deletedBy = cur(s)?.id; rec._deleteReason = reason.trim()
  audit(s, 'archive', entity, rec, `ยกเลิก/ซ่อน ${ENT[entity].label} — เหตุผล: ${reason.trim()}`)
}
export function restore(s, entity, id) {
  need(s, ENT[entity].res, 'delete')
  const rec = mustGet(s, entity, id)
  rec._deleted = false; delete rec._deleteReason
  audit(s, 'restore', entity, rec, `กู้คืน ${ENT[entity].label}`)
}

// ---------- approvals ----------
export function isApprover(s, cfg) {
  const u = cur(s), r = roleOf(s)
  if (!u) return false
  if (r?.isAdmin) return true
  return (cfg.approverUser && cfg.approverUser === u.id) || (cfg.approverRole && cfg.approverRole === u.roleId)
}
const hasApprover = cfg => !!(cfg && (cfg.approverRole || cfg.approverUser))
function requestApproval(s, ap) {
  const dup = s.approvals.find(a => a.status === 'pending' && a.entity === ap.entity && a.recId === ap.recId && a.kind === ap.kind && a.key === ap.key)
  if (dup) throw new Error('มีคำขออนุมัติรายการนี้ค้างอยู่แล้ว')
  const a = { id: uid(), at: nowIso(), by: cur(s)?.id, status: 'pending', ...ap }
  s.approvals.push(a)
  audit(s, 'approval-request', ap.entity, getRec(s, ap.entity, ap.recId), `ขออนุมัติ: ${ap.title}`)
  return a
}
export function decideApproval(s, id, approve, note) {
  const a = s.approvals.find(x => x.id === id)
  if (!a || a.status !== 'pending') throw new Error('คำขอนี้ถูกดำเนินการแล้ว')
  if (!isApprover(s, a.cfg)) throw new Error('คุณไม่ใช่ผู้อนุมัติของรายการนี้')
  if (!approve && !(note || '').trim()) throw new Error('ต้องระบุเหตุผลเมื่อไม่อนุมัติ')
  a.status = approve ? 'approved' : 'rejected'
  a.decidedBy = cur(s).id; a.decidedAt = nowIso(); a.note = note || ''
  const rec = getRec(s, a.entity, a.recId)
  audit(s, approve ? 'approve' : 'reject', a.entity, rec, `${approve ? 'อนุมัติ' : 'ไม่อนุมัติ'}: ${a.title}${note ? ' — ' + note : ''}`)
  if (a.kind === 'ticket-status') {
    if (approve) changeTicketStatus(s, a.recId, a.payload.to, { ...a.payload, force: true, approvedBy: cur(s).name })
    else addTimeline(s, a.recId, 'approval', `ไม่อนุมัติการเปลี่ยนสถานะ — ${note}`)
  } else if (a.kind === 'project-step') {
    const p = getRec(s, 'projects', a.recId)
    if (p && p.steps[a.key]) delete p.steps[a.key].pendingApproval
    if (approve) transitStep(s, a.recId, a.key, 'complete', { force: true, approvedBy: cur(s).name })
    else projectLog(s, p, a.key, `ไม่อนุมัติการจบขั้นตอน — ${note}`)
  } else if (a.kind === 'module-status') {
    if (approve) changeModuleStatus(s, a.entity, a.recId, a.payload.to, { ...a.payload, force: true, approvedBy: cur(s).name })
    else addTimelineGeneric(s, a.entity, a.recId, 'approval', `ไม่อนุมัติการเปลี่ยนสถานะ — ${note}`)
  } else if (a.kind === 'po-status') {
    if (approve) changePoStatus(s, a.recId, a.payload.to, { force: true })
  }
  return a
}

// ---------- tickets ----------
export function addTimeline(s, id, type, text, extra = {}) {
  const t = mustGet(s, 'tickets', id)
  t.timeline = t.timeline || []
  t.timeline.push({ id: uid(), at: nowIso(), by: cur(s)?.id, type, text, ...extra })
  t._updatedAt = nowIso(); t._updatedBy = cur(s)?.id
}
export function ticketNote(s, id, type, text) {
  need(s, 'tickets', 'edit')
  if (!text || !text.trim()) throw new Error('กรุณากรอกข้อความ')
  const t = mustGet(s, 'tickets', id)
  if (!inScope(s, 'tickets', t)) throw new Error('ไม่มีสิทธิ์เข้าถึงรายการนี้')
  addTimeline(s, id, type, text.trim())
  audit(s, 'note', 'tickets', t, `บันทึก${type === 'remote' ? 'การแก้ไขระยะไกล' : 'ข้อความ'}: ${text.trim().slice(0, 80)}`)
}
export const ticketStatusOf = (s, key) => s.config.workflows.ticket.statuses.find(x => x.key === key)

export function changeTicketStatus(s, id, to, opts = {}) {
  const t = mustGet(s, 'tickets', id)
  const wf = s.config.workflows.ticket
  const from = wf.statuses.find(x => x.key === t.status)
  const target = wf.statuses.find(x => x.key === to)
  if (!target || !target.enabled) throw new Error('สถานะปลายทางไม่ถูกต้อง')
  if (!opts.force) {
    need(s, 'tickets', 'edit')
    if (!inScope(s, 'tickets', t)) throw new Error('ไม่มีสิทธิ์เข้าถึงรายการนี้')
    if (from && from.next?.length && !from.next.includes(to)) throw new Error(`ไม่สามารถเปลี่ยนจาก "${from.label}" เป็น "${target.label}" ตามเงื่อนไข workflow`)
    if (target.needClosePerm) need(s, 'tickets', 'close')
  }
  if (from?.final && !(opts.comment || '').trim()) throw new Error('การเปิดเคสใหม่ต้องระบุเหตุผล')
  const merged = { ...t, ...(opts.fields || {}) }
  for (const k of target.requiredFields || []) {
    if (isEmpty(merged[k])) {
      const fl = fieldsOf(s, 'tickets').find(f => f.key === k)?.label || k
      const e = new Error(`ต้องกรอก "${fl}" ก่อนเปลี่ยนเป็น "${target.label}"`)
      e.needField = k
      throw e
    }
  }
  if (!opts.force && hasApprover(target) && !isApprover(s, target)) {
    requestApproval(s, { kind: 'ticket-status', entity: 'tickets', recId: id, key: to, title: `${t.code} → ${target.label}`, payload: { to, comment: opts.comment, fields: opts.fields }, cfg: { approverRole: target.approverRole, approverUser: target.approverUser } })
    addTimeline(s, id, 'approval', `ขออนุมัติเปลี่ยนสถานะเป็น "${target.label}"${opts.comment ? ' — ' + opts.comment : ''}`)
    return { pending: true }
  }
  const before = structuredClone(t)
  Object.assign(t, opts.fields || {})
  t.status = to
  const now = nowIso()
  if (!t.respondedAt && to !== 'received') t.respondedAt = now
  if (['verify', 'informed', 'closed'].includes(to) && !t.resolvedAt) t.resolvedAt = now
  if (to === 'closed') t.closedAt = now
  if (from?.final && !target.final) { t.closedAt = null; t.reopenedCount = (t.reopenedCount || 0) + 1 }
  addTimeline(s, id, 'status', `${from?.label || '–'} → ${target.label}${opts.comment ? ' — ' + opts.comment : ''}${opts.approvedBy ? ` (อนุมัติโดย ${opts.approvedBy})` : ''}`, { from: t.status === to ? from?.key : from?.key, to })
  audit(s, 'status', 'tickets', t, `เปลี่ยนสถานะ ${t.code}: ${from?.label} → ${target.label}`, diffOf(s, 'tickets', before, t))
  return { pending: false }
}

export function assignTicket(s, id, team, assignee, note) {
  need(s, 'tickets', 'assign')
  const t = mustGet(s, 'tickets', id)
  const before = structuredClone(t)
  t.team = team || t.team; t.assignee = assignee || null
  addTimeline(s, id, 'assign', `มอบหมาย/ส่งต่องาน: ${team || '–'} / ${label(s, 'users', assignee)}${note ? ' — ' + note : ''}`)
  audit(s, 'assign', 'tickets', t, `มอบหมาย ${t.code}`, diffOf(s, 'tickets', before, t))
}

export function addAppointment(s, id, ap) {
  need(s, 'tickets', 'edit')
  if (!ap.date) throw new Error('กรุณาระบุวันนัดหมาย')
  const t = mustGet(s, 'tickets', id)
  t.appointments = t.appointments || []
  const rec = { id: uid(), date: ap.date, time: ap.time || '', tech: ap.tech || null, note: ap.note || '', status: 'นัดหมาย' }
  t.appointments.push(rec)
  addTimeline(s, id, 'visit', `นัดหมายเข้าหน้างาน ${ap.date} ${ap.time || ''} ช่าง: ${label(s, 'users', ap.tech)}`)
  audit(s, 'appointment', 'tickets', t, `นัดหมายช่าง ${t.code} วันที่ ${ap.date}`)
}
export function resolveAppointment(s, id, apId, status, result) {
  need(s, 'tickets', 'edit')
  const t = mustGet(s, 'tickets', id)
  const ap = (t.appointments || []).find(a => a.id === apId)
  if (!ap) throw new Error('ไม่พบนัดหมาย')
  if (status === 'เสร็จ' && !(result || '').trim()) throw new Error('กรุณาบันทึกผลการเข้าหน้างาน')
  ap.status = status; ap.result = result || ''
  addTimeline(s, id, 'visit', `${status === 'เสร็จ' ? 'เข้าหน้างานแล้ว' : 'ยกเลิกนัด'} (${ap.date}) — ${result || ''}`)
  audit(s, 'appointment', 'tickets', t, `${status} นัดหมาย ${t.code}`)
}

// ---------- serial history ----------
export function serialLog(s, serial, type, text, ref) {
  serial.history = serial.history || []
  serial.history.push({ id: uid(), at: nowIso(), by: cur(s)?.id, type, text, ref: ref || null })
}

export function markInstalled(s, serialId, d) {
  need(s, 'assets', 'edit')
  const sr = mustGet(s, 'serials', serialId)
  const item = getRec(s, 'items', sr.item)
  const date = d.date || todayStr()
  if (!d.site && !sr.site) throw new Error('กรุณาระบุไซต์ติดตั้ง')
  const wEnd = item?.warrantyMonths ? ymd(new Date(new Date(date).setMonth(new Date(date).getMonth() + Number(item.warrantyMonths)))) : sr.warrantyEnd
  Object.assign(sr, {
    status: 'ติดตั้งแล้ว', installedDate: date, site: d.site || sr.site, location: d.location || sr.location,
    warrantyStart: item?.warrantyMonths ? date : sr.warrantyStart, warrantyEnd: wEnd, warehouse: null,
    _updatedAt: nowIso(), _updatedBy: cur(s)?.id
  })
  if (!sr.customer && sr.site) sr.customer = getRec(s, 'sites', sr.site)?.customer
  serialLog(s, sr, 'install', `ติดตั้งที่ ${label(s, 'sites', sr.site)} จุด: ${sr.location || '–'}${wEnd ? ' · รับประกันถึง ' + wEnd : ''}`, d.project ? { entity: 'projects', id: d.project } : null)
  audit(s, 'install', 'serials', sr, `บันทึกการติดตั้ง ${sr.serialNo}`)
}

// ---------- stock ----------
export function balances(s) {
  const b = {}
  for (const m of s.data.stockMoves || []) {
    if (m._deleted) continue
    if (m.from) { b[m.from] = b[m.from] || {}; b[m.from][m.item] = (b[m.from][m.item] || 0) - m.qty }
    if (m.to) { b[m.to] = b[m.to] || {}; b[m.to][m.item] = (b[m.to][m.item] || 0) + m.qty }
  }
  return b
}
export const balanceOf = (s, wh, item) => balances(s)[wh]?.[item] || 0

export const MOVE_TYPES = { receive: 'รับเข้า', issue: 'เบิกออก', transfer: 'โอนย้าย', return: 'รับคืน', adjust: 'ปรับยอด' }

export function createMove(s, m, opts = {}) {
  if (!opts.force) need(s, 'warehouse', 'create')
  if (opts.reqId && s.processed[opts.reqId]) return getRec(s, 'stockMoves', s.processed[opts.reqId])
  const item = getRec(s, 'items', m.item)
  const qty = Number(m.qty)
  if (!item) throw new Error('กรุณาเลือกสินค้า')
  if (!qty || qty <= 0 || !Number.isFinite(qty)) throw new Error('จำนวนต้องมากกว่า 0')
  const serials = (m.serials || []).filter(Boolean)
  if (item.trackSerial) {
    if (!Number.isInteger(qty)) throw new Error('สินค้าที่ติดตาม Serial ต้องเป็นจำนวนเต็ม')
    if (serials.length !== qty) throw new Error(`ต้องระบุ Serial Number ให้ครบ ${qty} รายการ (ระบุแล้ว ${serials.length})`)
  }
  const t = m.type
  if (!MOVE_TYPES[t]) throw new Error('ประเภทรายการไม่ถูกต้อง')
  if (['issue', 'transfer'].includes(t) && !m.from) throw new Error('กรุณาเลือกคลังต้นทาง')
  if (['receive', 'transfer', 'return'].includes(t) && !m.to) throw new Error('กรุณาเลือกคลังปลายทาง')
  if (t === 'transfer' && m.from === m.to) throw new Error('คลังต้นทางและปลายทางต้องต่างกัน')
  if (t === 'issue' && !(m.project || m.site || m.ticket)) throw new Error('การเบิกต้องอ้างอิงโครงการ ไซต์ หรือ Ticket อย่างน้อยหนึ่งอย่าง')
  if (t === 'adjust' && !(m.note || '').trim()) throw new Error('การปรับยอดต้องระบุเหตุผล')
  if (t === 'adjust' && !m.from && !m.to) throw new Error('เลือกคลังที่ปรับยอด')
  if (m.from) {
    const have = balanceOf(s, m.from, m.item)
    if (qty > have) throw new Error(`ยอดคงเหลือไม่พอ (มี ${have} ต้องการ ${qty})`)
  }
  if (item.trackSerial) {
    if (new Set(serials).size !== serials.length) throw new Error('Serial ซ้ำกันในรายการ')
    for (const sid of serials) {
      const sr = getRec(s, 'serials', sid)
      if (!sr || sr.item !== item.id) throw new Error('Serial ไม่ตรงกับสินค้า')
      if (['issue', 'transfer'].includes(t) && sr.warehouse !== m.from) throw new Error(`Serial ${sr.serialNo} ไม่ได้อยู่ในคลังต้นทาง`)
    }
  }
  const mv = insert(s, 'stockMoves', {
    type: t, item: m.item, qty, serials, from: m.from || null, to: m.to || null,
    project: m.project || null, site: m.site || null, ticket: m.ticket || null, po: m.po || null,
    recipient: m.recipient || '', evidence: m.evidence || [], note: m.note || '', date: m.date || nowIso()
  }, { force: true, reqId: opts.reqId })
  const proj = m.project, st = m.site || (proj ? getRec(s, 'projects', proj)?.site : null)
  for (const sid of serials) {
    const sr = getRec(s, 'serials', sid)
    const ref = { entity: 'stockMoves', id: mv.id }
    if (t === 'receive' || t === 'return') {
      sr.warehouse = m.to; sr.status = 'ในคลัง'; sr.receivedDate = sr.receivedDate || todayStr()
      serialLog(s, sr, t, `${MOVE_TYPES[t]}เข้า ${label(s, 'warehouses', m.to)} (${mv.code})`, ref)
    } else if (t === 'transfer') {
      sr.warehouse = m.to
      serialLog(s, sr, 'transfer', `โอนจาก ${label(s, 'warehouses', m.from)} ไป ${label(s, 'warehouses', m.to)} (${mv.code})`, ref)
    } else if (t === 'issue') {
      sr.warehouse = null; sr.status = 'ส่งออกไปหน้างาน'
      if (proj) sr.project = proj
      if (st) { sr.site = st; sr.customer = sr.customer || getRec(s, 'sites', st)?.customer }
      serialLog(s, sr, 'issue', `เบิกไป ${proj ? label(s, 'projects', proj) : ''} ${st ? label(s, 'sites', st) : ''} ${m.ticket ? '(Ticket ' + label(s, 'tickets', m.ticket) + ')' : ''} ผู้รับ: ${m.recipient || '–'} (${mv.code})`, ref)
    }
  }
  return mv
}

export function receivePO(s, poId, wh, lines, reqId) {
  need(s, 'warehouse', 'create')
  if (reqId && s.processed[reqId]) return
  const po = mustGet(s, 'purchaseOrders', poId)
  if (!['ordered', 'partial'].includes(po.status)) throw new Error('ใบสั่งซื้อนี้ยังไม่อยู่ในสถานะที่รับสินค้าได้ (ต้องเป็น "สั่งซื้อแล้ว" หรือ "รับบางส่วน")')
  if (!wh) throw new Error('กรุณาเลือกคลังรับเข้า')
  const got = poReceived(s, po)
  let any = false
  for (const l of lines) {
    const qty = Number(l.qty || 0)
    if (!qty) continue
    any = true
    const ordered = po.lines.filter(x => x.item === l.item).reduce((a, x) => a + Number(x.qty || 0), 0)
    if ((got[l.item] || 0) + qty > ordered) throw new Error(`รับเกินจำนวนสั่งซื้อ: ${label(s, 'items', l.item)}`)
    const item = getRec(s, 'items', l.item)
    let ids = []
    if (item.trackSerial) {
      const nos = (l.serialNos || []).map(x => x.trim()).filter(Boolean)
      if (nos.length !== qty) throw new Error(`กรอก Serial ให้ครบ ${qty} รายการสำหรับ ${item.name}`)
      for (const n of nos) {
        const sr = insert(s, 'serials', { serialNo: n, item: item.id, status: 'ในคลัง', warehouse: wh, receivedDate: todayStr() }, { force: true })
        sr.history = []
        ids.push(sr.id)
      }
    }
    createMove(s, { type: 'receive', item: l.item, qty, serials: ids, to: wh, po: po.id, project: po.project, note: l.note || 'ตรวจรับตามใบสั่งซื้อ' }, { force: true })
  }
  if (!any) throw new Error('ยังไม่ได้ระบุจำนวนที่รับ')
  if (reqId) s.processed[reqId] = poId
  const after = poReceived(s, po)
  const full = po.lines.every(l => (after[l.item] || 0) >= po.lines.filter(x => x.item === l.item).reduce((a, x) => a + Number(x.qty || 0), 0))
  const ns = full ? 'received' : 'partial'
  if (po.status !== ns) { po.status = ns }
  audit(s, 'receive', 'purchaseOrders', po, `รับสินค้าตาม ${po.code} → ${ns === 'received' ? 'รับครบ' : 'รับบางส่วน'}`)
}
export function poReceived(s, po) {
  const g = {}
  for (const m of s.data.stockMoves || []) if (!m._deleted && m.po === po.id && m.type === 'receive') g[m.item] = (g[m.item] || 0) + m.qty
  return g
}

export function poAmount(po) {
  return (po.lines || []).reduce((a, l) => a + Number(l.qty || 0) * Number(l.unitPrice || 0), 0)
}
export function changePoStatus(s, id, to, opts = {}) {
  const po = mustGet(s, 'purchaseOrders', id)
  const wf = s.config.workflows.po
  const from = wf.statuses.find(x => x.key === po.status)
  const target = wf.statuses.find(x => x.key === to)
  if (!target) throw new Error('สถานะไม่ถูกต้อง')
  if (!opts.force) {
    need(s, 'purchase', 'edit')
    if (from.next.length === 0 || !from.next.includes(to)) throw new Error(`ไม่สามารถเปลี่ยนจาก "${from.label}" เป็น "${target.label}"`)
    if (target.needClosePerm) need(s, 'purchase', 'close')
  }
  if (to === 'ordered' && !po.lines?.length) throw new Error('ใบสั่งซื้อต้องมีรายการ')
  // approval: status config first, otherwise amount limits (set by admin)
  let cfg = hasApprover(target) ? target : null
  if (!cfg && to === 'ordered') {
    const amt = poAmount(po)
    const lim = [...(wf.limits || [])].filter(l => l.upTo !== '' && l.upTo != null).sort((a, b) => a.upTo - b.upTo).find(l => amt <= Number(l.upTo))
    if (lim && (lim.approverRole || lim.approverUser)) cfg = lim
  }
  if (!opts.force && cfg && !isApprover(s, cfg)) {
    requestApproval(s, { kind: 'po-status', entity: 'purchaseOrders', recId: id, key: to, title: `${po.code} → ${target.label}`, payload: { to }, cfg: { approverRole: cfg.approverRole, approverUser: cfg.approverUser } })
    return { pending: true }
  }
  po.status = to
  po._updatedAt = nowIso(); po._updatedBy = cur(s)?.id
  audit(s, 'status', 'purchaseOrders', po, `เปลี่ยนสถานะ ${po.code}: ${from.label} → ${target.label}`)
  return { pending: false }
}

// ---------- tickets: parts ----------
export function addTicketPart(s, id, p, reqId) {
  need(s, 'tickets', 'edit')
  const t = mustGet(s, 'tickets', id)
  if (reqId && s.processed[reqId]) return
  t.parts = t.parts || []
  const item = getRec(s, 'items', p.item)
  if (!item) throw new Error('กรุณาเลือกอุปกรณ์/อะไหล่')
  const qty = Number(p.qty || 1)
  const part = { id: uid(), at: nowIso(), by: cur(s)?.id, action: p.action, item: p.item, qty, serials: p.serials || [], oldSerial: p.oldSerial || null, note: p.note || '' }
  if (p.action === 'เบิก' || p.action === 'เปลี่ยน') {
    if (!p.from) throw new Error('กรุณาเลือกคลังที่เบิก')
    if (p.action === 'เปลี่ยน' && item.trackSerial && !p.oldSerial) throw new Error('กรุณาเลือก Serial เดิมที่ถูกเปลี่ยน')
    const mv = createMove(s, { type: 'issue', item: p.item, qty, serials: p.serials || [], from: p.from, ticket: id, site: t.site, project: t.project, recipient: label(s, 'users', cur(s)?.id), note: `${p.action}สำหรับ ${t.code}` }, { force: true })
    part.moveId = mv.id
    for (const sid of part.serials) {
      const sr = getRec(s, 'serials', sid)
      if (p.action === 'เปลี่ยน') markInstalled(s, sid, { site: t.site, location: t.point, date: todayStr() })
      else serialLog(s, sr, 'ticket', `เบิกสำหรับ Ticket ${t.code}`, { entity: 'tickets', id })
      serialLog(s, getRec(s, 'serials', sid), 'ticket', `ใช้ใน Ticket ${t.code} (${p.action})`, { entity: 'tickets', id })
    }
    if (p.action === 'เปลี่ยน' && p.oldSerial) {
      const old = getRec(s, 'serials', p.oldSerial)
      if (old) { old.status = 'เปลี่ยนแล้ว'; old.site = old.site; serialLog(s, old, 'replace', `ถูกเปลี่ยนออกใน Ticket ${t.code}`, { entity: 'tickets', id }) }
    }
  } else if (p.action === 'ส่งซ่อม') {
    if (!p.oldSerial) throw new Error('กรุณาเลือก Serial ที่ส่งซ่อม')
    const sr = getRec(s, 'serials', p.oldSerial)
    sr.status = 'ส่งซ่อม'; sr.warehouse = p.to || sr.warehouse
    serialLog(s, sr, 'repair', `ส่งซ่อมจาก Ticket ${t.code}${p.note ? ' — ' + p.note : ''}`, { entity: 'tickets', id })
    part.qty = 1; part.serials = [p.oldSerial]
  } else if (p.action === 'ส่งคืน') {
    if (!p.to) throw new Error('กรุณาเลือกคลังที่รับคืน')
    const mv = createMove(s, { type: 'return', item: p.item, qty, serials: p.serials || [], to: p.to, ticket: id, site: t.site, note: `ส่งคืนจาก ${t.code}` }, { force: true })
    part.moveId = mv.id
  } else throw new Error('เลือกประเภทรายการ')
  t.parts.push(part)
  addTimeline(s, id, 'part', `${p.action}: ${item.name} x${part.qty}${p.note ? ' — ' + p.note : ''}`)
  audit(s, 'part', 'tickets', t, `${p.action}อะไหล่/อุปกรณ์ใน ${t.code}: ${item.name} x${part.qty}`)
  if (reqId) s.processed[reqId] = id
}

export function ticketMetrics(t, now = new Date()) {
  const end = t.closedAt ? new Date(t.closedAt) : now
  return {
    ageH: (end - new Date(t.receivedAt)) / 3600000,
    responseH: t.respondedAt ? (new Date(t.respondedAt) - new Date(t.receivedAt)) / 3600000 : null,
    resolveH: t.resolvedAt ? (new Date(t.resolvedAt) - new Date(t.receivedAt)) / 3600000 : null
  }
}
export const isOpenTicket = (s, t) => !t._deleted && !ticketStatusOf(s, t.status)?.final

// ---------- projects ----------
export function newSteps(s) {
  const o = {}
  s.config.workflows.project.steps.forEach(st => { o[st.key] = { status: 'pending', values: {}, docs: {}, log: [] } })
  return o
}
export function createProject(s, values, reqId) {
  const p = insert(s, 'projects', { ...values, steps: newSteps(s), closed: false }, { reqId })
  if (p.steps.req) p.steps.req.status = 'doing'
  return p
}
export function projectLog(s, p, key, text) {
  const st = p.steps[key]
  if (!st) return
  st.log = st.log || []
  st.log.push({ id: uid(), at: nowIso(), by: cur(s)?.id, text })
  p._updatedAt = nowIso(); p._updatedBy = cur(s)?.id
}
export function stepsOf(s, p) {
  return s.config.workflows.project.steps.filter(x => x.enabled).map(cfg => ({ cfg, st: p.steps?.[cfg.key] || { status: 'pending', values: {}, docs: {} } }))
}
export function currentStep(s, p) {
  return stepsOf(s, p).find(x => !['done', 'skipped'].includes(x.st.status))
}
export function projectStatus(s, p) {
  if (p._deleted) return 'ยกเลิก'
  if (p.closed) return 'ปิดโครงการ: ' + (p.closeReason || '')
  const c = currentStep(s, p)
  return c ? c.cfg.label : 'ครบทุกขั้นตอน'
}
export function saveStep(s, projectId, key, d) {
  need(s, 'projects', 'edit')
  const p = mustGet(s, 'projects', projectId)
  if (!inScope(s, 'projects', p)) throw new Error('ไม่มีสิทธิ์เข้าถึงรายการนี้')
  if (p.closed) throw new Error('โครงการถูกปิดแล้ว')
  const st = (p.steps[key] = p.steps[key] || { status: 'pending', values: {}, docs: {} })
  const before = structuredClone(st)
  if (d.values) st.values = { ...st.values, ...d.values }
  for (const k of ['plannedDate', 'owner', 'notes']) if (d[k] !== undefined) st[k] = d[k]
  p._updatedAt = nowIso(); p._updatedBy = cur(s)?.id
  const cfg = s.config.workflows.project.steps.find(x => x.key === key)
  const ch = []
  for (const k of Object.keys(st.values || {})) if (!same(before.values?.[k], st.values[k])) ch.push({ field: cfg?.fields.find(f => f.key === k)?.label || k, from: before.values?.[k], to: st.values[k] })
  for (const k of ['plannedDate', 'owner', 'notes']) if (!same(before[k], st[k])) ch.push({ field: k === 'plannedDate' ? 'วันที่วางแผน' : k === 'owner' ? 'ผู้รับผิดชอบขั้นตอน' : 'หมายเหตุขั้นตอน', from: before[k], to: st[k] })
  if (ch.length) audit(s, 'update', 'projects', p, `แก้ไขข้อมูลขั้นตอน "${cfg?.label}" ของ ${p.code}`, ch)
}
export function addStepDocs(s, projectId, key, docKey, files) {
  need(s, 'projects', 'edit')
  const p = mustGet(s, 'projects', projectId)
  const st = (p.steps[key] = p.steps[key] || { status: 'pending', values: {}, docs: {} })
  st.docs = st.docs || {}
  st.docs[docKey] = [...(st.docs[docKey] || []), ...files.map(f => ({ name: f.name, size: f.size, at: nowIso(), by: cur(s)?.id }))]
  projectLog(s, p, key, `แนบเอกสาร: ${files.map(f => f.name).join(', ')}`)
  audit(s, 'attach', 'projects', p, `แนบเอกสาร ${files.map(f => f.name).join(', ')} (${key})`)
}
export function removeStepDoc(s, projectId, key, docKey, idx, reason) {
  need(s, 'projects', 'edit')
  if (!(reason || '').trim()) throw new Error('ต้องระบุเหตุผลการนำไฟล์ออก')
  const p = mustGet(s, 'projects', projectId)
  const f = p.steps[key].docs[docKey][idx]
  p.steps[key].docs[docKey].splice(idx, 1)
  projectLog(s, p, key, `นำไฟล์ออก: ${f.name} — ${reason}`)
  audit(s, 'detach', 'projects', p, `นำไฟล์ออก ${f.name} — ${reason}`)
}

export function transitStep(s, projectId, key, action, opts = {}) {
  const p = mustGet(s, 'projects', projectId)
  const cfg = s.config.workflows.project.steps.find(x => x.key === key)
  if (!cfg) throw new Error('ไม่พบขั้นตอน')
  const st = (p.steps[key] = p.steps[key] || { status: 'pending', values: {}, docs: {} })
  if (!opts.force) {
    need(s, 'projects', 'edit')
    if (!inScope(s, 'projects', p)) throw new Error('ไม่มีสิทธิ์เข้าถึงรายการนี้')
  }
  if (p.closed && action !== 'reopen') throw new Error('โครงการถูกปิดแล้ว')
  if (action === 'start') {
    if (st.status !== 'pending') throw new Error('ขั้นตอนนี้เริ่มไปแล้ว')
    st.status = 'doing'; st.startedAt = nowIso()
    projectLog(s, p, key, 'เริ่มขั้นตอน')
  } else if (action === 'complete') {
    for (const f of cfg.fields) {
      if (f.required && isEmpty(st.values?.[f.key])) throw new Error(`ต้องกรอก "${f.label}" ก่อนจบขั้นตอน`)
    }
    if (cfg.requireDocs) {
      for (const d of cfg.docs) if (!(st.docs?.[d.key] || []).length) throw new Error(`ต้องแนบเอกสาร "${d.label}" ก่อนจบขั้นตอน`)
    }
    if (!opts.force && cfg.approvalRequired && hasApprover(cfg) && !isApprover(s, cfg)) {
      if (st.pendingApproval) throw new Error('มีคำขออนุมัติค้างอยู่แล้ว')
      requestApproval(s, { kind: 'project-step', entity: 'projects', recId: projectId, key, title: `${p.code} จบขั้นตอน ${cfg.label}`, payload: {}, cfg: { approverRole: cfg.approverRole, approverUser: cfg.approverUser } })
      st.pendingApproval = true
      projectLog(s, p, key, 'ขออนุมัติจบขั้นตอน')
      return { pending: true }
    }
    st.status = 'done'; st.doneAt = nowIso(); st.actualDate = st.actualDate || todayStr(); delete st.pendingApproval
    projectLog(s, p, key, `จบขั้นตอน${opts.approvedBy ? ` (อนุมัติโดย ${opts.approvedBy})` : ''}`)
    if (key === 'bid' && st.values?.bidResult === 'ไม่ชนะ') {
      p.closed = true; p.closeReason = 'ไม่ชนะการเสนอราคา/ประมูล'
      audit(s, 'close', 'projects', p, `ปิดโครงการ ${p.code}: ไม่ชนะ`)
    }
    if (key === 'bid' && st.values?.bidResult === 'รอผล') throw new Error('ผลยังเป็น "รอผล" — เลือกชนะ/ไม่ชนะก่อนจบขั้นตอน')
    const nxt = currentStep(s, p)
    if (nxt && nxt.st.status === 'pending' && !p.closed) { p.steps[nxt.cfg.key].status = 'doing'; p.steps[nxt.cfg.key].startedAt = nowIso() }
  } else if (action === 'skip') {
    if (!(opts.reason || '').trim()) throw new Error('ต้องระบุเหตุผลที่ข้ามขั้นตอน')
    st.status = 'skipped'; projectLog(s, p, key, `ข้ามขั้นตอน — ${opts.reason}`)
  } else if (action === 'reopen') {
    if (!(opts.reason || '').trim()) throw new Error('ต้องระบุเหตุผลที่เปิดขั้นตอนใหม่')
    st.status = 'doing'; delete st.doneAt; projectLog(s, p, key, `เปิดขั้นตอนใหม่ — ${opts.reason}`)
    if (p.closed) { need(s, 'projects', 'close'); p.closed = false; p.closeReason = '' }
  }
  audit(s, 'step', 'projects', p, `ขั้นตอน "${cfg.label}" (${p.code}): ${action}${opts.reason ? ' — ' + opts.reason : ''}`)
  return { pending: false }
}
export function closeProject(s, id, reason) {
  need(s, 'projects', 'close')
  if (!(reason || '').trim()) throw new Error('ต้องระบุเหตุผลการปิดโครงการ')
  const p = mustGet(s, 'projects', id)
  p.closed = true; p.closeReason = reason.trim(); p._updatedAt = nowIso(); p._updatedBy = cur(s)?.id
  audit(s, 'close', 'projects', p, `ปิดโครงการ ${p.code} — ${reason}`)
}

// ---------- PM ----------
export const FREQ_DAYS = { 'รายวัน': 1, 'รายสัปดาห์': 7, 'รายเดือน': 'm1', 'รายไตรมาส': 'm3' }
export function nextDue(date, freq) {
  const d = new Date(date)
  const f = FREQ_DAYS[freq]
  if (typeof f === 'number') return addDays(d, f)
  const n = new Date(d)
  n.setMonth(n.getMonth() + Number(f.slice(1)))
  return n
}
export function generatePm(s, upTo) {
  need(s, 'pm', 'create')
  const limit = new Date(upTo), floor = addDays(new Date(), -45)
  let made = 0
  for (const plan of s.data.pmPlans || []) {
    if (plan._deleted || !plan.active) continue
    const tpl = getRec(s, 'pmTemplates', plan.template)
    let d = new Date(plan.startDate), guard = 0
    while (d <= limit && guard++ < 500) {
      const key = ymd(d)
      if (d >= floor && !(s.data.pmRecords || []).some(r => r.plan === plan.id && r.dueDate === key)) {
        const rec = insert(s, 'pmRecords', {
          plan: plan.id, site: plan.site, customer: plan.customer, team: plan.team, assignee: plan.assignee,
          dueDate: key, status: 'รอดำเนินการ', templateName: tpl?.name || '',
          results: (tpl?.items || []).map(i => ({ label: i.label, result: '', note: '', action: '', ticket: null }))
        }, { force: true })
        made++
        void rec
      }
      d = nextDue(d, plan.frequency)
    }
  }
  if (made) audit(s, 'generate', 'pmRecords', null, `สร้างงาน PM ตามรอบ ${made} งาน`)
  return made
}
export function savePm(s, id, d) {
  need(s, 'pm', 'edit')
  const r = mustGet(s, 'pmRecords', id)
  if (r.status === 'เสร็จ') throw new Error('งาน PM นี้เสร็จแล้ว แก้ไขไม่ได้')
  r.results = d.results; r.summary = d.summary || ''
  r.status = d.finish ? 'เสร็จ' : 'กำลังตรวจ'
  if (d.finish) {
    if (r.results.some(x => !x.result)) throw new Error('กรุณาบันทึกผลตรวจให้ครบทุกรายการก่อนปิดงาน')
    const bad = r.results.find(x => x.result === 'ผิดปกติ' && !(x.note || '').trim())
    if (bad) throw new Error(`รายการ "${bad.label}" ผิดปกติ ต้องระบุรายละเอียด/วิธีแก้`)
    r.doneAt = nowIso(); r.doneBy = cur(s).id
  }
  r._updatedAt = nowIso(); r._updatedBy = cur(s).id
  audit(s, d.finish ? 'close' : 'update', 'pmRecords', r, `${d.finish ? 'ปิดงาน' : 'บันทึก'} ${r.code}`)
}
export function pmToTicket(s, recId, idx) {
  need(s, 'tickets', 'create')
  const r = mustGet(s, 'pmRecords', recId)
  const it = r.results[idx]
  if (it.ticket) throw new Error('สร้าง Ticket ติดตามแล้ว')
  const site = getRec(s, 'sites', r.site)
  const t = insertTicket(s, {
    title: `ติดตามจาก PM: ${it.label}`, reportedBy: cur(s).name, channel: 'อื่นๆ', receivedAt: nowIso(),
    customer: site?.customer, site: r.site, category: 'PM', priority: 'ปกติ',
    symptom: `${it.label}: ${it.note || 'ผิดปกติ'}`, team: r.team, assignee: r.assignee || null, pmRecord: recId
  })
  it.ticket = t.id
  audit(s, 'update', 'pmRecords', r, `สร้าง Ticket ติดตาม ${t.code} จาก ${r.code}`)
  return t
}
export function insertTicket(s, values, reqId) {
  const t = insert(s, 'tickets', { ...values, status: 'received', timeline: [], appointments: [], parts: [] }, { reqId })
  if (!t.timeline.length) addTimeline(s, t.id, 'status', `เปิดเคส (${t.channel || 'ไม่ระบุช่องทาง'}) โดย ${cur(s)?.name}`)
  return t
}

// ---------- users / auth ----------
export function setupAdmin(s, values) {
  if (s.users.some(user => user.active !== false)) throw new Error('ระบบมีผู้ใช้งานแล้ว กรุณาเข้าสู่ระบบ')

  const username = String(values.username || '').trim().toLowerCase()
  const name = String(values.name || '').trim()
  const password = String(values.password || '')
  if (!/^[a-z0-9._-]{3,50}$/.test(username)) throw new Error('ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ ตัวเลข จุด ขีดกลาง หรือขีดล่าง 3–50 ตัวอักษร')
  if (!name) throw new Error('กรุณากรอกชื่อผู้ดูแลระบบ')
  if (password.length < 8) throw new Error('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')

  const user = {
    id: uid(), username, name, roleId: 'admin', dept: '', team: '', projectIds: [], siteIds: [],
    active: true, pwHash: hashPw(password)
  }
  s.users.push(user)
  s.session = user.id
  audit(s, 'setup', 'users', { id: user.id, code: username }, `สร้างผู้ดูแลระบบ ${name}`)
  return user
}

export function login(s, username, pw) {
  const u = s.users.find(x => x.username === (username || '').trim().toLowerCase() && x.active !== false)
  if (!u || u.pwHash !== hashPw(pw || '')) throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
  s.session = u.id
  audit(s, 'login', 'users', { id: u.id, code: u.username }, `เข้าสู่ระบบ ${u.name}`)
}
export function logout(s) {
  if (s.session) audit(s, 'logout', 'users', null, 'ออกจากระบบ')
  s.session = null
}
export function saveUser(s, u, newPw) {
  need(s, 'settings', 'edit')
  const username = (u.username || '').trim().toLowerCase()
  if (!username || !u.name?.trim()) throw new Error('กรอกชื่อผู้ใช้และชื่อ-สกุล')
  if (s.users.some(x => x.username === username && x.id !== u.id)) throw new Error('ชื่อผู้ใช้ซ้ำ')
  let rec = s.users.find(x => x.id === u.id)
  if (!rec) {
    if (!newPw || newPw.length < 6) throw new Error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
    rec = { id: uid(), pwHash: hashPw(newPw), active: true }
    s.users.push(rec)
  } else if (newPw) {
    if (newPw.length < 6) throw new Error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
    rec.pwHash = hashPw(newPw)
  }
  if (rec.id === s.session && (u.active === false || u.roleId !== rec.roleId) && roleOf(s, rec)?.isAdmin) {
    if (s.users.filter(x => x.id !== rec.id && x.active !== false && roleOf(s, x)?.isAdmin).length === 0) throw new Error('ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน')
  }
  Object.assign(rec, { username, name: u.name.trim(), roleId: u.roleId, dept: u.dept || '', team: u.team || '', projectIds: u.projectIds || [], siteIds: u.siteIds || [], active: u.active !== false })
  audit(s, 'user', 'users', { id: rec.id, code: username }, `บันทึกผู้ใช้ ${rec.name}${newPw ? ' (ตั้งรหัสผ่านใหม่)' : ''}`)
}

// ---------- config ----------
export function applyConfig(s, next, labelText, summary) {
  need(s, 'settings', 'edit')
  s.config = structuredClone(next)
  const v = { id: uid(), no: (s.configVersions[s.configVersions.length - 1]?.no || 0) + 1, at: nowIso(), by: cur(s).id, label: labelText, summary: summary || [], config: structuredClone(next) }
  s.configVersions.push(v)
  if (s.configVersions.length > 30) s.configVersions.splice(0, s.configVersions.length - 30)
  audit(s, 'config', 'settings', { id: v.id, code: 'v' + v.no }, `ใช้การตั้งค่าเวอร์ชัน ${v.no}: ${labelText}`, (summary || []).map(x => ({ field: x.text, from: '', to: '' })))
  return v
}
export function saveConfirmation(s, id, answer, status) {
  need(s, 'settings', 'edit')
  const c = s.confirmations.find(x => x.id === id)
  c.answer = answer; c.status = status
  c.by = cur(s).id; c.at = nowIso()
  audit(s, 'confirm', 'settings', { id, code: id }, `บันทึกการยืนยัน: ${c.topic} → ${status}`)
}

// manual goods receipt (without PO), creates serial records for tracked items
export function receiveManual(s, d, reqId) {
  need(s, 'warehouse', 'create')
  if (reqId && s.processed[reqId]) return
  const item = getRec(s, 'items', d.item)
  if (!item) throw new Error('กรุณาเลือกสินค้า')
  if (!d.to) throw new Error('กรุณาเลือกคลังปลายทาง')
  let ids = []
  let qty = Number(d.qty)
  if (item.trackSerial) {
    const nos = (d.serialNos || []).map(x => x.trim()).filter(Boolean)
    if (!nos.length) throw new Error('กรุณาระบุ Serial Number')
    qty = nos.length
    for (const n of nos) {
      const sr = insert(s, 'serials', { serialNo: n, item: item.id, status: 'ในคลัง', warehouse: d.to, receivedDate: todayStr() }, { force: true })
      ids.push(sr.id)
    }
  }
  const mv = createMove(s, { type: 'receive', item: d.item, qty, serials: ids, to: d.to, recipient: d.recipient, evidence: d.evidence, note: d.note || 'รับเข้าโดยไม่มี PO' }, { force: true })
  if (reqId) s.processed[reqId] = mv.id
  return mv
}

// ---------- user-built modules: status workflow & timeline ----------
export function addTimelineGeneric(s, entity, id, type, text, extra = {}) {
  const r = mustGet(s, entity, id)
  r.timeline = r.timeline || []
  r.timeline.push({ id: uid(), at: nowIso(), by: cur(s)?.id, type, text, ...extra })
  r._updatedAt = nowIso(); r._updatedBy = cur(s)?.id
}
export function moduleNote(s, entity, id, text) {
  need(s, ENT[entity].res, 'edit')
  if (!(text || '').trim()) throw new Error('กรุณากรอกข้อความ')
  const r = mustGet(s, entity, id)
  if (!inScope(s, entity, r)) throw new Error('ไม่มีสิทธิ์เข้าถึงรายการนี้')
  addTimelineGeneric(s, entity, id, 'note', text.trim())
  audit(s, 'note', entity, r, `บันทึกข้อความใน ${r.code}`)
}
export function changeModuleStatus(s, entity, id, to, opts = {}) {
  const wf = s.config.workflows[entity]
  if (!wf) throw new Error('โมดูลนี้ไม่มีสถานะ')
  const r = mustGet(s, entity, id)
  const from = wf.statuses.find(x => x.key === r.status)
  const target = wf.statuses.find(x => x.key === to)
  if (!target || !target.enabled) throw new Error('สถานะปลายทางไม่ถูกต้อง')
  if (!opts.force) {
    need(s, ENT[entity].res, 'edit')
    if (!inScope(s, entity, r)) throw new Error('ไม่มีสิทธิ์เข้าถึงรายการนี้')
    if (from && from.next?.length && !from.next.includes(to)) throw new Error(`ไม่สามารถเปลี่ยนจาก "${from.label}" เป็น "${target.label}"`)
    if (target.needClosePerm) need(s, ENT[entity].res, 'close')
  }
  if (r.status === to) throw new Error('อยู่ในสถานะนี้แล้ว')
  if (from?.final && !(opts.comment || '').trim()) throw new Error('การเปิดรายการที่จบแล้วต้องระบุเหตุผล')
  const merged = { ...r, ...(opts.fields || {}) }
  for (const k of target.requiredFields || []) {
    if (isEmpty(merged[k])) {
      const fl = fieldsOf(s, entity).find(f => f.key === k)?.label || k
      throw new Error(`ต้องกรอก "${fl}" ก่อนเปลี่ยนเป็น "${target.label}"`)
    }
  }
  if (!opts.force && hasApprover(target) && !isApprover(s, target)) {
    requestApproval(s, { kind: 'module-status', entity, recId: id, key: to, title: `${r.code} → ${target.label}`, payload: { to, comment: opts.comment, fields: opts.fields }, cfg: { approverRole: target.approverRole, approverUser: target.approverUser } })
    addTimelineGeneric(s, entity, id, 'approval', `ขออนุมัติเปลี่ยนสถานะเป็น "${target.label}"`)
    return { pending: true }
  }
  const before = structuredClone(r)
  Object.assign(r, opts.fields || {})
  r.status = to
  addTimelineGeneric(s, entity, id, 'status', `${from?.label || '–'} → ${target.label}${opts.comment ? ' — ' + opts.comment : ''}${opts.approvedBy ? ` (อนุมัติโดย ${opts.approvedBy})` : ''}`)
  audit(s, 'status', entity, r, `เปลี่ยนสถานะ ${r.code}: ${from?.label} → ${target.label}`, diffOf(s, entity, before, r))
  return { pending: false }
}
// reverse relations: records in other modules/entities that point at this one
export function reverseRefs(s, entity, id) {
  const out = []
  for (const [e, fs] of Object.entries(s.config.fields)) {
    for (const f of fs) {
      if (f.type === 'ref' && f.ref === entity && ENT[e]) {
        const list = rows(s, e).filter(r => r[f.key] === id)
        if (list.length) out.push({ entity: e, field: f.label, list })
      }
    }
  }
  return out
}
