import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useApp, Page, DataTable, Modal, FormFields, FieldInput, Badge, Val, Empty, ErrorBox, History, Kv, Tabs, useSubmit, toast, askConfirm, RefLink } from '../components/ui'
import { act } from '../lib/store'
import * as db from '../lib/db'
import { RecordForm } from './Entity'
import { fmtDate, fmtDateTime, toCsv, downloadFile, uid } from '../lib/util'

const stColor = { pending: 'gray', doing: 'blue', done: 'green', skipped: 'amber' }
const stText = { pending: 'ยังไม่เริ่ม', doing: 'กำลังดำเนินการ', done: 'เสร็จ', skipped: 'ข้าม' }

function CreateProject({ onClose }) {
  const { s } = useApp()
  const nav = useNavigate()
  const fields = db.fieldsOf(s, 'projects')
  const [values, setValues] = useState({})
  const [errors, setErrors] = useState({})
  const reqId = React.useRef(uid())
  const [busy, run] = useSubmit()
  const save = async () => {
    const r = await run(() => act(st => db.createProject(st, values, reqId.current)))
    if (r.ok) { toast('สร้างโครงการแล้ว'); onClose(); nav('/projects/' + r.data.id) }
    else if (r.error !== 'busy') setErrors(r.fieldErrors || { _: r.error })
  }
  return (
    <Modal wide guard={Object.keys(values).length > 0} title="สร้างโครงการ" onClose={onClose} footer={<><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'กำลังสร้าง…' : 'สร้างโครงการ'}</button></>}>
      {errors._ && <div className="notice bad">{errors._}</div>}
      <p className="muted small">โครงการใหม่จะเริ่มที่ขั้นตอน “รับ Requirement” ตาม workflow ที่ตั้งไว้</p>
      <FormFields fields={fields} values={values} setValues={setValues} errors={errors} />
    </Modal>
  )
}

export default function Projects() {
  const { s, can } = useApp()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const [form, setForm] = useState(sp.get('new') === '1' && can('projects', 'create'))
  useEffect(() => { if (sp.get('new')) setSp({}, { replace: true }) }, [])
  const total = s.config.workflows.project.steps.filter(x => x.enabled).length
  const data = db.rows(s, 'projects').map(p => {
    const done = db.stepsOf(s, p).filter(x => ['done', 'skipped'].includes(x.st.status)).length
    return { ...p, stepLabel: db.projectStatus(s, p), done, pct: Math.round((done / total) * 100), _search: p.name + ' ' + p.code }
  })
  const cols = [
    { key: 'code', label: 'รหัส', render: r => <span className="mono">{r.code}</span> },
    { key: 'name', label: 'ชื่อโครงการ', render: r => <div><b>{r.name}</b><div className="sub">{db.label(s, 'customers', r.customer)}</div></div> },
    { key: 'customer', label: 'ลูกค้า', value: r => db.label(s, 'customers', r.customer) },
    { key: 'type', label: 'ประเภท' },
    { key: 'manager', label: 'ผู้จัดการ', value: r => db.label(s, 'users', r.manager) },
    { key: 'stepLabel', label: 'ขั้นตอนปัจจุบัน/สถานะ', render: r => <Badge color={r.closed ? 'red' : 'blue'}>{r.stepLabel}</Badge> },
    { key: 'pct', label: 'ความคืบหน้า', render: r => <div style={{ minWidth: 90 }}><div className="bar"><div style={{ width: r.pct + '%' }} /></div><span className="small muted">{r.done}/{total} ขั้นตอน</span></div> }
  ]
  return (
    <Page title="โครงการ" subtitle="โครงการภาครัฐและโครงการติดตั้งระบบ" actions={can('projects', 'create') && <button className="btn primary" onClick={() => setForm(true)}>+ สร้างโครงการ</button>}>
      <DataTable columns={cols} data={data} onRow={r => nav('/projects/' + r.id)} tabs={[{ key: 'act', label: 'ดำเนินการ', test: r => !r.closed }, { key: 'closed', label: 'ปิดแล้ว', test: r => r.closed }, { key: 'all', label: 'ทั้งหมด' }]} exportName="projects" canExport={can('projects', 'export')}
        filters={[{ key: 'type', label: 'ประเภท', options: db.optionsOf(s, db.fieldsOf(s, 'projects').find(f => f.key === 'type') || {}), get: r => r.type },
          { key: 'st', label: 'สถานะ', options: ['ดำเนินการ', 'ปิดแล้ว'], get: r => (r.closed ? 'ปิดแล้ว' : 'ดำเนินการ') }]}
        emptyText="ยังไม่มีโครงการ — กด “สร้างโครงการ”" />
      {form && <CreateProject onClose={() => setForm(false)} />}
    </Page>
  )
}

// ---------- step body ----------
function StepBody({ p, cfg, st, canEdit }) {
  const { s } = useApp()
  const [vals, setVals] = useState(st.values || {})
  const [meta, setMeta] = useState({ plannedDate: st.plannedDate || '', owner: st.owner || '', notes: st.notes || '' })
  const [busy, run] = useSubmit()
  const nav = useNavigate()
  const editable = canEdit && !p.closed && !p._deleted
  const save = () => run(() => act(x => db.saveStep(x, p.id, cfg.key, { values: vals, ...meta })), 'บันทึกข้อมูลขั้นตอนแล้ว')
  const trans = async (action) => {
    let reason
    if (action === 'skip' || action === 'reopen') {
      const r = await askConfirm({ title: action === 'skip' ? 'ข้ามขั้นตอน' : 'เปิดขั้นตอนใหม่', message: cfg.label, reasonLabel: 'เหตุผล', confirmText: 'ยืนยัน' })
      if (!r.ok) return
      reason = r.reason
    }
    if (action === 'complete') {
      const dirty = JSON.stringify(vals) !== JSON.stringify(st.values || {}) || meta.plannedDate !== (st.plannedDate || '') || meta.owner !== (st.owner || '') || meta.notes !== (st.notes || '')
      if (dirty) {
        const sv = act(x => db.saveStep(x, p.id, cfg.key, { values: vals, ...meta }))
        if (!sv.ok) return toast(sv.error, 'err')
      }
    }
    const r = await run(() => act(x => db.transitStep(x, p.id, cfg.key, action, { reason })))
    if (r.ok) toast(r.data?.pending ? 'ส่งคำขออนุมัติแล้ว' : 'ดำเนินการแล้ว')
  }
  const addFiles = (docKey, files) => {
    const arr = Array.from(files).map(f => ({ name: f.name, size: f.size }))
    if (arr.length) run(() => act(x => db.addStepDocs(x, p.id, cfg.key, docKey, arr)), 'แนบเอกสารแล้ว')
  }
  const rmFile = async (docKey, i, name) => {
    const r = await askConfirm({ title: 'นำไฟล์ออก', message: name, reasonLabel: 'เหตุผล', danger: true })
    if (r.ok) run(() => act(x => db.removeStepDoc(x, p.id, cfg.key, docKey, i, r.reason)))
  }
  const poRows = db.rows(s, 'purchaseOrders').filter(o => o.project === p.id)
  const boq = boqTrack(s, p)
  const issued = (s.data.stockMoves || []).filter(m => !m._deleted && m.project === p.id && m.type === 'issue')
  const toInstall = (s.data.serials || []).filter(x => !x._deleted && x.project === p.id && x.status === 'ส่งออกไปหน้างาน')
  return (
    <div className="step-body">
      <p className="muted small">{cfg.desc} {cfg.source === 'document' && <Badge color="blue">workflow ตั้งต้นจากเอกสาร — รอยืนยัน</Badge>}</p>
      {st.pendingApproval && <div className="notice warn">รออนุมัติจบขั้นตอนนี้</div>}
      <div className="form-grid">
        <div className="field"><label>ผู้รับผิดชอบขั้นตอน</label>
          <select disabled={!editable} value={meta.owner} onChange={e => setMeta({ ...meta, owner: e.target.value })}><option value="">–</option>{s.users.filter(u => u.active !== false).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        <div className="field"><label>วันที่วางแผน</label><input type="date" disabled={!editable} value={meta.plannedDate} onChange={e => setMeta({ ...meta, plannedDate: e.target.value })} /></div>
      </div>
      {cfg.fields.length > 0 && <div style={{ marginTop: 10 }}><FormFields fields={cfg.fields.filter(f => !f.hidden)} values={vals} setValues={setVals} disabled={!editable} /></div>}
      <div className="field" style={{ marginTop: 10 }}><label>หมายเหตุขั้นตอน</label><textarea rows={2} disabled={!editable} value={meta.notes} onChange={e => setMeta({ ...meta, notes: e.target.value })} /></div>
      {cfg.docs.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <b>เอกสาร{cfg.requireDocs ? ' (บังคับแนบ)' : ''}</b>
          {cfg.docs.map(d => (
            <div key={d.key} className="row" style={{ padding: '4px 0', borderBottom: '1px dashed #e6ecf2' }}>
              <span style={{ minWidth: 220 }}>{(st.docs?.[d.key] || []).length ? '[มีไฟล์]' : '[ยังไม่แนบ]'} {d.label}</span>
              <span className="small grow">{(st.docs?.[d.key] || []).map((f, i) => <span key={i} style={{ marginRight: 10 }}>{f.name} {editable && <a href="#x" onClick={e => { e.preventDefault(); rmFile(d.key, i, f.name) }}>นำออก</a>}</span>)}</span>
              {editable && <input type="file" multiple style={{ width: 200 }} onChange={e => { addFiles(d.key, e.target.files); e.target.value = '' }} />}
            </div>
          ))}
          <div className="muted small">ไฟล์แนบในระบบนี้เก็บเฉพาะชื่อและขนาดไฟล์</div>
        </div>
      )}
      {['proposal', 'procure'].includes(cfg.key) && <BoqTable boq={boq} />}
      {cfg.key === 'procure' && (
        <div className="card" style={{ marginTop: 10 }}><b>ใบสั่งซื้อของโครงการ ({poRows.length})</b>
          {poRows.map(o => <div key={o.id}><RefLink entity="purchaseOrders" id={o.id} /> · {db.label(s, 'vendors', o.vendor)} · {s.config.workflows.po.statuses.find(z => z.key === o.status)?.label} · กำหนดส่ง {fmtDate(o.dueDate)}</div>)}
          {db.can(s, 'purchase', 'create') && <button className="btn sm" style={{ marginTop: 6 }} onClick={() => nav('/purchaseOrders?newProject=' + p.id)}>+ สร้างใบสั่งซื้อให้โครงการนี้</button>}
        </div>
      )}
      {cfg.key === 'dispatch' && (
        <div className="card" style={{ marginTop: 10 }}><b>รายการเบิก/ส่งอุปกรณ์ ({issued.length})</b>
          {issued.map(m => <div key={m.id}>{m.code} · {fmtDate(m.date)} · {db.label(s, 'items', m.item)} x{m.qty} · ผู้รับ: {m.recipient || '–'}{m.serials.length > 0 && ' · SN: ' + m.serials.map(i => db.getRec(s, 'serials', i)?.serialNo).join(', ')}</div>)}
          {db.can(s, 'warehouse', 'create') && <button className="btn sm" style={{ marginTop: 6 }} onClick={() => nav('/warehouse?tab=issue&project=' + p.id)}>+ เบิกอุปกรณ์ไปโครงการนี้</button>}
        </div>
      )}
      {cfg.key === 'install' && (
        <div className="card" style={{ marginTop: 10 }}><b>อุปกรณ์ที่ส่งหน้างานและยังไม่บันทึกติดตั้ง ({toInstall.length})</b>
          {toInstall.map(x => <InstallRow key={x.id} sr={x} p={p} />)}
        </div>
      )}
      {cfg.key === 'handover' && <div className="notice">รายงานส่งมอบ (รายการอุปกรณ์ Serial พิกัด) ดูและพิมพ์ได้ที่แท็บ “รายงานส่งมอบ”</div>}
      {cfg.key === 'after' && db.can(s, 'pm', 'create') && <div className="notice">สร้างแผน PM ตามสัญญาบริการได้ที่เมนู <Link to="/pm">งาน PM</Link></div>}
      {st.log?.length > 0 && <details style={{ marginTop: 8 }}><summary className="small muted">บันทึกขั้นตอน ({st.log.length})</summary>{[...st.log].reverse().map(l => <div key={l.id} className="small">{fmtDateTime(l.at)} · {db.label(s, 'users', l.by)} · {l.text}</div>)}</details>}
      {canEdit && !p.closed && (
        <div className="row" style={{ marginTop: 12 }}>
          {editable && <button className="btn" disabled={busy} onClick={save}>บันทึกข้อมูลขั้นตอน</button>}
          {st.status === 'pending' && <button className="btn" disabled={busy} onClick={() => trans('start')}>เริ่มขั้นตอน</button>}
          {['doing', 'pending'].includes(st.status) && !st.pendingApproval && <button className="btn primary" disabled={busy} onClick={() => trans('complete')}>จบขั้นตอน</button>}
          {st.status !== 'done' && st.status !== 'skipped' && <button className="btn" disabled={busy} onClick={() => trans('skip')}>ข้าม</button>}
          {['done', 'skipped'].includes(st.status) && <button className="btn" disabled={busy} onClick={() => trans('reopen')}>เปิดขั้นตอนใหม่</button>}
        </div>
      )}
    </div>
  )
}

function InstallRow({ sr, p }) {
  const { s } = useApp()
  const [loc, setLoc] = useState('')
  const [busy, run] = useSubmit()
  return (
    <div className="row" style={{ marginTop: 6 }}>
      <span style={{ minWidth: 260 }}>{db.label(s, 'items', sr.item)} · SN {sr.serialNo}</span>
      <input style={{ maxWidth: 220 }} placeholder="จุดติดตั้ง" value={loc} onChange={e => setLoc(e.target.value)} />
      <button className="btn sm primary" disabled={busy || !db.can(s, 'assets', 'edit')} onClick={() => run(() => act(x => db.markInstalled(x, sr.id, { site: sr.site || p.site, location: loc, project: p.id })), 'บันทึกการติดตั้งแล้ว')}>บันทึกติดตั้ง</button>
    </div>
  )
}

export function boqTrack(s, p) {
  const pos = db.rows(s, 'purchaseOrders').filter(o => o.project === p.id && o.status !== 'cancelled')
  const moves = (s.data.stockMoves || []).filter(m => !m._deleted && m.project === p.id)
  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0)
  return (p.boq || []).filter(l => l.item).map(l => ({
    ...l,
    ordered: sum(pos.flatMap(o => o.lines || []).filter(x => x.item === l.item), x => Number(x.qty || 0)),
    received: sum(moves.filter(m => m.type === 'receive' && m.item === l.item), m => m.qty),
    issued: sum(moves.filter(m => m.type === 'issue' && m.item === l.item), m => m.qty),
    installed: (s.data.serials || []).filter(x => !x._deleted && x.project === p.id && x.item === l.item && x.status === 'ติดตั้งแล้ว').length
  }))
}
function BoqTable({ boq }) {
  const { s } = useApp()
  return (
    <div className="card" style={{ marginTop: 10 }}>
      <b>BOQ เทียบการสั่งซื้อ/รับ/เบิก/ติดตั้ง</b>
      {boq.length === 0 ? <Empty text="ยังไม่มีรายการ BOQ (เพิ่มได้ที่แท็บ “ข้อมูลโครงการ” > แก้ไข)" /> : (
        <div className="table-wrap"><table className="mini"><thead><tr><th>สินค้า</th><th>ต้องใช้</th><th>สั่งซื้อ</th><th>รับเข้า</th><th>เบิกไปหน้างาน</th><th>ติดตั้งแล้ว (Serial)</th></tr></thead>
          <tbody>{boq.map((l, i) => <tr key={i}><td><RefLink entity="items" id={l.item} /></td><td>{l.qty}</td><td>{l.ordered}</td><td>{l.received}</td><td>{l.issued}</td><td>{l.installed}</td></tr>)}</tbody></table></div>
      )}
    </div>
  )
}

function HandoverReport({ p }) {
  const { s } = useApp()
  const site = db.getRec(s, 'sites', p.site)
  const sr = (s.data.serials || []).filter(x => !x._deleted && x.project === p.id && ['ติดตั้งแล้ว', 'ส่งออกไปหน้างาน', 'เปลี่ยนแล้ว'].includes(x.status))
  const hand = p.steps.handover?.values || {}
  const docsAll = db.stepsOf(s, p).flatMap(({ cfg, st }) => cfg.docs.map(d => ({ step: cfg.label, label: d.label, files: st.docs?.[d.key] || [] })))
  const csv = () => downloadFile(`handover-${p.code}.csv`, toCsv(['ลำดับ', 'ยี่ห้อ', 'รุ่น', 'สินค้า', 'Serial', 'สถานะ', 'ไซต์', 'จุดติดตั้ง', 'ละติจูด', 'ลองจิจูด', 'วันที่ติดตั้ง', 'รับประกันถึง'],
    sr.map((x, i) => { const it = db.getRec(s, 'items', x.item); const st = db.getRec(s, 'sites', x.site); return [i + 1, it?.brand, it?.model, it?.name, x.serialNo, x.status, st?.name, x.location, st?.lat, st?.lng, x.installedDate, x.warrantyEnd] })))
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>รายงานส่งมอบ/ติดตั้งจริง — {p.name}</h2>
        <span className="row"><button className="btn" onClick={() => window.print()}>พิมพ์</button>{db.can(s, 'projects', 'export') && <button className="btn" onClick={csv}>CSV</button>}</span>
      </div>
      <Kv label="ลูกค้า"><RefLink entity="customers" id={p.customer} /></Kv>
      <Kv label="ไซต์">{site?.name || '–'} {site?.lat ? `(พิกัด ${site.lat}, ${site.lng})` : ''}</Kv>
      <Kv label="สัญญา/PO">{p.contractNo || '–'} / {p.poNo || '–'}</Kv>
      <Kv label="วันที่ส่งมอบ / ผลตรวจรับ">{fmtDate(hand.handoverDate)} / {hand.acceptResult || '–'}</Kv>
      <h3 style={{ marginTop: 12 }}>รายการอุปกรณ์ ({sr.length})</h3>
      {sr.length === 0 ? <Empty text="ยังไม่มีอุปกรณ์ที่เบิก/ติดตั้งในโครงการนี้" /> : (
        <div className="table-wrap"><table className="mini"><thead><tr><th>#</th><th>ยี่ห้อ</th><th>รุ่น</th><th>สินค้า</th><th>Serial Number</th><th>สถานะ</th><th>จุดติดตั้ง</th><th>วันที่ติดตั้ง</th></tr></thead>
          <tbody>{sr.map((x, i) => { const it = db.getRec(s, 'items', x.item); return <tr key={x.id}><td>{i + 1}</td><td>{it?.brand}</td><td>{it?.model}</td><td>{it?.name}</td><td><RefLink entity="serials" id={x.id} /></td><td>{x.status}</td><td>{x.location}</td><td>{fmtDate(x.installedDate)}</td></tr> })}</tbody></table></div>
      )}
      <h3 style={{ marginTop: 12 }}>เอกสารตามขั้นตอน</h3>
      <div className="table-wrap"><table className="mini"><thead><tr><th>ขั้นตอน</th><th>เอกสาร</th><th>ไฟล์ที่แนบ</th></tr></thead>
        <tbody>{docsAll.map((d, i) => <tr key={i}><td>{d.step}</td><td>{d.label}</td><td>{d.files.length ? d.files.map(f => f.name).join(', ') : <span className="muted">ยังไม่แนบ</span>}</td></tr>)}</tbody></table></div>
      {(hand.trainees || []).length > 0 && <><h3 style={{ marginTop: 12 }}>ผู้เข้าอบรม</h3><ul>{hand.trainees.map((t, i) => <li key={i}>{t.name} ({t.org})</li>)}</ul></>}
    </div>
  )
}

export function ProjectDetail() {
  const { id } = useParams()
  const { s, can } = useApp()
  const nav = useNavigate()
  const [tab, setTab] = useState('steps')
  const [open, setOpen] = useState(null)
  const [edit, setEdit] = useState(false)
  const p = db.getRec(s, 'projects', id)
  if (!can('projects', 'view')) return <Page title="โครงการ"><ErrorBox error="ไม่มีสิทธิ์ดูข้อมูลนี้" /></Page>
  if (!p) return <Page title="โครงการ"><ErrorBox error="ไม่พบโครงการ" /></Page>
  if (!db.inScope(s, 'projects', p)) return <Page title="โครงการ"><ErrorBox error="ไม่มีสิทธิ์เข้าถึงโครงการนี้" /></Page>
  const steps = db.stepsOf(s, p)
  const cur = db.currentStep(s, p)
  const done = steps.filter(x => ['done', 'skipped'].includes(x.st.status)).length
  const canEdit = can('projects', 'edit')
  const openKey = open ?? cur?.cfg.key
  const tickets = db.rows(s, 'tickets').filter(t => t.project === id)
  const closeIt = async () => {
    const r = await askConfirm({ title: 'ปิดโครงการ', message: `ปิดโครงการ ${p.code}? ปิดแล้วจะแก้ขั้นตอนไม่ได้จนกว่าจะเปิดขั้นตอนใหม่`, reasonLabel: 'เหตุผลการปิดโครงการ', confirmText: 'ปิดโครงการ', danger: true })
    if (r.ok) { const x = act(st => db.closeProject(st, id, r.reason)); x.ok ? toast('ปิดโครงการแล้ว') : toast(x.error, 'err') }
  }
  const del = async () => {
    const r = await askConfirm({ title: 'ยกเลิกโครงการ', message: 'โครงการจะถูกซ่อนจากรายการ ประวัติทั้งหมดยังอยู่และกู้คืนได้', reasonLabel: 'เหตุผล', danger: true })
    if (r.ok) { const x = act(st => db.archive(st, 'projects', id, r.reason)); x.ok ? (toast('ยกเลิกแล้ว'), nav('/projects')) : toast(x.error, 'err') }
  }
  const fields = db.fieldsOf(s, 'projects').filter(f => !f.hidden)
  return (
    <Page title={<span>{p.name}</span>} subtitle={`${p.code} · ${db.projectStatus(s, p)}`}
      actions={<>
        <button className="btn" onClick={() => nav('/projects')}>‹ รายการ</button>
        {can('projects', 'edit') && !p.closed && <button className="btn" onClick={() => setEdit(true)}>แก้ไขข้อมูล</button>}
        {can('projects', 'close') && !p.closed && <button className="btn" onClick={closeIt}>ปิดโครงการ</button>}
        {can('projects', 'delete') && !p._deleted && <button className="btn danger" onClick={del}>ยกเลิก/ซ่อน</button>}
      </>}>
      <div className="statbar">
        <div className="stat"><div className="l">ขั้นตอนปัจจุบัน</div><div className="v" style={{ fontSize: 18 }}>{cur ? cur.cfg.label : 'ครบทุกขั้นตอน'}</div><div className="s">เสร็จแล้ว {done} จาก {steps.length}</div></div>
        <div className="stat"><div className="l">ความคืบหน้า</div><div className="v">{Math.round((done / steps.length) * 100)}%</div><div className="bar" style={{ marginTop: 6 }}><div style={{ width: Math.round((done / steps.length) * 100) + '%' }} /></div></div>
        <div className="stat"><div className="l">ลูกค้า</div><div className="v" style={{ fontSize: 18 }}><RefLink entity="customers" id={p.customer} /></div><div className="s">{p.type || ''}</div></div>
        <div className="stat"><div className="l">ผู้จัดการโครงการ</div><div className="v" style={{ fontSize: 18 }}>{db.label(s, 'users', p.manager)}</div><div className="s">{p.contractNo ? 'สัญญา ' + p.contractNo : ''}</div></div>
      </div>
      <div className="card">
        {p.closed && <div className="notice bad" style={{ marginTop: 8 }}>โครงการปิดแล้ว — {p.closeReason}</div>}
        {!s.config.workflows.project.confirmed && <div className="notice warn small" style={{ marginTop: 8 }}>workflow โครงการนี้เป็นค่าตั้งต้นจากเอกสาร รอผู้ใช้ยืนยัน (ปรับได้ที่ ตั้งค่า &gt; Workflow โครงการ)</div>}
      </div>
      <Tabs tabs={[['steps', 'ขั้นตอน (13)'], ['info', 'ข้อมูลโครงการ'], ['boq', 'BOQ / อุปกรณ์'], ['handover', 'รายงานส่งมอบ'], ['tickets', `Ticket (${tickets.length})`], ['audit', 'ประวัติ']]} value={tab} onChange={setTab} />
      {tab === 'steps' && (
        <div className="stepper">
          {steps.map(({ cfg, st }, i) => (
            <div key={cfg.key} className={'step ' + st.status}>
              <div className="step-head" onClick={() => setOpen(openKey === cfg.key ? '' : cfg.key)} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && setOpen(openKey === cfg.key ? '' : cfg.key)}>
                <span className="dot">{st.status === 'done' ? '✓' : i + 1}</span>
                <b>{cfg.label}</b><span className="grow" />
                {st.owner && <span className="small muted">{db.label(s, 'users', st.owner)}</span>}
                {st.plannedDate && <span className="small muted">แผน {fmtDate(st.plannedDate)}</span>}
                <Badge color={stColor[st.status]}>{stText[st.status]}</Badge>
              </div>
              {openKey === cfg.key && <StepBody key={cfg.key + st.status + (st.pendingApproval ? 1 : 0)} p={p} cfg={cfg} st={st} canEdit={canEdit} />}
            </div>
          ))}
        </div>
      )}
      {tab === 'info' && <div className="card">{fields.map(f => <Kv key={f.key} label={f.label}><Val f={f} v={p[f.key]} /></Kv>)}</div>}
      {tab === 'boq' && <BoqTable boq={boqTrack(s, p)} />}
      {tab === 'handover' && <HandoverReport p={p} />}
      {tab === 'tickets' && (
        <div className="card">{tickets.length === 0 ? <Empty text="ยังไม่มี Ticket ในโครงการนี้" /> : tickets.map(t => <div key={t.id}><Link to={'/tickets/' + t.id}>{t.code}</Link> {t.title} <Badge color={db.ticketStatusOf(s, t.status)?.color}>{db.ticketStatusOf(s, t.status)?.label}</Badge></div>)}</div>
      )}
      {tab === 'audit' && <div className="card"><History entity="projects" id={id} /></div>}
      {edit && <RecordForm entity="projects" record={p} onClose={() => setEdit(false)} />}
    </Page>
  )
}
void FieldInput
