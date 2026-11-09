import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useApp, Page, DataTable, Modal, FormFields, Badge, Val, plainVal, Empty, ErrorBox, History, Kv, Tabs, useSubmit, toast, askConfirm, RefLink } from '../components/ui'
import { act, getState } from '../lib/store'
import * as db from '../lib/db'
import { ENT } from '../lib/schema'
import { uid, parseCsv, fmtDate, todayStr } from '../lib/util'
import { formulaText, defaultFor } from '../lib/modules'

export function warranty(sr) {
  if (!sr.warrantyEnd) return { text: 'ไม่ระบุ', color: 'gray' }
  const d = (new Date(sr.warrantyEnd) - new Date()) / 86400000
  if (d < 0) return { text: 'หมดประกัน', color: 'red' }
  if (d <= 30) return { text: 'ใกล้หมด (' + Math.ceil(d) + ' วัน)', color: 'amber' }
  return { text: 'อยู่ในประกัน', color: 'green' }
}

export function buildColumns(s, entity, extra = {}) {
  const meta = ENT[entity]
  const fields = db.fieldsOf(s, entity)
  const cols = []
  for (const k of meta.cols) {
    if (k === 'code') { cols.push({ key: 'code', label: 'รหัส', render: r => <span>{r.code}</span> }); continue }
    if (extra[k]) { cols.push({ key: k, ...extra[k] }); continue }
    const f = fields.find(x => x.key === k)
    if (!f || f.hidden) continue
    cols.push({
      key: k, label: f.label,
      value: r => (f.type === 'ref' ? db.label(s, f.ref, r[k]) : f.type === 'boolean' ? (r[k] ? 'ใช่' : 'ไม่') : f.type === 'formula' ? formulaText(f, r) : f.type === 'multiselect' ? (r[k] || []).join('; ') : f.type === 'file' ? (r[k] || []).map(x => x.name).join('; ') : f.type === 'rows' ? (r[k] || []).length + ' แถว' : r[k]),
      render: r => <Val f={f} v={r[k]} rec={r} />
    })
  }
  return cols
}

// ---------- create/edit form ----------
export function RecordForm({ entity, record, defaults = {}, extra = {}, onClose, onSaved, title }) {
  const { s } = useApp()
  const fields = db.fieldsOf(s, entity)
  const { user } = useApp()
  const [values, setValues] = useState(() => {
    if (record) return { ...record }
    const d = {}
    fields.forEach(f => { const x = defaultFor(f, user); if (x !== undefined) d[f.key] = x })
    return { ...d, ...defaults }
  })
  const [errors, setErrors] = useState({})
  const initialJson = useRef(null)
  if (initialJson.current === null) initialJson.current = JSON.stringify(values)
  const reqId = useRef(uid())
  const [busy, run] = useSubmit()
  const save = async () => {
    const r = await run(() => act(st => record ? db.patch(st, entity, record.id, pick(values, fields)) : db.insert(st, entity, { ...pick(values, fields), ...extra }, { reqId: reqId.current })))
    if (r.ok) { toast(record ? 'บันทึกการแก้ไขแล้ว' : 'สร้างรายการแล้ว'); onSaved?.(r.data); onClose() }
    else if (r.error !== 'busy') setErrors(r.fieldErrors || { _: r.error })
  }
  return (
    <Modal wide guard={JSON.stringify(values) !== initialJson.current} title={title || (record ? 'แก้ไข' : 'เพิ่ม') + ENT[entity].label} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button></>}>
      {errors._ && <div className="notice bad" role="alert">{errors._}</div>}
      <FormFields fields={fields} values={values} setValues={setValues} errors={errors} />
    </Modal>
  )
}
const pick = (values, fields) => {
  const o = {}
  fields.forEach(f => { if (values[f.key] !== undefined) o[f.key] = values[f.key] })
  return o
}

// ---------- CSV import ----------
function resolveRef(s, f, text) {
  const t = String(text).trim()
  if (!t) return ''
  if (f.ref === 'users') return s.users.find(u => u.name === t || u.username === t)?.id || ''
  return (s.data[f.ref] || []).find(r => !r._deleted && (r.code === t || db.label(s, f.ref, r.id) === t))?.id || ''
}
function runImport(s, entity, table) {
  const fields = db.fieldsOf(s, entity).filter(f => !f.hidden && !['file', 'rows'].includes(f.type))
  const head = table[0].map(h => h.trim())
  const map = head.map(h => fields.find(f => f.label === h || f.key === h))
  let ok = 0
  const errors = []
  table.slice(1).forEach((cells, i) => {
    const v = {}
    map.forEach((f, j) => {
      if (!f || cells[j] === undefined || cells[j] === '') return
      const x = cells[j]
      v[f.key] = f.type === 'ref' ? resolveRef(s, f, x) : f.type === 'boolean' ? /^(ใช่|true|1|y|yes)$/i.test(x) : x
    })
    try { db.insert(s, entity, v); ok++ } catch (e) { errors.push(`แถว ${i + 2}: ${e.message}`) }
  })
  return { ok, errors, unmapped: head.filter((_, j) => !map[j]) }
}
export function ImportModal({ entity, onClose }) {
  const [table, setTable] = useState(null)
  const [prev, setPrev] = useState(null)
  const [err, setErr] = useState('')
  const [busy, run] = useSubmit()
  const onFile = async e => {
    const f = e.target.files[0]
    if (!f) return
    try {
      const t = parseCsv(await f.text())
      if (t.length < 2) throw new Error('ไฟล์ไม่มีข้อมูล (ต้องมีหัวตารางและอย่างน้อย 1 แถว)')
      setTable(t); setErr('')
      setPrev(runImport(structuredClone(getState()), entity, t))
    } catch (x) { setErr(x.message); setTable(null); setPrev(null) }
  }
  const go = async () => {
    const r = await run(() => act(st => {
      const res = runImport(st, entity, table)
      db.audit(st, 'import', entity, null, `นำเข้า CSV ${ENT[entity].label}: สำเร็จ ${res.ok} แถว ผิดพลาด ${res.errors.length} แถว`)
      return res
    }))
    if (r.ok) { toast(`นำเข้าสำเร็จ ${r.data.ok} แถว`); onClose() }
  }
  return (
    <Modal title={'นำเข้า CSV: ' + ENT[entity].label} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>ปิด</button><button className="btn primary" disabled={busy || !prev || !prev.ok} onClick={go}>นำเข้า {prev?.ok || 0} แถว</button></>}>
      <p className="muted small">ไฟล์ CSV (UTF-8) แถวแรกเป็นหัวตาราง ใช้ชื่อฟิลด์ตามที่แสดงในแบบฟอร์ม เช่น “{db.fieldsOf(getState(), entity).slice(0, 3).map(f => f.label).join('”, “')}” รายการที่ไม่ผ่านการตรวจจะถูกข้ามและแสดงเหตุผล</p>
      <input type="file" accept=".csv,text/csv" onChange={onFile} />
      {err && <div className="err">{err}</div>}
      {prev && (
        <div style={{ marginTop: 10 }}>
          <div>พร้อมนำเข้า <b>{prev.ok}</b> แถว · ข้าม <b>{prev.errors.length}</b> แถว</div>
          {prev.unmapped.length > 0 && <div className="muted small">คอลัมน์ที่ไม่รู้จัก (ไม่นำเข้า): {prev.unmapped.join(', ')}</div>}
          {prev.errors.slice(0, 8).map((x, i) => <div key={i} className="err">{x}</div>)}
        </div>
      )}
    </Modal>
  )
}

// ---------- generic list ----------
export function EntityList({ entity }) {
  const { s, can } = useApp()
  const meta = ENT[entity]
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const [form, setForm] = useState(sp.get('new') === '1' && can(meta.res, 'create'))
  useEffect(() => { if (sp.get('new')) setSp({}, { replace: true }) }, [])
  const [imp, setImp] = useState(false)
  const [arch, setArch] = useState(false)
  const fields = db.fieldsOf(s, entity)
  const extra = {}
  if (entity === 'serials') extra.warrantyEnd = { label: 'ประกัน', value: r => r.warrantyEnd || '', render: r => <Badge color={warranty(r).color}>{warranty(r).text}</Badge> }
  if (entity === 'items') extra.trackSerial = { label: 'ติดตาม Serial', value: r => (r.trackSerial ? 'ใช่' : 'ไม่'), render: r => (r.trackSerial ? 'ใช่' : 'ไม่') }
  const cols = buildColumns(s, entity, extra)
  if (entity === 'items') cols.push({ key: 'stock', label: 'คงเหลือรวม', value: r => Object.values(db.balances(s)).reduce((a, w) => a + (w[r.id] || 0), 0) })
  if (entity === 'serials') cols.push({ key: 'wh', label: 'คลัง', value: r => db.label(s, 'warehouses', r.warehouse) })
  const data = db.rows(s, entity, { archived: arch }).map(r => ({ ...r, _search: Object.values(r).filter(x => typeof x === 'string').join(' ') }))
  const filters = meta.filters.map(k => {
    const f = fields.find(x => x.key === k)
    if (!f) return null
    if (f.type === 'ref') return { key: k, label: f.label, options: db.rows(s, f.ref).map(r => [r.id, db.label(s, f.ref, r.id)]), get: r => r[k] }
    return { key: k, label: f.label, options: db.optionsOf(s, f), get: r => r[k] }
  }).filter(Boolean)
  return (
    <Page title={meta.label} subtitle={`${data.length} รายการ`}
      actions={<>
        {can(meta.res, 'delete') && <label className="check small"><input type="checkbox" checked={arch} onChange={e => setArch(e.target.checked)} /> แสดงที่ถูกยกเลิก/ซ่อน</label>}
        {can(meta.res, 'create') && <button className="btn" onClick={() => setImp(true)}>นำเข้า CSV</button>}
        {can(meta.res, 'create') && <button className="btn primary" onClick={() => setForm(true)}>+ เพิ่ม{meta.label}</button>}
      </>}>
      <DataTable columns={cols} data={data} filters={filters} onRow={r => nav(`/${entity}/${r.id}`)} exportName={entity} canExport={can(meta.res, 'export')}
        rowClass={r => (r._deleted ? 'hl-3' : '')} emptyText={`ยังไม่มี${meta.label}`} emptyAction={can(meta.res, 'create') ? { label: '+ เพิ่ม' + meta.label + 'รายการแรก', onClick: () => setForm(true) } : null} />
      {form && <RecordForm entity={entity} onClose={() => setForm(false)} onSaved={r => r?.id && nav(`/${entity}/${r.id}`)} defaults={entity === 'serials' ? { status: 'ในคลัง' } : {}} />}
      {imp && <ImportModal entity={entity} onClose={() => setImp(false)} />}
    </Page>
  )
}

function RelTable({ title, rows, cols }) {
  return (
    <div className="card">
      <h3>{title} ({rows.length})</h3>
      {rows.length === 0 ? <Empty text="ไม่มีรายการ" /> : (
        <div className="table-wrap"><table className="mini"><thead><tr>{cols.map(c => <th key={c[0]}>{c[0]}</th>)}</tr></thead>
          <tbody>{rows.slice(0, 30).map((r, i) => <tr key={r.id || i}>{cols.map(c => <td key={c[0]}>{c[1](r)}</td>)}</tr>)}</tbody></table></div>
      )}
    </div>
  )
}

function InstallForm({ serial, onClose }) {
  const { s } = useApp()
  const [v, setV] = useState({ site: serial.site || '', location: serial.location || '', date: todayStr() })
  const [busy, run] = useSubmit()
  const sites = db.rows(s, 'sites')
  return (
    <Modal title={'บันทึกการติดตั้ง ' + serial.serialNo} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn primary" disabled={busy} onClick={async () => {
        const r = await run(() => act(st => db.markInstalled(st, serial.id, { ...v, project: serial.project })), 'บันทึกการติดตั้งแล้ว')
        if (r.ok) onClose()
      }}>บันทึก</button></>}>
      <div className="form-grid">
        <div className="field"><label>ไซต์ *</label><select value={v.site} onChange={e => setV({ ...v, site: e.target.value })}><option value="">– เลือก –</option>{sites.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="field"><label>จุดติดตั้ง</label><input value={v.location} onChange={e => setV({ ...v, location: e.target.value })} /></div>
        <div className="field"><label>วันที่ติดตั้ง</label><input type="date" value={v.date} onChange={e => setV({ ...v, date: e.target.value })} /></div>
      </div>
      <p className="muted small">ระบบจะคำนวณวันสิ้นสุดรับประกันจากระยะรับประกันของสินค้า (ถ้ามี)</p>
    </Modal>
  )
}

function DetailStats({ s, entity, rec }) {
  const id = rec.id
  const openT = db.rows(s, 'tickets').filter(t => db.isOpenTicket(s, t))
  const st = []
  if (entity === 'customers') {
    st.push(['ไซต์', db.rows(s, 'sites').filter(x => x.customer === id).length, 'สถานที่ติดตั้ง'])
    st.push(['โครงการ', db.rows(s, 'projects').filter(x => x.customer === id).length, `ดำเนินการ ${db.rows(s, 'projects').filter(x => x.customer === id && !x.closed).length}`])
    st.push(['เคสค้าง', openT.filter(t => t.customer === id).length, `ทั้งหมด ${db.rows(s, 'tickets').filter(t => t.customer === id).length}`])
    st.push(['ประเภท', rec.type || '–', rec.phone || ''])
  } else if (entity === 'vendors') {
    const pos = db.rows(s, 'purchaseOrders').filter(x => x.vendor === id)
    st.push(['ใบสั่งซื้อ', pos.length, 'ทั้งหมด'])
    st.push(['รอรับสินค้า', pos.filter(x => ['ordered', 'partial'].includes(x.status)).length, 'สั่งซื้อแล้ว/รับบางส่วน'])
    st.push(['ผู้ติดต่อ', db.rows(s, 'contacts').filter(x => x.vendor === id).length, ''])
    st.push(['หมวด', rec.category || '–', rec.paymentTerms || ''])
  } else if (entity === 'sites') {
    st.push(['อุปกรณ์ติดตั้ง', db.rows(s, 'serials').filter(x => x.site === id && x.status === 'ติดตั้งแล้ว').length, 'ตาม Serial'])
    st.push(['เคสค้าง', openT.filter(t => t.site === id).length, `ทั้งหมด ${db.rows(s, 'tickets').filter(t => t.site === id).length}`])
    st.push(['แผน PM', db.rows(s, 'pmPlans').filter(x => x.site === id && x.active).length, 'ที่ใช้งาน'])
    st.push(['ทีมดูแล', rec.team || '–', rec.province || ''])
  } else if (entity === 'items') {
    const bal = db.balances(s)
    const tot = Object.values(bal).reduce((a, w) => a + (w[id] || 0), 0)
    st.push(['คงเหลือรวม', tot + ' ' + (rec.unit || ''), rec.minStock ? `ขั้นต่ำ ${rec.minStock}` : 'ไม่ได้ตั้งขั้นต่ำ'])
    st.push(['Serial ทั้งหมด', rec.trackSerial ? db.rows(s, 'serials').filter(x => x.item === id).length : '–', rec.trackSerial ? 'ติดตาม Serial' : 'ไม่ติดตาม'])
    st.push(['รับประกัน', rec.warrantyMonths ? rec.warrantyMonths + ' เดือน' : '–', ''])
    st.push(['หมวด', rec.category || '–', [rec.brand, rec.model].filter(Boolean).join(' ')])
  } else if (entity === 'serials') {
    const w = warranty(rec)
    st.push(['สถานะ', <Badge key="a">{rec.status}</Badge>, rec.warehouse ? db.label(s, 'warehouses', rec.warehouse) : ''])
    st.push(['การรับประกัน', <Badge key="b" color={w.color}>{w.text}</Badge>, rec.warrantyEnd ? 'ถึง ' + fmtDate(rec.warrantyEnd) : ''])
    st.push(['ไซต์', db.label(s, 'sites', rec.site), rec.location || ''])
    st.push(['ติดตั้งเมื่อ', fmtDate(rec.installedDate), rec.project ? db.label(s, 'projects', rec.project) : ''])
  }
  if (!st.length) return null
  return <div className="statbar">{st.map(([l, v, sub]) => <div key={l} className="stat"><div className="l">{l}</div><div className="v" style={{ fontSize: typeof v === 'string' && v.length > 10 ? 18 : undefined }}>{v}</div><div className="s">{sub}</div></div>)}</div>
}

export function EntityDetail({ entity }) {
  const { id } = useParams()
  const { s, can } = useApp()
  const nav = useNavigate()
  const [tab, setTab] = useState('info')
  const [edit, setEdit] = useState(false)
  const [inst, setInst] = useState(false)
  const meta = ENT[entity]
  const rec = db.getRec(s, entity, id)
  if (!can(meta.res, 'view')) return <Page title={meta.label}><ErrorBox error="ไม่มีสิทธิ์ดูข้อมูลนี้" /></Page>
  if (!rec) return <Page title={meta.label}><ErrorBox error="ไม่พบรายการ" /></Page>
  if (!db.inScope(s, entity, rec)) return <Page title={meta.label}><ErrorBox error="ไม่มีสิทธิ์เข้าถึงรายการนี้" /></Page>
  const fields = db.fieldsOf(s, entity).filter(f => !f.hidden)
  const tickets = db.rows(s, 'tickets')
  const tcols = [['รหัส', t => <Link to={'/tickets/' + t.id}>{t.code}</Link>], ['หัวข้อ', t => t.title], ['สถานะ', t => db.ticketStatusOf(s, t.status)?.label]]
  const related = []
  if (entity === 'customers') {
    related.push(<RelTable key="s" title="ไซต์" rows={db.rows(s, 'sites').filter(x => x.customer === id)} cols={[['ชื่อ', x => <RefLink entity="sites" id={x.id} />], ['จังหวัด', x => x.province]]} />)
    related.push(<RelTable key="p" title="โครงการ" rows={db.rows(s, 'projects').filter(x => x.customer === id)} cols={[['ชื่อ', x => <RefLink entity="projects" id={x.id} />], ['สถานะ', x => db.projectStatus(s, x)]]} />)
    related.push(<RelTable key="t" title="Ticket" rows={tickets.filter(t => t.customer === id)} cols={tcols} />)
    related.push(<RelTable key="c" title="ผู้ติดต่อ" rows={db.rows(s, 'contacts').filter(x => x.customer === id)} cols={[['ชื่อ', x => x.name], ['ตำแหน่ง', x => x.position], ['โทร', x => x.phone]]} />)
  }
  if (entity === 'vendors') {
    related.push(<RelTable key="po" title="ใบสั่งซื้อ" rows={db.rows(s, 'purchaseOrders').filter(x => x.vendor === id)} cols={[['เลขที่', x => <RefLink entity="purchaseOrders" id={x.id} />], ['สถานะ', x => s.config.workflows.po.statuses.find(z => z.key === x.status)?.label]]} />)
    related.push(<RelTable key="c" title="ผู้ติดต่อ" rows={db.rows(s, 'contacts').filter(x => x.vendor === id)} cols={[['ชื่อ', x => x.name], ['โทร', x => x.phone]]} />)
  }
  if (entity === 'sites') {
    related.push(<RelTable key="sr" title="อุปกรณ์ที่ติดตั้ง" rows={db.rows(s, 'serials').filter(x => x.site === id)} cols={[['Serial', x => <RefLink entity="serials" id={x.id} />], ['สินค้า', x => db.label(s, 'items', x.item)], ['จุด', x => x.location], ['สถานะ', x => x.status]]} />)
    related.push(<RelTable key="t" title="Ticket" rows={tickets.filter(t => t.site === id)} cols={tcols} />)
    related.push(<RelTable key="p" title="แผน PM" rows={db.rows(s, 'pmPlans').filter(x => x.site === id)} cols={[['แผน', x => x.name], ['รอบ', x => x.frequency]]} />)
  }
  if (entity === 'items') {
    const bal = db.balances(s)
    related.push(<RelTable key="b" title="ยอดคงเหลือแยกคลัง" rows={db.rows(s, 'warehouses').map(w => ({ id: w.id, name: w.name, q: bal[w.id]?.[id] || 0 }))} cols={[['คลัง', x => x.name], ['คงเหลือ', x => x.q]]} />)
    if (rec.trackSerial) related.push(<RelTable key="sr" title="Serial ทั้งหมด" rows={db.rows(s, 'serials').filter(x => x.item === id)} cols={[['Serial', x => <RefLink entity="serials" id={x.id} />], ['สถานะ', x => x.status], ['ไซต์', x => db.label(s, 'sites', x.site)]]} />)
  }
  if (entity === 'serials') {
    const w = warranty(rec)
    related.push(<RelTable key="t" title="Ticket ที่เกี่ยวข้อง" rows={tickets.filter(t => t.serial === id || (t.parts || []).some(p => (p.serials || []).includes(id) || p.oldSerial === id))} cols={tcols} />)
  }
  const del = async () => {
    const r = await askConfirm({ title: 'ยกเลิก/ซ่อนรายการ', message: `ยกเลิก/ซ่อน ${meta.label} “${db.label(s, entity, id)}”?\nประวัติจะยังถูกเก็บไว้และกู้คืนได้`, reasonLabel: 'เหตุผล', danger: true, confirmText: 'ยกเลิกรายการ' })
    if (r.ok) { const x = act(st => db.archive(st, entity, id, r.reason)); x.ok ? toast('ยกเลิก/ซ่อนรายการแล้ว') : toast(x.error, 'err') }
  }
  return (
    <Page title={<span>{db.label(s, entity, id)} {rec._deleted && <Badge color="red">ยกเลิก/ซ่อน</Badge>}</span>} subtitle={`${meta.label} · ${rec.code}`}
      actions={<>
        <button className="btn" onClick={() => nav(-1)}>‹ กลับ</button>
        {entity === 'serials' && can('assets', 'edit') && !rec._deleted && <button className="btn" onClick={() => setInst(true)}>บันทึกการติดตั้ง</button>}
        {can(meta.res, 'edit') && !rec._deleted && <button className="btn primary" onClick={() => setEdit(true)}>แก้ไข</button>}
        {can(meta.res, 'delete') && !rec._deleted && <button className="btn danger" onClick={del}>ยกเลิก/ซ่อน</button>}
        {can(meta.res, 'delete') && rec._deleted && <button className="btn" onClick={() => act(st => db.restore(st, entity, id))}>กู้คืน</button>}
      </>}>
      {rec._deleted && <div className="notice bad">รายการนี้ถูกยกเลิก/ซ่อน — เหตุผล: {rec._deleteReason}</div>}
      <DetailStats s={s} entity={entity} rec={rec} />
      <Tabs tabs={[['info', 'ข้อมูล'], ...(entity === 'serials' ? [['hist', 'ประวัติ Serial']] : []), ['audit', 'ประวัติการแก้ไข']]} value={tab} onChange={setTab} />
      {tab === 'info' && (
        <>
          <div className="card">
            {entity === 'serials' && <Kv label="สถานะรับประกัน"><Badge color={warranty(rec).color}>{warranty(rec).text}</Badge> {rec.warrantyEnd && `ถึง ${fmtDate(rec.warrantyEnd)}`}</Kv>}
            {fields.map(f => <Kv key={f.key} label={f.label}><Val f={f} v={rec[f.key]} /></Kv>)}
            <Kv label="สร้างโดย">{db.label(s, 'users', rec._createdBy)} · {fmtDate(rec._createdAt)}</Kv>
            <Kv label="แก้ไขล่าสุด">{db.label(s, 'users', rec._updatedBy)} · {fmtDate(rec._updatedAt)}</Kv>
          </div>
          {related}
        </>
      )}
      {tab === 'hist' && (
        <div className="card">
          <h3>ประวัติ Serial (รับเข้า → ติดตั้ง → ซ่อม → เปลี่ยน)</h3>
          {(rec.history || []).length === 0 ? <Empty text="ยังไม่มีประวัติ" /> : (
            <div className="timeline">{[...rec.history].reverse().map(h => (
              <div key={h.id} className="tl-item"><div className="tl-dot" /><div><b>{h.text}</b><div className="muted small">{db.label(s, 'users', h.by)} · {new Date(h.at).toLocaleString('th-TH')}{h.ref && <> · <Link to={h.ref.entity === 'stockMoves' ? '/warehouse' : `/${h.ref.entity}/${h.ref.id}`}>เอกสารต้นทาง</Link></>}</div></div></div>
            ))}</div>
          )}
        </div>
      )}
      {tab === 'audit' && <div className="card"><History entity={entity} id={id} /></div>}
      {edit && <RecordForm entity={entity} record={rec} onClose={() => setEdit(false)} />}
      {inst && <InstallForm serial={rec} onClose={() => setInst(false)} />}
    </Page>
  )
}
void useMemo; void plainVal
