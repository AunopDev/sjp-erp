import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useApp, Page, DataTable, Modal, FieldInput, Badge, Val, Empty, ErrorBox, History, Kv, Tabs, useSubmit, toast, askConfirm, recPath, RefLink } from '../components/ui'
import { act } from '../lib/store'
import * as db from '../lib/db'
import { ENT } from '../lib/schema'
import { formulaText } from '../lib/modules'
import { buildColumns, RecordForm, ImportModal } from './Entity'
import { fmtNum, fmtDateTime, ymd } from '../lib/util'

const useModule = key => {
  const { s } = useApp()
  const mod = s.config.modules.find(m => m.key === 'm_' + key)
  return { s, mod, entity: 'm_' + key, wf: mod ? s.config.workflows[mod.key] : null }
}
const stOf = (wf, k) => wf?.statuses.find(x => x.key === k)
const titleOf = (s, entity, r) => String(r[ENT[entity].title] ?? r.code ?? '')

function StatusModal({ entity, rec, wf, onClose, preset }) {
  const { s } = useApp()
  const from = stOf(wf, rec.status)
  const opts = wf.statuses.filter(x => x.enabled && x.key !== rec.status && (!from?.next?.length || from.next.includes(x.key)))
  const [to, setTo] = useState(opts.some(o => o.key === preset) ? preset : opts[0]?.key || '')
  const [comment, setComment] = useState('')
  const [fields, setFields] = useState({})
  const [err, setErr] = useState('')
  const [busy, run] = useSubmit()
  const target = stOf(wf, to)
  const ff = db.fieldsOf(s, entity)
  const need = (target?.requiredFields || []).map(k => ff.find(f => f.key === k)).filter(Boolean)
  const go = async () => {
    const r = await run(() => act(st => db.changeModuleStatus(st, entity, rec.id, to, { comment, fields })))
    if (r.ok) { toast(r.data.pending ? 'ส่งคำขออนุมัติแล้ว' : 'เปลี่ยนสถานะแล้ว'); onClose() } else if (r.error !== 'busy') setErr(r.error)
  }
  return (
    <Modal title={'เปลี่ยนสถานะ ' + rec.code} onClose={onClose} footer={<><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn primary" disabled={busy || !to} onClick={go}>ยืนยัน</button></>}>
      <p>สถานะปัจจุบัน: <Badge color={from?.color}>{from?.label || '–'}</Badge></p>
      {opts.length === 0 ? <Empty text="ไม่มีสถานะถัดไปที่เปลี่ยนได้" /> : (
        <>
          <div className="field"><label>เปลี่ยนเป็น</label><select value={to} onChange={e => setTo(e.target.value)}>{opts.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}</select></div>
          {(target?.approverRole || target?.approverUser) && <div className="notice warn small" style={{ marginTop: 8 }}>สถานะนี้ต้องได้รับการอนุมัติก่อนมีผล</div>}
          {need.map(f => <div key={f.key} style={{ marginTop: 10 }}><FieldInput f={{ ...f, required: true }} value={fields[f.key] ?? rec[f.key]} values={{ ...rec, ...fields }} onChange={v => setFields({ ...fields, [f.key]: v })} /></div>)}
          <div className="field" style={{ marginTop: 10 }}><label>หมายเหตุ{from?.final ? ' (จำเป็น — เปิดรายการที่จบแล้ว)' : ''}</label><textarea rows={3} value={comment} onChange={e => setComment(e.target.value)} /></div>
        </>
      )}
      {err && <div className="err" role="alert" style={{ marginTop: 8 }}>{err}</div>}
    </Modal>
  )
}

function Kanban({ s, mod, entity, wf, rows, cols, nav, openStatus }) {
  const gf = mod.groupField && mod.groupField !== 'status' ? db.fieldsOf(s, entity).find(f => f.key === mod.groupField) : null
  const byStatus = !gf && !!wf
  const [drag, setDrag] = useState(null)
  const [busy, run] = useSubmit()
  const sumKey = (mod.summary || [])[0]
  const sumF = db.fieldsOf(s, entity).find(f => f.key === sumKey)
  let columns
  if (byStatus) columns = wf.statuses.filter(x => x.enabled).map(x => ({ key: x.key, label: x.label, color: x.color }))
  else if (gf) columns = [...db.optionsOf(s, gf).map(o => ({ key: o, label: o })), { key: '', label: '(ไม่ระบุ)' }]
  else columns = []
  const val = r => (byStatus ? r.status : r[gf.key] || '')
  const moveTo = (r, key) => {
    if (val(r) === key) return
    if (byStatus) {
      const from = stOf(wf, r.status), target = stOf(wf, key)
      if (from?.final || target?.requiredFields?.length || target?.approverRole || target?.approverUser) return openStatus(r, key)
    }
    run(() => act(st => (byStatus ? db.changeModuleStatus(st, entity, r.id, key, {}) : db.patch(st, entity, r.id, { [gf.key]: key }))), 'ย้ายแล้ว')
  }
  if (!columns.length) return <Empty text="มุมมองบอร์ดต้องมีสถานะ หรือฟิลด์ตัวเลือกสำหรับจัดกลุ่ม — ตั้งค่าได้ที่ ปรับแต่งโมดูล" />
  const canEdit = db.can(s, ENT[entity].res, 'edit')
  const shownCols = cols.filter(c => !['code', 'status'].includes(c.key)).slice(0, 3)
  return (
    <div className="kanban">
      {columns.map(c => {
        const list = rows.filter(r => val(r) === c.key)
        const total = sumF ? list.reduce((a, r) => a + (Number(sumF.type === 'formula' ? formulaText(sumF, r) : r[sumF.key]) || 0), 0) : null
        return (
          <div key={c.key} className="kcol" onDragOver={e => canEdit && e.preventDefault()} onDrop={e => { e.preventDefault(); if (drag) moveTo(drag, c.key); setDrag(null) }}>
            <div className="khead"><Badge color={c.color || 'gray'}>{c.label}</Badge> <b>{list.length}</b>{total !== null && <span className="muted small"> · {fmtNum(total)} {sumF.suffix || ''}</span>}</div>
            {list.length === 0 && <div className="muted small" style={{ padding: 8 }}>ลากการ์ดมาวางที่นี่</div>}
            {list.map(r => (
              <div key={r.id} className="kcard" draggable={canEdit} onDragStart={() => setDrag(r)} onClick={() => nav(recPath(entity, r.id))}>
                <div className="muted small">{r.code}</div>
                <b>{titleOf(s, entity, r)}</b>
                {shownCols.map(c2 => c2.key !== mod.titleField && <div key={c2.key} className="small">{c2.label}: {c2.render ? c2.render(r) : String(r[c2.key] ?? '–')}</div>)}
                {canEdit && (
                  <select aria-label="ย้ายไป" disabled={busy} value={val(r)} onClick={e => e.stopPropagation()} onChange={e => moveTo(r, e.target.value)}>
                    {columns.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function CalView({ s, mod, entity, rows, nav }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const y = cursor.getFullYear(), m = cursor.getMonth()
  const start = new Date(y, m, 1 - new Date(y, m, 1).getDay())
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  const by = {}
  rows.forEach(r => { const d = (r[mod.dateField] || '').slice(0, 10); if (d) (by[d] = by[d] || []).push(r) })
  const today = ymd(new Date())
  if (!mod.dateField) return <Empty text="ยังไม่ได้เลือกฟิลด์วันที่สำหรับปฏิทิน — ตั้งค่าได้ที่ ปรับแต่งโมดูล" />
  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="btn" onClick={() => setCursor(new Date(y, m - 1, 1))}>เดือนก่อน</button>
        <b style={{ minWidth: 170, textAlign: 'center' }}>{cursor.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}</b>
        <button className="btn" onClick={() => setCursor(new Date(y, m + 1, 1))}>เดือนถัดไป</button>
      </div>
      <div className="cal">
        {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(d => <div key={d} className="dow">{d}</div>)}
        {days.map(d => {
          const k = ymd(d), list = by[k] || []
          return (
            <div key={k} className={'day' + (d.getMonth() !== m ? ' other' : '') + (k === today ? ' today' : '')}>
              <div className="small">{d.getDate()}</div>
              {list.slice(0, 3).map(r => <a key={r.id} href="#x" className="ev t-project" onClick={e => { e.preventDefault(); nav(recPath(entity, r.id)) }} title={titleOf(s, entity, r)}>{titleOf(s, entity, r)}</a>)}
              {list.length > 3 && <div className="small muted">+{list.length - 3}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ModulePage() {
  const { key } = useParams()
  const { s, mod, entity, wf } = useModule(key)
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const [form, setForm] = useState(sp.get('new') === '1')
  useEffect(() => { if (sp.get('new')) setSp({}, { replace: true }) }, [])
  const [imp, setImp] = useState(false)
  const [arch, setArch] = useState(false)
  const [viewSel, setViewSel] = useState(null)
  const [stModal, setStModal] = useState(null)
  if (!mod) return <Page title="ไม่พบโมดูล"><ErrorBox error="ไม่พบโมดูลนี้ (อาจถูกปิดหรือลบแล้ว)" /></Page>
  const res = ENT[entity].res
  if (!db.can(s, res, 'view')) return <Page title={mod.name}><ErrorBox error="ไม่มีสิทธิ์ดูข้อมูลของโมดูลนี้" /></Page>
  const fields = db.fieldsOf(s, entity)
  const rows = db.rows(s, entity, { archived: arch })
  const live = rows.filter(r => !r._deleted)
  const hasSelect = fields.some(f => f.type === 'select')
  const kanbanOk = !!wf || hasSelect
  const views = [['table', 'ตาราง'], ...(kanbanOk ? [['kanban', 'บอร์ด']] : []), ...(fields.some(f => f.type === 'date' || f.type === 'datetime') ? [['calendar', 'ปฏิทิน']] : [])]
  const view = views.some(v => v[0] === (viewSel || mod.view)) ? viewSel || mod.view : 'table'
  const extra = {}
  if (wf) extra.status = { label: 'สถานะ', value: r => stOf(wf, r.status)?.label || '', render: r => <Badge color={stOf(wf, r.status)?.color}>{stOf(wf, r.status)?.label || '–'}</Badge> }
  const cols = buildColumns(s, entity, extra)
  cols.forEach(c => { if (c.key === 'code') c.render = r => <span>{r.code}</span> })
  const data = rows.map(r => ({ ...r, _search: Object.values(r).filter(x => typeof x === 'string').join(' ') }))
  const filters = (mod.filters || []).map(k => {
    const f = fields.find(x => x.key === k)
    if (!f) return null
    if (f.type === 'ref') return { key: k, label: f.label, options: db.rows(s, f.ref).map(r => [r.id, db.label(s, f.ref, r.id)]), get: r => r[k] }
    return { key: k, label: f.label, options: db.optionsOf(s, f), get: r => r[k] }
  }).filter(Boolean)
  if (wf) filters.unshift({ key: 'status', label: 'สถานะ', options: wf.statuses.map(x => [x.key, x.label]), get: r => r.status })
  const sums = (mod.summary || []).map(k => fields.find(f => f.key === k)).filter(Boolean).map(f => ({ f, v: live.reduce((a, r) => a + (Number(f.type === 'formula' ? formulaText(f, r) : r[f.key]) || 0), 0) }))
  const canCreate = db.can(s, res, 'create')
  return (
    <Page title={mod.name} subtitle={mod.desc}
      actions={<>
        {db.can(s, res, 'delete') && <label className="check small"><input type="checkbox" checked={arch} onChange={e => setArch(e.target.checked)} /> แสดงที่ถูกยกเลิก/ซ่อน</label>}
        {db.can(s, 'settings', 'edit') && <Link className="btn" to={'/settings/modules?m=' + mod.key}>ปรับแต่งโมดูล</Link>}
        {canCreate && <button className="btn" onClick={() => setImp(true)}>นำเข้า CSV</button>}
        {canCreate && <button className="btn primary" onClick={() => setForm(true)}>+ เพิ่มรายการ</button>}
      </>}>
      <div className="grid c4" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="n">{live.length}</div><div className="l">รายการทั้งหมด</div></div>
        {wf && wf.statuses.filter(x => x.enabled).slice(0, 5).map(x => <div key={x.key} className="kpi"><div className="n">{live.filter(r => r.status === x.key).length}</div><div className="l">{x.label}</div></div>)}
        {sums.map(({ f, v }) => <div key={f.key} className="kpi"><div className="n" style={{ fontSize: 28 }}>{fmtNum(v)}</div><div className="l">รวม {f.label} {f.suffix || ''}</div></div>)}
      </div>
      {views.length > 1 && <Tabs tabs={views} value={view} onChange={setViewSel} />}
      {view === 'table' && <DataTable key={entity} tabs={wf ? [{ key: 'all', label: 'ทั้งหมด' }, ...wf.statuses.filter(x => x.enabled).map(x => ({ key: x.key, label: x.label, test: r => r.status === x.key }))] : undefined} columns={cols} data={data} filters={filters} onRow={r => nav(recPath(entity, r.id))} exportName={mod.name} canExport={db.can(s, res, 'export')}
        rowClass={r => (r._deleted ? 'hl-3' : '')} emptyText={`ยังไม่มีข้อมูลใน “${mod.name}” — กด “เพิ่มรายการ” เพื่อเริ่มต้น`} />}
      {view === 'kanban' && <Kanban s={s} mod={mod} entity={entity} wf={wf} rows={live} cols={cols} nav={nav} openStatus={(rec, key) => setStModal({ rec, key })} />}
      {view === 'calendar' && <CalView s={s} mod={mod} entity={entity} rows={live} nav={nav} />}
      {form && <RecordForm entity={entity} title={'เพิ่ม — ' + mod.name} onClose={() => setForm(false)} onSaved={r => r?.id && nav(recPath(entity, r.id))} />}
      {imp && <ImportModal entity={entity} onClose={() => setImp(false)} />}
      {stModal && wf && <StatusModal entity={entity} rec={stModal.rec} wf={wf} preset={stModal.key} onClose={() => setStModal(null)} />}
    </Page>
  )
}

export function ModuleDetail() {
  const { key, id } = useParams()
  const { s, mod, entity, wf } = useModule(key)
  const nav = useNavigate()
  const [tab, setTab] = useState('info')
  const [edit, setEdit] = useState(false)
  const [st, setSt] = useState(false)
  const [note, setNote] = useState('')
  const [busy, run] = useSubmit()
  if (!mod) return <Page title="ไม่พบโมดูล"><ErrorBox error="ไม่พบโมดูลนี้" /></Page>
  const res = ENT[entity].res
  const rec = db.getRec(s, entity, id)
  if (!db.can(s, res, 'view')) return <Page title={mod.name}><ErrorBox error="ไม่มีสิทธิ์ดูข้อมูลนี้" /></Page>
  if (!rec) return <Page title={mod.name}><ErrorBox error="ไม่พบรายการ" /></Page>
  if (!db.inScope(s, entity, rec)) return <Page title={mod.name}><ErrorBox error="ไม่มีสิทธิ์เข้าถึงรายการนี้" /></Page>
  const fields = db.fieldsOf(s, entity).filter(f => !f.hidden && (!f.showIf || rec[f.showIf.field] === f.showIf.value))
  const cur = stOf(wf, rec.status)
  const canEdit = db.can(s, res, 'edit') && !rec._deleted
  const rev = db.reverseRefs(s, entity, id)
  const pend = s.approvals.filter(a => a.entity === entity && a.recId === id && a.status === 'pending')
  const del = async () => {
    const r = await askConfirm({ title: 'ยกเลิก/ซ่อนรายการ', message: `ยกเลิก/ซ่อน “${titleOf(s, entity, rec)}”?\nประวัติยังถูกเก็บไว้และกู้คืนได้`, reasonLabel: 'เหตุผล', danger: true, confirmText: 'ยกเลิกรายการ' })
    if (r.ok) { const x = act(t => db.archive(t, entity, id, r.reason)); x.ok ? toast('ยกเลิก/ซ่อนรายการแล้ว') : toast(x.error, 'err') }
  }
  return (
    <Page title={<span>{titleOf(s, entity, rec)} {rec._deleted && <Badge color="red">ยกเลิก/ซ่อน</Badge>}</span>} subtitle={`${mod.name} · ${rec.code}`}
      actions={<>
        <button className="btn" onClick={() => nav('/m/' + key)}>กลับรายการ</button>
        {wf && canEdit && <button className="btn primary" onClick={() => setSt(true)}>เปลี่ยนสถานะ</button>}
        {canEdit && <button className="btn" onClick={() => setEdit(true)}>แก้ไข</button>}
        {db.can(s, res, 'delete') && !rec._deleted && <button className="btn danger" onClick={del}>ยกเลิก/ซ่อน</button>}
        {db.can(s, res, 'delete') && rec._deleted && <button className="btn" onClick={() => act(t => db.restore(t, entity, id))}>กู้คืน</button>}
      </>}>
      {rec._deleted && <div className="notice bad">รายการนี้ถูกยกเลิก/ซ่อน — เหตุผล: {rec._deleteReason}</div>}
      {pend.map(a => <div key={a.id} className="notice warn">รออนุมัติ: {a.title}</div>)}
      {wf && <div className="card row"><span className="muted">สถานะ</span><Badge color={cur?.color}>{cur?.label || '–'}</Badge></div>}
      <Tabs tabs={[['info', 'ข้อมูล'], ['tl', `ความเคลื่อนไหว (${(rec.timeline || []).length})`], ['audit', 'ประวัติการแก้ไข']]} value={tab} onChange={setTab} />
      {tab === 'info' && (
        <>
          <div className="card">
            {fields.map(f => f.type === 'section' ? <div key={f.key} className="section-title">{f.label}</div> : <Kv key={f.key} label={f.label}><Val f={f} v={rec[f.key]} rec={rec} /></Kv>)}
            <Kv label="สร้างโดย">{db.label(s, 'users', rec._createdBy)} · {fmtDateTime(rec._createdAt)}</Kv>
            <Kv label="แก้ไขล่าสุด">{db.label(s, 'users', rec._updatedBy)} · {fmtDateTime(rec._updatedAt)}</Kv>
          </div>
          {rev.map(g => (
            <div key={g.entity + g.field} className="card"><h3>{ENT[g.entity].label} ที่อ้างถึงรายการนี้ ({g.list.length}) <span className="muted small">ผ่านฟิลด์ “{g.field}”</span></h3>
              {g.list.slice(0, 20).map(r => <div key={r.id} style={{ padding: '3px 0' }}><RefLink entity={g.entity} id={r.id} /> <span className="muted small">{r.code}</span></div>)}</div>
          ))}
        </>
      )}
      {tab === 'tl' && (
        <div className="card">
          {canEdit && (
            <div className="row" style={{ marginBottom: 12 }}>
              <input placeholder="พิมพ์บันทึก/ความคืบหน้า แล้วกดเพิ่ม" value={note} onChange={e => setNote(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
              <button className="btn primary" disabled={busy || !note.trim()} onClick={async () => { const r = await run(() => act(t => db.moduleNote(t, entity, id, note)), 'เพิ่มบันทึกแล้ว'); if (r.ok) setNote('') }}>เพิ่มบันทึก</button>
            </div>
          )}
          {(rec.timeline || []).length === 0 ? <Empty text="ยังไม่มีความเคลื่อนไหว" /> : (
            <div className="timeline">{[...rec.timeline].reverse().map(x => (
              <div key={x.id} className="tl-item"><div className="tl-dot" /><div><div>{x.type !== 'status' && <Badge>{{ note: 'บันทึก', approval: 'อนุมัติ' }[x.type] || x.type}</Badge>} {x.text}</div><div className="muted small">{db.label(s, 'users', x.by)} · {fmtDateTime(x.at)}</div></div></div>
            ))}</div>
          )}
        </div>
      )}
      {tab === 'audit' && <div className="card"><History entity={entity} id={id} /></div>}
      {edit && <RecordForm entity={entity} record={rec} onClose={() => setEdit(false)} />}
      {st && wf && <StatusModal entity={entity} rec={rec} wf={wf} onClose={() => setSt(false)} />}
    </Page>
  )
}
