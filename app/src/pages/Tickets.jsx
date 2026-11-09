import React, { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useApp, Page, DataTable, Modal, FormFields, FieldInput, Badge, Val, Empty, ErrorBox, History, Kv, Tabs, useSubmit, toast, RefLink } from '../components/ui'
import { act } from '../lib/store'
import * as db from '../lib/db'
import { RecordForm } from './Entity'
import { fmtDateTime, fmtDuration, uid, todayStr } from '../lib/util'

export function bucketLabel(h, edges) {
  const e = [...edges].sort((a, b) => a - b)
  if (!e.length) return 'ทั้งหมด'
  if (h < e[0]) return `< ${e[0]} ชม.`
  for (let i = 1; i < e.length; i++) if (h < e[i]) return `${e[i - 1]}–${e[i]} ชม.`
  return `${e[e.length - 1]}+ ชม.`
}
export function bucketList(edges) {
  const e = [...edges].sort((a, b) => a - b)
  return e.length ? [`< ${e[0]} ชม.`, ...e.slice(1).map((x, i) => `${e[i]}–${x} ชม.`), `${e[e.length - 1]}+ ชม.`] : []
}
// escalation level (0 = none) only when admin confirmed + enabled
export function escLevel(s, h) {
  const es = s.config.escalation
  if (!es.enabled || !es.confirmed) return 0
  return es.rules.filter(r => h >= Number(r.afterHours)).length
}

export default function Tickets() {
  const { s, can } = useApp()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const edges = s.config.escalation.buckets
  const st = db.fieldsOf(s, 'tickets')
  const statuses = s.config.workflows.ticket.statuses
  const data = db.rows(s, 'tickets').map(t => {
    const m = db.ticketMetrics(t)
    return { ...t, ageH: m.ageH, bucket: bucketLabel(m.ageH, edges), open: db.isOpenTicket(s, t) ? 'เคสค้าง' : 'ปิดแล้ว', statusLabel: db.ticketStatusOf(s, t.status)?.label, _search: [t.symptom, t.point, t.circuitNo].join(' ') }
  })
  const init = {}
  if (sp.get('status')) init.status = sp.get('status')
  if (sp.get('open')) init.open = sp.get('open')
  if (sp.get('bucket')) init.bucket = sp.get('bucket')
  if (sp.get('team')) init.team = sp.get('team')
  if (sp.get('assignee')) init.assignee = sp.get('assignee')
  const cols = [
    { key: 'code', label: 'เลขที่', render: r => <span className="mono">{r.code}</span> },
    { key: 'title', label: 'หัวข้อ', render: r => <div><b>{r.title}</b><div className="sub">{db.label(s, 'sites', r.site)}{r.point ? ' · ' + r.point : ''}</div></div> },
    { key: 'customer', label: 'ลูกค้า', value: r => db.label(s, 'customers', r.customer) },
    { key: 'site', label: 'ไซต์', value: r => db.label(s, 'sites', r.site) },
    { key: 'category', label: 'หมวดงาน' },
    { key: 'priority', label: 'เร่งด่วน', render: r => <Badge color={{ เร่งด่วน: 'red', สูง: 'amber' }[r.priority] || 'gray'}>{r.priority}</Badge> },
    { key: 'statusLabel', label: 'สถานะ', render: r => <Badge color={db.ticketStatusOf(s, r.status)?.color}>{r.statusLabel}</Badge> },
    { key: 'assignee', label: 'ผู้รับผิดชอบ', value: r => db.label(s, 'users', r.assignee) },
    { key: 'ageH', label: 'อายุเคส', value: r => Math.round(r.ageH * 10) / 10, render: r => fmtDuration(r.ageH) }
  ]
  return (
    <Page title="Service Ticket" subtitle="รับแจ้งเหตุ ซ่อม และบำรุงรักษา" actions={can('tickets', 'create') && <button className="btn primary" onClick={() => nav('/tickets/new')}>+ เปิดเคสใหม่</button>}>
      <DataTable key={sp.toString()} columns={cols} data={data} onRow={r => nav('/tickets/' + r.id)} exportName="tickets" canExport={can('tickets', 'export')} initialFilters={init} initialTab={Object.keys(init).length ? 'all' : 'open'}
        tabs={[{ key: 'open', label: 'กำลังดำเนินการ', test: r => r.open === 'เคสค้าง' && !String(r.status).startsWith('wait') }, { key: 'wait', label: 'รอ', test: r => r.open === 'เคสค้าง' && String(r.status).startsWith('wait') }, { key: 'closed', label: 'ปิดแล้ว', test: r => r.open === 'ปิดแล้ว' }, { key: 'all', label: 'ทั้งหมด' }]}
        initialSort={{ key: 'ageH', dir: -1 }}
        rowClass={r => (r.open === 'เคสค้าง' ? ['', 'hl-1', 'hl-2', 'hl-3', 'hl-3'][Math.min(4, escLevel(s, r.ageH))] : '')}
        searchPlaceholder="ค้นหาเลขที่ หัวข้อ อาการ จุดติดตั้ง วงจร…"
        filters={[
          { key: 'open', label: 'สถานะเคส', options: ['เคสค้าง', 'ปิดแล้ว'], get: r => r.open },
          { key: 'status', label: 'สถานะ', options: statuses.map(x => [x.key, x.label]), get: r => r.status },
          { key: 'category', label: 'หมวดงาน', options: db.optionsOf(s, st.find(f => f.key === 'category') || {}), get: r => r.category },
          { key: 'priority', label: 'ความเร่งด่วน', options: db.optionsOf(s, st.find(f => f.key === 'priority') || {}), get: r => r.priority },
          { key: 'team', label: 'ทีม', options: s.config.lists.teams, get: r => r.team },
          { key: 'bucket', label: 'อายุเคส', options: bucketList(edges), get: r => r.bucket },
          { key: 'assignee', label: 'ผู้รับผิดชอบ', options: s.users.map(u => [u.id, u.name]), get: r => r.assignee }
        ]} />
    </Page>
  )
}

export function TicketNew() {
  const { s, can } = useApp()
  const nav = useNavigate()
  const [values, setValues] = useState({ receivedAt: new Date().toISOString(), priority: 'ปกติ', status: 'received' })
  const [errors, setErrors] = useState({})
  const reqId = React.useRef(uid())
  const [busy, run] = useSubmit()
  if (!can('tickets', 'create')) return <Page title="เปิดเคสใหม่"><ErrorBox error="ไม่มีสิทธิ์สร้าง Ticket" /></Page>
  const setV = fn => setValues(prev => {
    const n = typeof fn === 'function' ? fn(prev) : fn
    if (n.site !== prev.site && n.site) {
      const site = db.getRec(s, 'sites', n.site)
      if (site && !n.customer) n.customer = site.customer
      if (site && !n.team && site.team) n.team = site.team
    }
    if (n.serial !== prev.serial && n.serial) {
      const sr = db.getRec(s, 'serials', n.serial)
      if (sr) { n.item = n.item || sr.item; n.site = n.site || sr.site; n.customer = n.customer || sr.customer; n.point = n.point || sr.location }
    }
    return { ...n }
  })
  const save = async () => {
    const { status, ...v } = values
    const r = await run(() => act(st => db.insertTicket(st, v, reqId.current)))
    if (r.ok) { toast('เปิดเคสแล้ว'); nav('/tickets/' + r.data.id) }
    else if (r.error !== 'busy') setErrors(r.fieldErrors || { _: r.error })
  }
  const fields = db.fieldsOf(s, 'tickets').filter(f => !['cause', 'resolution', 'remarks', 'initialFinding'].includes(f.key))
  return (
    <Page title="เปิดเคสใหม่" subtitle="บันทึกการรับแจ้งเหตุ" actions={<button className="btn" onClick={() => nav('/tickets')}>‹ ยกเลิก</button>}>
      <div className="card">
        {errors._ && <div className="notice bad" role="alert">{errors._}</div>}
        <FormFields fields={fields} values={values} setValues={setV} errors={errors} />
        <div className="row" style={{ marginTop: 14 }}><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'เปิดเคส'}</button></div>
      </div>
    </Page>
  )
}

// ---------- status change ----------
function StatusModal({ t, onClose, preset }) {
  const { s } = useApp()
  const wf = s.config.workflows.ticket.statuses
  const from = wf.find(x => x.key === t.status)
  const options = wf.filter(x => x.enabled && (!from?.next?.length || from.next.includes(x.key)))
  const [to, setTo] = useState(options.some(o => o.key === preset) ? preset : options[0]?.key || '')
  const [comment, setComment] = useState('')
  const [fields, setFields] = useState({})
  const [err, setErr] = useState('')
  const [busy, run] = useSubmit()
  const target = wf.find(x => x.key === to)
  const ff = db.fieldsOf(s, 'tickets')
  const need = (target?.requiredFields || []).map(k => ff.find(f => f.key === k)).filter(Boolean)
  const go = async () => {
    const r = await run(() => act(st => db.changeTicketStatus(st, t.id, to, { comment, fields })))
    if (r.ok) { toast(r.data.pending ? 'ส่งคำขออนุมัติแล้ว' : 'เปลี่ยนสถานะแล้ว'); onClose() } else if (r.error !== 'busy') setErr(r.error)
  }
  return (
    <Modal title={`เปลี่ยนสถานะ ${t.code}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn primary" disabled={busy || !to} onClick={go}>ยืนยัน</button></>}>
      <p>สถานะปัจจุบัน: <Badge color={from?.color}>{from?.label}</Badge></p>
      {from?.final && <div className="notice warn">เคสนี้ปิดแล้ว — การเปิดใหม่ต้องระบุเหตุผลในช่องหมายเหตุ</div>}
      {options.length === 0 ? <Empty text="ไม่มีสถานะถัดไปที่เปลี่ยนได้" /> : (
        <>
          <div className="field"><label>เปลี่ยนเป็น</label><select value={to} onChange={e => setTo(e.target.value)}>{options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}</select></div>
          {(target?.approverRole || target?.approverUser) && <div className="notice warn small" style={{ marginTop: 8 }}>สถานะนี้ต้องได้รับการอนุมัติก่อนมีผล</div>}
          {need.map(f => <div key={f.key} style={{ marginTop: 10 }}><FieldInput f={{ ...f, required: true }} value={fields[f.key] ?? t[f.key]} onChange={v => setFields({ ...fields, [f.key]: v })} /></div>)}
          <div className="field" style={{ marginTop: 10 }}><label>หมายเหตุ/ข้อความแจ้งผู้ใช้</label><textarea rows={3} value={comment} onChange={e => setComment(e.target.value)} /></div>
        </>
      )}
      {err && <div className="err" role="alert" style={{ marginTop: 8 }}>{err}</div>}
    </Modal>
  )
}

function AssignModal({ t, onClose }) {
  const { s } = useApp()
  const [team, setTeam] = useState(t.team || '')
  const [who, setWho] = useState(t.assignee || '')
  const [note, setNote] = useState('')
  const [busy, run] = useSubmit()
  return (
    <Modal title="มอบหมาย/ส่งต่องาน" onClose={onClose} footer={<><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn primary" disabled={busy} onClick={async () => { const r = await run(() => act(st => db.assignTicket(st, t.id, team, who, note)), 'มอบหมายแล้ว'); r.ok && onClose() }}>บันทึก</button></>}>
      <div className="form-grid">
        <div className="field"><label>ทีม</label><select value={team} onChange={e => setTeam(e.target.value)}><option value="">–</option>{s.config.lists.teams.map(x => <option key={x}>{x}</option>)}</select></div>
        <div className="field"><label>ผู้รับผิดชอบ/ช่าง</label><select value={who} onChange={e => setWho(e.target.value)}><option value="">–</option>{s.users.filter(u => u.active !== false).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        <div className="field wide"><label>หมายเหตุการส่งต่อ</label><textarea value={note} onChange={e => setNote(e.target.value)} rows={2} /></div>
      </div>
    </Modal>
  )
}

function NoteModal({ t, type, onClose }) {
  const [text, setText] = useState('')
  const [busy, run] = useSubmit()
  return (
    <Modal title={type === 'remote' ? 'บันทึกการแก้ไขระยะไกล' : 'เพิ่มบันทึก/แจ้งผู้ใช้'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn primary" disabled={busy} onClick={async () => { const r = await run(() => act(st => db.ticketNote(st, t.id, type, text)), 'บันทึกแล้ว'); r.ok && onClose() }}>บันทึก</button></>}>
      <textarea rows={5} value={text} onChange={e => setText(e.target.value)} autoFocus placeholder={type === 'remote' ? 'สิ่งที่ตรวจ/แก้ไขระยะไกล ผลที่ได้' : 'ข้อความ เช่น แจ้งผลให้ผู้ใช้ ปัญหาที่ยังติดขัด'} />
    </Modal>
  )
}

function ApptModal({ t, onClose }) {
  const { s } = useApp()
  const [v, setV] = useState({ date: todayStr(), time: '09:00', tech: t.assignee || '', note: '' })
  const [busy, run] = useSubmit()
  return (
    <Modal title="นัดหมายเข้าหน้างาน" onClose={onClose} footer={<><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn primary" disabled={busy} onClick={async () => { const r = await run(() => act(st => db.addAppointment(st, t.id, v)), 'บันทึกนัดหมายแล้ว'); r.ok && onClose() }}>บันทึก</button></>}>
      <div className="form-grid">
        <div className="field"><label>วันที่ *</label><input type="date" value={v.date} onChange={e => setV({ ...v, date: e.target.value })} /></div>
        <div className="field"><label>เวลา</label><input type="time" value={v.time} onChange={e => setV({ ...v, time: e.target.value })} /></div>
        <div className="field"><label>ช่าง</label><select value={v.tech} onChange={e => setV({ ...v, tech: e.target.value })}><option value="">–</option>{s.users.filter(u => u.active !== false).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        <div className="field wide"><label>รายละเอียด</label><textarea rows={2} value={v.note} onChange={e => setV({ ...v, note: e.target.value })} /></div>
      </div>
      <p className="muted small">การนัดหมายไม่เปลี่ยนสถานะเคสอัตโนมัติ — เปลี่ยนเป็น “นัดหมายเข้าหน้างาน” ได้ที่ปุ่มเปลี่ยนสถานะ</p>
    </Modal>
  )
}

function PartModal({ t, onClose }) {
  const { s } = useApp()
  const reqId = React.useRef(uid())
  const [v, setV] = useState({ action: 'เบิก', item: t.item || '', qty: 1, from: '', to: '', serials: [], oldSerial: t.serial || '', note: '' })
  const [err, setErr] = useState('')
  const [busy, run] = useSubmit()
  const item = db.getRec(s, 'items', v.item)
  const bal = db.balances(s)
  const whs = db.rows(s, 'warehouses')
  const serialsAtWh = (s.data.serials || []).filter(x => !x._deleted && x.item === v.item && (v.action === 'ส่งคืน' ? !x.warehouse : x.warehouse === v.from))
  const siteSerials = (s.data.serials || []).filter(x => !x._deleted && (x.site === t.site || x.id === t.serial))
  const needOld = v.action === 'เปลี่ยน' || v.action === 'ส่งซ่อม'
  const go = async () => {
    const r = await run(() => act(st => db.addTicketPart(st, t.id, { ...v, qty: item?.trackSerial ? v.serials.length : v.qty }, reqId.current)))
    if (r.ok) { toast('บันทึกแล้ว'); onClose() } else if (r.error !== 'busy') setErr(r.error)
  }
  const toggle = id => setV({ ...v, serials: v.serials.includes(id) ? v.serials.filter(x => x !== id) : [...v.serials, id] })
  return (
    <Modal wide title="อะไหล่/อุปกรณ์ในเคส" onClose={onClose} footer={<><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn primary" disabled={busy} onClick={go}>บันทึก</button></>}>
      <div className="form-grid">
        <div className="field"><label>รายการ</label><select value={v.action} onChange={e => setV({ ...v, action: e.target.value, serials: [] })}>{['เบิก', 'เปลี่ยน', 'ส่งซ่อม', 'ส่งคืน'].map(x => <option key={x}>{x}</option>)}</select></div>
        <div className="field"><label>สินค้า/อะไหล่</label><select value={v.item} onChange={e => setV({ ...v, item: e.target.value, serials: [] })}><option value="">–</option>{db.rows(s, 'items').map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        {['เบิก', 'เปลี่ยน'].includes(v.action) && <div className="field"><label>เบิกจากคลัง</label><select value={v.from} onChange={e => setV({ ...v, from: e.target.value, serials: [] })}><option value="">–</option>{whs.map(w => <option key={w.id} value={w.id}>{w.name} (คงเหลือ {bal[w.id]?.[v.item] || 0})</option>)}</select></div>}
        {['ส่งซ่อม', 'ส่งคืน'].includes(v.action) && <div className="field"><label>คลังที่รับ</label><select value={v.to} onChange={e => setV({ ...v, to: e.target.value })}><option value="">–</option>{whs.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>}
        {needOld && <div className="field"><label>Serial เดิม (ตัวที่ชำรุด)</label><select value={v.oldSerial} onChange={e => setV({ ...v, oldSerial: e.target.value })}><option value="">–</option>{siteSerials.map(x => <option key={x.id} value={x.id}>{x.serialNo} · {db.label(s, 'items', x.item)}</option>)}</select></div>}
        {v.action !== 'ส่งซ่อม' && (item?.trackSerial ? (
          <div className="field wide"><label>เลือก Serial {v.action === 'ส่งคืน' ? 'ที่ส่งคืน' : 'ที่ใช้'}</label>
            {serialsAtWh.length === 0 ? <span className="muted">{v.from || v.action === 'ส่งคืน' ? 'ไม่มี Serial ที่เลือกได้' : 'เลือกคลังก่อน'}</span> : serialsAtWh.map(x => <label key={x.id} className="check"><input type="checkbox" checked={v.serials.includes(x.id)} onChange={() => toggle(x.id)} /> {x.serialNo}</label>)}
          </div>
        ) : <div className="field"><label>จำนวน</label><input type="number" min="1" value={v.qty} onChange={e => setV({ ...v, qty: e.target.value })} /></div>)}
        <div className="field wide"><label>หมายเหตุ</label><textarea rows={2} value={v.note} onChange={e => setV({ ...v, note: e.target.value })} /></div>
      </div>
      <p className="muted small">การเบิก/ส่งคืนจะตัดหรือเพิ่มยอดในคลังจริงและบันทึกในประวัติ Serial</p>
      {err && <div className="err" role="alert">{err}</div>}
    </Modal>
  )
}

function ApptResult({ t, a, onClose }) {
  const [result, setResult] = useState('')
  const [busy, run] = useSubmit()
  return (
    <Modal title={`ผลการเข้าหน้างาน ${a.date}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>ปิด</button>
      <button className="btn" disabled={busy} onClick={async () => { const r = await run(() => act(st => db.resolveAppointment(st, t.id, a.id, 'ยกเลิก', result)), 'ยกเลิกนัดแล้ว'); r.ok && onClose() }}>ยกเลิกนัด</button>
      <button className="btn primary" disabled={busy} onClick={async () => { const r = await run(() => act(st => db.resolveAppointment(st, t.id, a.id, 'เสร็จ', result)), 'บันทึกผลแล้ว'); r.ok && onClose() }}>บันทึกผล</button></>}>
      <div className="field"><label>ผลการเข้าหน้างาน/การซ่อม *</label><textarea rows={4} value={result} onChange={e => setResult(e.target.value)} /></div>
    </Modal>
  )
}

export function TicketDetail() {
  const { id } = useParams()
  const { s, can } = useApp()
  const nav = useNavigate()
  const [tab, setTab] = useState('info')
  const [modal, setModal] = useState(null)
  const t = db.getRec(s, 'tickets', id)
  if (!can('tickets', 'view')) return <Page title="Ticket"><ErrorBox error="ไม่มีสิทธิ์ดูข้อมูลนี้" /></Page>
  if (!t) return <Page title="Ticket"><ErrorBox error="ไม่พบ Ticket" /></Page>
  if (!db.inScope(s, 'tickets', t)) return <Page title="Ticket"><ErrorBox error="ไม่มีสิทธิ์เข้าถึง Ticket นี้" /></Page>
  const stt = db.ticketStatusOf(s, t.status)
  const nextSt = stt && !stt.final ? (stt.next || []).map(k => db.ticketStatusOf(s, k)).find(x => x && x.enabled && !x.final) : null
  const m = db.ticketMetrics(t)
  const fields = db.fieldsOf(s, 'tickets').filter(f => !f.hidden)
  const canEdit = can('tickets', 'edit') && !t._deleted
  const sameSerial = t.serial ? db.rows(s, 'tickets').filter(x => x.serial === t.serial && x.id !== t.id) : []
  const approvals = s.approvals.filter(a => a.entity === 'tickets' && a.recId === id)
  return (
    <Page title={<span>{t.title}</span>} subtitle={`${t.code} · เปิดเมื่อ ${fmtDateTime(t.receivedAt)}`}
      actions={<>
        <button className="btn" onClick={() => nav('/tickets')}>‹ รายการ</button>
        {canEdit && nextSt && <button className="btn primary" onClick={() => setModal({ status: nextSt.key })}>ขั้นต่อไป: {nextSt.label}</button>}
        {canEdit && <button className={'btn' + (nextSt ? '' : ' primary')} onClick={() => setModal('status')}>เปลี่ยนสถานะ</button>}
        {can('tickets', 'assign') && !t._deleted && <button className="btn" onClick={() => setModal('assign')}>มอบหมาย</button>}
        {canEdit && <button className="btn" onClick={() => setModal('edit')}>แก้ไขข้อมูล</button>}
      </>}>
      {!s.config.workflows.ticket.confirmed && <div className="notice warn small">ชุดสถานะเป็นค่าที่เสนอ รอผู้ใช้ยืนยัน (ปรับได้ที่ ตั้งค่า &gt; Workflow Ticket)</div>}
      {approvals.filter(a => a.status === 'pending').map(a => <div key={a.id} className="notice warn">รออนุมัติ: {a.title}</div>)}
      <div className="statbar">
        <div className="stat"><div className="l">สถานะ</div><div className="v"><Badge color={stt?.color}>{stt?.label}</Badge></div><div className="s">{t.priority} · {t.category}</div></div>
        <div className="stat"><div className="l">อายุเคส</div><div className="v">{fmtDuration(m.ageH)}</div><div className="s">นับจาก {fmtDateTime(t.receivedAt)}</div></div>
        <div className="stat"><div className="l">เวลาตอบสนองครั้งแรก</div><div className="v">{fmtDuration(m.responseH)}</div><div className="s">{t.respondedAt ? fmtDateTime(t.respondedAt) : 'ยังไม่ได้ตอบสนอง'}</div></div>
        <div className="stat"><div className="l">เวลาแก้ไข/ปิด</div><div className="v">{fmtDuration(m.resolveH)}</div><div className="s">{t.closedAt ? 'ปิดเมื่อ ' + fmtDateTime(t.closedAt) : 'ยังไม่ปิดเคส'}</div></div>
      </div>
      <Tabs tabs={[['info', 'รายละเอียด'], ['timeline', `ไทม์ไลน์ (${(t.timeline || []).length})`], ['visit', `นัดหมาย/หน้างาน (${(t.appointments || []).length})`], ['parts', `อะไหล่/อุปกรณ์ (${(t.parts || []).length})`], ['audit', 'ประวัติการแก้ไข']]} value={tab} onChange={setTab} />
      {tab === 'info' && (
        <>
          <div className="card">
            {fields.map(f => <Kv key={f.key} label={f.label}><Val f={f} v={t[f.key]} /></Kv>)}
            <Kv label="เวลาเริ่มดำเนินการ/ตอบสนอง">{fmtDateTime(t.respondedAt)}</Kv>
            <Kv label="เวลาแก้ไข">{fmtDateTime(t.resolvedAt)}</Kv>
            <Kv label="เวลาปิดเคส">{fmtDateTime(t.closedAt)}</Kv>
          </div>
          {t.serial && <div className="card"><h3>ประวัติอุปกรณ์ (Serial <RefLink entity="serials" id={t.serial} />)</h3>{sameSerial.length === 0 ? <span className="muted">ไม่มีเคสอื่นของ Serial นี้</span> : sameSerial.map(x => <div key={x.id}><Link to={'/tickets/' + x.id}>{x.code}</Link> {x.title} · {db.ticketStatusOf(s, x.status)?.label}</div>)}</div>}
        </>
      )}
      {tab === 'timeline' && (
        <div className="card">
          {canEdit && <div className="row" style={{ marginBottom: 10 }}><button className="btn sm" onClick={() => setModal('remote')}>+ บันทึกแก้ไขระยะไกล</button><button className="btn sm" onClick={() => setModal('note')}>+ บันทึก/แจ้งผู้ใช้</button></div>}
          <div className="timeline">{[...(t.timeline || [])].reverse().map(x => (
            <div key={x.id} className="tl-item"><div className="tl-dot" /><div><div>{x.type !== 'status' && <Badge>{{ remote: 'ระยะไกล', note: 'บันทึก', visit: 'หน้างาน', part: 'อะไหล่', assign: 'มอบหมาย', approval: 'อนุมัติ' }[x.type]}</Badge>} {x.text}</div><div className="muted small">{db.label(s, 'users', x.by)} · {fmtDateTime(x.at)}</div></div></div>
          ))}</div>
        </div>
      )}
      {tab === 'visit' && (
        <div className="card">
          {canEdit && <button className="btn sm" onClick={() => setModal('appt')}>+ นัดหมายเข้าหน้างาน</button>}
          {(t.appointments || []).length === 0 ? <Empty text="ยังไม่มีนัดหมาย" /> : (
            <table className="mini" style={{ marginTop: 8 }}><thead><tr><th>วันที่</th><th>เวลา</th><th>ช่าง</th><th>สถานะ</th><th>รายละเอียด/ผล</th><th /></tr></thead>
              <tbody>{t.appointments.map(a => <tr key={a.id}><td>{a.date}</td><td>{a.time}</td><td>{db.label(s, 'users', a.tech)}</td><td><Badge color={a.status === 'เสร็จ' ? 'green' : a.status === 'ยกเลิก' ? 'red' : 'violet'}>{a.status}</Badge></td><td>{a.note} {a.result && <b>→ {a.result}</b>}</td><td>{canEdit && a.status === 'นัดหมาย' && <button className="btn sm" onClick={() => setModal({ appt: a })}>บันทึกผล</button>}</td></tr>)}</tbody></table>
          )}
        </div>
      )}
      {tab === 'parts' && (
        <div className="card">
          {canEdit && <button className="btn sm" onClick={() => setModal('part')}>+ เบิก/เปลี่ยน/ส่งซ่อม/ส่งคืน</button>}
          {(t.parts || []).length === 0 ? <Empty text="ยังไม่มีรายการอะไหล่/อุปกรณ์" /> : (
            <table className="mini" style={{ marginTop: 8 }}><thead><tr><th>เวลา</th><th>รายการ</th><th>สินค้า</th><th>จำนวน</th><th>Serial</th><th>หมายเหตุ</th></tr></thead>
              <tbody>{t.parts.map(p => <tr key={p.id}><td>{fmtDateTime(p.at)}</td><td>{p.action}</td><td><RefLink entity="items" id={p.item} /></td><td>{p.qty}</td><td>{[...(p.serials || []), p.oldSerial && p.action !== 'เบิก' ? p.oldSerial : null].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).map(x => <span key={x}><RefLink entity="serials" id={x} /> </span>)}</td><td>{p.note}</td></tr>)}</tbody></table>
          )}
        </div>
      )}
      {tab === 'audit' && <div className="card"><History entity="tickets" id={id} /></div>}
      {(modal === 'status' || modal?.status) && <StatusModal t={t} preset={modal?.status} onClose={() => setModal(null)} />}
      {modal === 'assign' && <AssignModal t={t} onClose={() => setModal(null)} />}
      {modal === 'edit' && <RecordForm entity="tickets" record={t} onClose={() => setModal(null)} />}
      {(modal === 'remote' || modal === 'note') && <NoteModal t={t} type={modal} onClose={() => setModal(null)} />}
      {modal === 'appt' && <ApptModal t={t} onClose={() => setModal(null)} />}
      {modal === 'part' && <PartModal t={t} onClose={() => setModal(null)} />}
      {modal?.appt && <ApptResult t={t} a={modal.appt} onClose={() => setModal(null)} />}
    </Page>
  )
}
