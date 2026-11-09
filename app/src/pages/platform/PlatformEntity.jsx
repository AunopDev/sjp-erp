import React, { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Page, DataTable, Badge, ErrorBox, Modal, toast, askConfirm, useSubmit } from '../../components/ui'
import { usePlatform } from '../../platform/session'
import { tr } from '../../platform/util'
import { RecordForm, showVal, money } from './shared'
import { fmtDateTime } from '../../lib/util'

// company switcher + language switch shown on every platform page
export function PlatBar() {
  const { companies, company, setCompany, lang, setLang } = usePlatform()
  return (
    <div className="row">
      {companies.length > 1 && (
        <select value={company || ''} onChange={e => setCompany(e.target.value)} aria-label={lang === 'en' ? 'Company' : 'บริษัท'}>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      <div className="seg" role="group" aria-label="language">
        {[['th', 'ไทย'], ['en', 'EN']].map(([k, l]) => <button key={k} className={'btn sm' + (lang === k ? ' primary' : '')} aria-pressed={lang === k} onClick={() => setLang(k)}>{l}</button>)}
      </div>
    </div>
  )
}

const stateColor = (screen, key) => {
  const st = screen.workflow?.states.find(s => s.key === key)
  return st?.final ? 'gray' : st?.locked ? 'green' : key === 'rejected' ? 'red' : key === 'pending' || key === 'waiting' ? 'amber' : 'blue'
}

function useScreen(module, entity) {
  const { get, P, company, lang } = usePlatform()
  void P; void company
  const screen = get(`/api/meta/screen/${module}/${entity}`)
  return { screen, lang, get }
}

export function PlatformList() {
  const { module, entity } = useParams()
  const nav = useNavigate()
  const { screen, lang, get } = useScreen(module, entity)
  if (!screen.ok) return <Page title={lang === 'en' ? 'Not available' : 'ใช้งานไม่ได้'} actions={<PlatBar />}><ErrorBox error={screen.error} /></Page>
  const sc = screen.data
  const list = get(`/api/data/${module}/${entity}`, { pageSize: 500 })
  const items = list.ok ? list.data.items : []
  const cols = sc.list.columns.map(k => sc.fields.find(f => f.key === k)).filter(Boolean)
  const columns = [
    { key: 'code', label: lang === 'en' ? 'No.' : 'เลขที่' },
    ...cols.map(f => ({
      key: f.key, label: tr(f.label, lang),
      render: r => (f.key === sc.workflow?.field || f.key === 'status' ? <Badge color={stateColor(sc, r[f.key])}>{tr(sc.workflow?.states.find(s => s.key === r[f.key])?.label, lang)}</Badge> : showVal(f, r, lang)),
      value: r => showVal(f, r, lang)
    }))
  ]
  const filters = (sc.list.filters || []).map(k => sc.fields.find(f => f.key === k)).filter(f => f && f.type === 'select').map(f => ({
    key: f.key, get: r => r[f.key], label: tr(f.label, lang), options: (f.options || []).map(o => (typeof o === 'object' ? [o.value, tr(o.label, lang)] : [o, o]))
  }))
  return (
    <Page title={tr(sc.label, lang)} icon="puzzle" subtitle={lang === 'en' ? 'Generated from the module definition' : 'หน้านี้สร้างอัตโนมัติจากคำนิยามโมดูล'}
      actions={<><PlatBar />{sc.can.create && <button className="btn primary" onClick={() => nav(`/p/${module}/${entity}/new`)}>+ {lang === 'en' ? 'New' : 'สร้างใหม่'}</button>}</>}>
      {!list.ok ? <ErrorBox error={list.error} /> : (
        <DataTable columns={columns} data={items} filters={filters} exportName={entity} canExport={false}
          onRow={r => nav(`/p/${module}/${entity}/${r.id}`)}
          emptyText={lang === 'en' ? 'No records yet' : 'ยังไม่มีข้อมูล'} emptyAction={sc.can.create ? { label: lang === 'en' ? 'Create the first one' : 'สร้างรายการแรก', onClick: () => nav(`/p/${module}/${entity}/new`) } : undefined} />
      )}
    </Page>
  )
}

function CommentModal({ action, lang, onClose, onDone }) {
  const [text, setText] = useState('')
  return (
    <Modal title={tr(action.label, lang)} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{lang === 'en' ? 'Cancel' : 'ยกเลิก'}</button><button className="btn primary" onClick={() => onDone(text)}>{tr(action.label, lang)}</button></>}>
      <div className="field"><label htmlFor="cm">{lang === 'en' ? (action.requireComment ? 'Reason (required)' : 'Comment') : (action.requireComment ? 'เหตุผล (จำเป็น)' : 'หมายเหตุ')}</label><textarea id="cm" rows={3} value={text} onChange={e => setText(e.target.value)} autoFocus /></div>
    </Modal>
  )
}

export function PlatformRecord() {
  const { module, entity, id } = useParams()
  const nav = useNavigate()
  const { screen, lang, get } = useScreen(module, entity)
  const { send } = usePlatform()
  const isNew = id === 'new'
  const rec = isNew ? { ok: true, data: {} } : get(`/api/data/${module}/${entity}/${id}`)
  const [values, setValues] = useState(null)
  const [errors, setErrors] = useState({})
  const [busy, run] = useSubmit()
  const [prompt, setPrompt] = useState(null)
  useEffect(() => { setValues(null); setErrors({}) }, [id, module, entity])
  if (!screen.ok) return <Page title={lang === 'en' ? 'Not available' : 'ใช้งานไม่ได้'} actions={<PlatBar />}><ErrorBox error={screen.error} /></Page>
  if (!rec.ok) return <Page title={lang === 'en' ? 'Not found' : 'ไม่พบรายการ'} actions={<PlatBar />}><ErrorBox error={rec.error} /><Link to={`/p/${module}/${entity}`}>{lang === 'en' ? 'Back to list' : 'กลับไปรายการ'}</Link></Page>
  const sc = screen.data, r = rec.data
  const v = values || r
  const wfKey = sc.workflow?.field || 'status'
  const stateNow = sc.workflow?.states.find(s => s.key === r[wfKey])
  const locked = !!stateNow?.locked
  const editable = isNew ? sc.can.create : sc.can.edit && !locked
  const dirty = values !== null

  const save = () => run(async () => {
    const res = isNew ? send('POST', `/api/data/${module}/${entity}`, v) : send('PATCH', `/api/data/${module}/${entity}/${id}`, v)
    if (!res.ok) { setErrors(res.fieldErrors || {}); return res }
    toast(lang === 'en' ? 'Saved' : 'บันทึกแล้ว')
    setValues(null); setErrors({})
    if (isNew) nav(`/p/${module}/${entity}/${res.data.id}`, { replace: true })
    return res
  })
  const doTransition = (a, comment) => run(async () => {
    const res = send('POST', `/api/data/${module}/${entity}/${id}/transition/${a.key}`, { comment })
    if (res.ok) { setPrompt(null); setValues(null); toast(tr(a.label, lang)) }
    return res
  })
  const remove = async () => {
    const c = await askConfirm({ title: lang === 'en' ? 'Delete this record?' : 'ลบรายการนี้?', message: r.code, confirmText: lang === 'en' ? 'Delete' : 'ลบ', danger: true })
    if (!c.ok) return
    const res = send('DELETE', `/api/data/${module}/${entity}/${id}`)
    if (!res.ok) toast(res.error, 'err'); else { toast(lang === 'en' ? 'Deleted' : 'ลบแล้ว'); nav(`/p/${module}/${entity}`) }
  }
  const audit = isNew ? { ok: true, data: [] } : get('/api/audit', { entity: sc.id, recordId: id })
  return (
    <Page title={isNew ? `${lang === 'en' ? 'New' : 'สร้าง'} ${tr(sc.label, lang)}` : `${tr(sc.label, lang)} ${r.code}`} icon="puzzle"
      actions={<><PlatBar /><Link className="btn" to={`/p/${module}/${entity}`}>{lang === 'en' ? 'Back' : 'กลับ'}</Link></>}>
      {!isNew && stateNow && <div className="row" style={{ marginBottom: 12 }}><Badge color={stateColor(sc, stateNow.key)}>{tr(stateNow.label, lang)}</Badge>{locked && <span className="muted">{lang === 'en' ? 'Locked — editing is disabled in this state' : 'เอกสารถูกล็อก แก้ไขไม่ได้ในสถานะนี้'}</span>}</div>}
      <div className="card">
        {isNew && <div className="hint" style={{ marginBottom: 10 }}>{lang === 'en' ? 'Fields marked * are required.' : 'ช่องที่มีเครื่องหมาย * จำเป็นต้องกรอก'}</div>}
        {!isNew && !editable && !locked && <div className="notice">{lang === 'en' ? 'You can view this record but not change it.' : 'คุณดูรายการนี้ได้ แต่ไม่มีสิทธิ์แก้ไข'}</div>}
        <RecordForm screen={sc} values={v} setValues={setValues} errors={errors} disabled={!editable} lang={lang} />
        {errors && Object.keys(errors).length > 0 && <div className="err" role="alert" style={{ marginTop: 10 }}>{Object.values(errors)[0]}</div>}
        <div className="sticky-actions">
          {editable && <button className="btn primary" disabled={busy || (!isNew && !dirty)} onClick={save}>{lang === 'en' ? 'Save' : 'บันทึก'}</button>}
          {!isNew && (r._actions || []).map(a => (
            <button key={a.key} className={'btn' + (a.approval ? ' primary' : '')} disabled={busy || dirty} onClick={() => (a.requireComment ? setPrompt(a) : doTransition(a, ''))}>{tr(a.label, lang)}</button>
          ))}
          {!isNew && sc.can.delete && !locked && <button className="btn danger" onClick={remove}>{lang === 'en' ? 'Delete' : 'ลบ'}</button>}
        </div>
      </div>
      {!isNew && (
        <div className="card">
          <h3>{lang === 'en' ? 'Audit log' : 'ประวัติการแก้ไข (Audit log)'}</h3>
          {!audit.ok ? <div className="muted">{audit.error}</div> : audit.data.length === 0 ? <div className="muted">–</div> : (
            <ul className="plain">{audit.data.map(a => (
              <li key={a.id}><b>{a.userName}</b> · {fmtDateTime(a.at)} — {tr(a.summary, lang)}
                {a.changes?.length > 0 && <ul>{a.changes.map((c, i) => <li key={i} className="small muted">{tr(c.label, lang)}: {JSON.stringify(c.from)} → {JSON.stringify(c.to)}</li>)}</ul>}
              </li>
            ))}</ul>
          )}
        </div>
      )}
      {prompt && <CommentModal action={prompt} lang={lang} onClose={() => setPrompt(null)} onDone={t => doTransition(prompt, t)} />}
    </Page>
  )
}

export function PlatformReport() {
  const { module, key } = useParams()
  const { get, lang } = usePlatform()
  const r = get(`/api/reports/${module}/${key}`)
  const H = { label: lang === 'en' ? 'Item' : 'รายการ', value: r.ok ? tr(r.data.valueLabel, lang) || (lang === 'en' ? 'Value' : 'ค่า') : '', debit: lang === 'en' ? 'Debit' : 'เดบิต', credit: lang === 'en' ? 'Credit' : 'เครดิต', balance: lang === 'en' ? 'Balance' : 'คงเหลือ' }
  return (
    <Page title={r.ok ? tr(r.data.label, lang) : (lang === 'en' ? 'Report' : 'รายงาน')} icon="chart" actions={<PlatBar />}>
      {!r.ok ? <ErrorBox error={r.error} /> : (
        <div className="tablecard"><div className="table-wrap">
          <table className="tbl"><thead><tr>{r.data.columns.map(c => <th key={c}>{H[c] || c}</th>)}</tr></thead>
            <tbody>
              {r.data.rows.map(x => <tr key={x.key}>{r.data.columns.map(c => <td key={c} data-label={H[c]}>{c === 'label' ? x.label : money(x[c])}</td>)}</tr>)}
              {!r.data.rows.length && <tr><td colSpan={r.data.columns.length} className="muted">{lang === 'en' ? 'No data' : 'ยังไม่มีข้อมูล'}</td></tr>}
              {r.data.rows.length > 0 && r.data.type === 'rowsSum' && <tr><th>{lang === 'en' ? 'Total' : 'รวม'}</th>{r.data.columns.slice(1).map(c => <th key={c}>{c === 'balance' ? money(r.data.totals.debit - r.data.totals.credit) : money(r.data.totals[c])}</th>)}</tr>}
            </tbody></table>
        </div></div>
      )}
    </Page>
  )
}
