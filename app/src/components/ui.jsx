import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Icon, { iconForPath } from './Icon'
import { useStore, act, mutate } from '../lib/store'
import * as db from '../lib/db'
import { ENT } from '../lib/schema'
import { fmtDate, fmtDateTime, fmtNum, toLocalInput, toCsv, downloadFile, nowIso } from '../lib/util'
import { formulaText } from '../lib/modules'

export function useApp() {
  const s = useStore()
  const user = db.cur(s)
  return { s, user, can: (res, a) => db.can(s, res, a) }
}

// ---------- toast & confirm hosts ----------
let toastFn = () => {}
let confirmFn = () => Promise.resolve({ ok: false })
export const toast = (msg, type = 'ok') => toastFn(msg, type)
export const askConfirm = opts => confirmFn(opts)

export function Hosts() {
  const [toasts, setToasts] = useState([])
  const [cf, setCf] = useState(null)
  const [reason, setReason] = useState('')
  useEffect(() => {
    toastFn = (msg, type) => {
      const id = Math.random()
      setToasts(t => [...t, { id, msg, type }])
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), type === 'err' ? 6000 : 3000)
    }
    confirmFn = opts => new Promise(res => { setReason(''); setCf({ ...opts, res }) })
  }, [])
  const close = ok => {
    if (cf.reasonLabel && ok && cf.reasonRequired !== false && !reason.trim()) return
    cf.res({ ok, reason: reason.trim() })
    setCf(null)
  }
  return (
    <>
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(t => <div key={t.id} className={'toast ' + t.type}>{t.msg}</div>)}
      </div>
      {cf && (
        <Modal title={cf.title || 'ยืนยันการดำเนินการ'} onClose={() => close(false)}
          footer={<>
            <button className="btn" onClick={() => close(false)}>ยกเลิก</button>
            <button className={'btn ' + (cf.danger ? 'danger' : 'primary')} onClick={() => close(true)}>{cf.confirmText || 'ยืนยัน'}</button>
          </>}>
          <div style={{ whiteSpace: 'pre-wrap' }}>{cf.message}</div>
          {cf.extra}
          {cf.reasonLabel && (
            <label className="field" style={{ marginTop: 12 }}>
              <span>{cf.reasonLabel}{cf.reasonRequired !== false && <b className="req"> *</b>}</span>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} autoFocus />
            </label>
          )}
        </Modal>
      )}
    </>
  )
}

// run an action once at a time; shows toast with result
export function useSubmit() {
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const run = async (fn, okMsg) => {
    if (lock.current) return { ok: false, error: 'busy' }
    lock.current = true
    setBusy(true)
    try {
      const r = await fn()
      if (r && r.ok === false) toast(r.error, 'err')
      else if (okMsg) toast(okMsg)
      return r
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return [busy, run]
}

// ---------- basic bits ----------
export const Badge = ({ color = 'gray', children }) => <span className={'badge ' + color}>{children}</span>
export const Loading = ({ text = 'กำลังโหลดข้อมูล…' }) => <div className="state"><div className="spinner" />{text}</div>
export const Empty = ({ text = 'ไม่มีข้อมูล', children }) => <div className="state empty">{text}{children}</div>
export const ErrorBox = ({ error }) => <div className="state error">เกิดข้อผิดพลาด: {String(error)}</div>
export function Page({ title, subtitle, actions, children, icon }) {
  const ready = true // data is local: show the page at once instead of a flash of "loading"
  const loc = useLocation()
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1><Icon name={icon || iconForPath(loc.pathname)} size={30} className="h1-ic" />{title}</h1>
          {subtitle && <div className="muted">{subtitle}</div>}
        </div>
        <div className="page-actions">{actions}</div>
      </div>
      {ready ? children : <Loading />}
    </div>
  )
}

let modalDepth = 0
export function Modal({ title, onClose, children, footer, wide, guard }) {
  const guardRef = useRef(guard)
  guardRef.current = guard
  const tryClose = async () => {
    if (guardRef.current) {
      const r = await askConfirm({ title: 'ละทิ้งข้อมูลที่กรอก?', message: 'ข้อมูลที่ยังไม่บันทึกจะหายไป', confirmText: 'ละทิ้ง', danger: true })
      if (!r.ok) return
    }
    onClose()
  }
  useEffect(() => {
    modalDepth++
    const mine = modalDepth
    const h = e => e.key === 'Escape' && mine === modalDepth && tryClose()
    document.addEventListener('keydown', h)
    return () => { modalDepth--; document.removeEventListener('keydown', h) }
  }, [])
  return (
    <div className="modal-back" onMouseDown={e => e.target === e.currentTarget && tryClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h3>{title}</h3><button className="btn ghost" onClick={tryClose} aria-label="ปิด">ปิด</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className={'tabs' + (tabs.length > 7 ? ' many' : '')} role="tablist">
      {tabs.map(t => (
        <button key={t[0]} role="tab" aria-selected={value === t[0]} className={value === t[0] ? 'active' : ''} onClick={() => onChange(t[0])}>{t[1]}{t[2] !== undefined && <span className="tab-count">{t[2]}</span>}</button>
      ))}
    </div>
  )
}

export function recPath(entity, id) {
  if (entity.startsWith('m_')) return `/m/${entity.slice(2)}/${id}`
  if (entity === 'pmRecords') return `/pm/records/${id}`
  if (entity === 'pmPlans' || entity === 'pmTemplates') return '/pm'
  if (entity === 'stockMoves' || entity === 'warehouses') return '/warehouse'
  return `/${entity}/${id}`
}

export function RefLink({ entity, id }) {
  const { s } = useApp()
  if (!id) return <span className="muted">–</span>
  if (entity === 'users') return <span>{db.label(s, 'users', id)}</span>
  const r = db.getRec(s, entity, id)
  if (!r) return <span className="muted">(ไม่พบ)</span>
  return <Link to={recPath(entity, id)} onClick={e => e.stopPropagation()}>{db.label(s, entity, id)}</Link>
}

export function Val({ f, v, rec }) {
  const { s } = useApp()
  if (f.type === 'section') return null
  if (f.type === 'formula') { const x = formulaText(f, rec || {}); return x === '' ? <span className="muted">–</span> : <span>{fmtNum(x)}{f.suffix ? ' ' + f.suffix : ''}</span> }
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return <span className="muted">–</span>
  switch (f.type) {
    case 'ref': return <RefLink entity={f.ref} id={v} />
    case 'boolean': return v ? 'ใช่' : 'ไม่'
    case 'date': return fmtDate(v)
    case 'datetime': return fmtDateTime(v)
    case 'number': return <span>{fmtNum(v)}{f.suffix ? ' ' + f.suffix : ''}</span>
    case 'multiselect': return <span>{v.map(x => <span key={x} className="badge" style={{ marginRight: 4 }}>{x}</span>)}</span>
    case 'url': return <a href={/^https?:/.test(v) ? v : '#'} target="_blank" rel="noreferrer noopener">{v}</a>
    case 'email': return <a href={'mailto:' + v}>{v}</a>
    case 'phone': return <a href={'tel:' + v}>{v}</a>
    case 'file': return <span>{v.map(x => x.name).join(', ')}</span>
    case 'rows': return (
      <table className="mini"><thead><tr>{f.cols.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead>
        <tbody>{v.map((r, i) => <tr key={i}>{f.cols.map(c => <td key={c.key}>{c.type === 'ref' ? db.label(s, c.ref, r[c.key]) : String(r[c.key] ?? '')}</td>)}</tr>)}</tbody></table>
    )
    default: return <span style={{ whiteSpace: 'pre-wrap' }}>{String(v)}</span>
  }
}
export function plainVal(s, f, v, rec) {
  if (f.type === 'formula') return formulaText(f, rec || {})
  if (Array.isArray(v) && f.type === 'multiselect') return v.join('; ')
  if (v === undefined || v === null) return ''
  if (f.type === 'ref') return db.label(s, f.ref, v)
  if (f.type === 'boolean') return v ? 'ใช่' : 'ไม่'
  if (f.type === 'file') return (v || []).map(x => x.name).join('; ')
  if (f.type === 'rows') return (v || []).map(r => f.cols.map(c => (c.type === 'ref' ? db.label(s, c.ref, r[c.key]) : r[c.key] ?? '')).join(' / ')).join(' | ')
  if (f.type === 'date') return v
  return String(v)
}

// ---------- inputs ----------
function refOptions(s, entity) {
  if (entity === 'users') return s.users.filter(u => u.active !== false).map(u => [u.id, u.name])
  return db.rows(s, entity).map(r => [r.id, db.label(s, entity, r.id) + (r.code && entity !== 'purchaseOrders' && r.code !== db.label(s, entity, r.id) ? ` (${r.code})` : '')])
}

export function FieldInput({ f, value, onChange, error, disabled, values }) {
  const { s, user } = useApp()
  const v = value ?? ''
  const id = 'f-' + f.key
  let input
  if (f.type === 'section') return <div className="section-title">{f.label}{f.help && <div className="muted small" style={{ fontWeight: 400 }}>{f.help}</div>}</div>
  switch (f.type) {
    case 'formula': {
      const x = formulaText(f, values || {})
      input = <div className="formula-box">{x === '' ? '–' : fmtNum(x)}{f.suffix ? ' ' + f.suffix : ''} <span className="muted small">(คำนวณอัตโนมัติ)</span></div>
      break
    }
    case 'multiselect': {
      const opts = f.options || []
      const cur = Array.isArray(value) ? value : []
      input = <div className="row">{opts.map(o => <label key={o} className="check"><input type="checkbox" disabled={disabled} checked={cur.includes(o)} onChange={e => onChange(e.target.checked ? [...cur, o] : cur.filter(x => x !== o))} /> {o}</label>)}</div>
      break
    }
    case 'email': case 'url': case 'phone':
      input = <input id={id} type={f.type === 'phone' ? 'tel' : f.type} value={v} disabled={disabled} onChange={e => onChange(e.target.value)} />; break
    case 'textarea':
      input = <textarea id={id} rows={3} value={v} disabled={disabled} onChange={e => onChange(e.target.value)} />; break
    case 'number':
      input = <div className="with-suffix"><input id={id} type="number" inputMode="decimal" value={v} disabled={disabled} onChange={e => onChange(e.target.value === '' ? '' : e.target.value)} />{f.suffix && <span>{f.suffix}</span>}</div>; break
    case 'date':
      input = <input id={id} type="date" value={v} disabled={disabled} onChange={e => onChange(e.target.value)} />; break
    case 'datetime':
      input = <input id={id} type="datetime-local" value={toLocalInput(v)} disabled={disabled} onChange={e => onChange(e.target.value ? new Date(e.target.value).toISOString() : '')} />; break
    case 'select': {
      const opts = db.optionsOf(s, f)
      input = (
        <select id={id} value={v} disabled={disabled} onChange={e => onChange(e.target.value)}>
          <option value="">– เลือก –</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
          {v && !opts.includes(v) && <option value={v}>{v} (ค่าเดิม)</option>}
        </select>
      )
      break
    }
    case 'boolean':
      input = <label className="check"><input id={id} type="checkbox" checked={!!value} disabled={disabled} onChange={e => onChange(e.target.checked)} /> ใช่</label>; break
    case 'ref': {
      const opts = refOptions(s, f.ref)
      input = (
        <select id={id} value={v} disabled={disabled} onChange={e => onChange(e.target.value)}>
          <option value="">– เลือก –</option>
          {opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      )
      break
    }
    case 'file': {
      const list = value || []
      input = (
        <div>
          <input id={id} type="file" multiple disabled={disabled} onChange={e => {
            const add = Array.from(e.target.files).map(x => ({ name: x.name, size: x.size, at: nowIso(), by: user?.id }))
            onChange([...list, ...add]); e.target.value = ''
          }} />
          {list.map((x, i) => (
            <div key={i} className="file-row">{x.name} <span className="muted">({Math.round((x.size || 0) / 1024)} KB)</span>
              {!disabled && <button type="button" className="btn ghost sm" onClick={() => onChange(list.filter((_, j) => j !== i))}>นำออก</button>}
            </div>
          ))}
          <div className="muted small">ไฟล์แนบในระบบนี้เก็บเฉพาะชื่อและขนาดไฟล์ (ยังไม่อัปโหลดเนื้อไฟล์ขึ้นเซิร์ฟเวอร์)</div>
        </div>
      )
      break
    }
    case 'rows':
      input = <RowsInput f={f} value={value || []} onChange={onChange} disabled={disabled} />; break
    default:
      input = <input id={id} type="text" value={v} disabled={disabled} onChange={e => onChange(e.target.value)} />
  }
  return (
    <div className={'field' + (error ? ' has-error' : '') + (['textarea', 'rows', 'file', 'multiselect'].includes(f.type) || f.wide ? ' wide' : '')}>
      <label htmlFor={id}>{f.label}{f.required && <b className="req"> *</b>}</label>
      {f.help && <div className="muted small" style={{ marginTop: -3 }}>{f.help}</div>}
      {input}
      {error && <div className="err">{error}</div>}
    </div>
  )
}

function RowsInput({ f, value, onChange, disabled }) {
  const { s } = useApp()
  const set = (i, k, val) => onChange(value.map((r, j) => (j === i ? { ...r, [k]: val } : r)))
  return (
    <div className="rows-input">
      <div className="table-wrap">
        <table className="mini">
          <thead><tr>{f.cols.map(c => <th key={c.key}>{c.label}</th>)}<th /></tr></thead>
          <tbody>
            {value.map((r, i) => (
              <tr key={i}>
                {f.cols.map(c => (
                  <td key={c.key}>
                    {c.type === 'select' ? (
                      <select value={r[c.key] || ''} disabled={disabled} onChange={e => set(i, c.key, e.target.value)}>
                        <option value="">–</option>{(c.options || []).map(o => <option key={o}>{o}</option>)}
                      </select>
                    ) : c.type === 'ref' ? (
                      <select value={r[c.key] || ''} disabled={disabled} onChange={e => set(i, c.key, e.target.value)}>
                        <option value="">–</option>{refOptions(s, c.ref).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    ) : (
                      <input type={c.type === 'number' ? 'number' : 'text'} value={r[c.key] ?? ''} disabled={disabled} onChange={e => set(i, c.key, e.target.value)} />
                    )}
                  </td>
                ))}
                <td>{!disabled && <button type="button" className="btn ghost sm" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="ลบแถว">ลบ</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!disabled && <button type="button" className="btn sm" onClick={() => onChange([...value, {}])}>+ เพิ่มแถว</button>}
    </div>
  )
}

export function FormFields({ fields, values, setValues, errors = {}, disabled }) {
  return (
    <div className="form-grid">
      {fields.filter(f => !f.hidden && (!f.showIf || values[f.showIf.field] === f.showIf.value)).map(f => (
        <FieldInput key={f.key} f={f} values={values} value={values[f.key]} error={errors[f.key]} disabled={disabled}
          onChange={val => setValues(v => ({ ...v, [f.key]: val }))} />
      ))}
    </div>
  )
}

// ---------- data table ----------
export function DataTable({ columns, data, filters = [], pageSize = 25, onRow, searchPlaceholder = 'ค้นหา…', exportName, canExport, rowClass, emptyText, emptyAction, toolbar, initialFilters = {}, initialSort, tabs, initialTab }) {
  const [q, setQ] = useState('')
  const [fv, setFv] = useState(initialFilters)
  const [sort, setSort] = useState(initialSort || { key: null, dir: 1 })
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(pageSize)
  const [tab, setTab] = useState(initialTab || tabs?.[0]?.key || '')
  const [showF, setShowF] = useState(Object.keys(initialFilters).length > 0)
  const [showC, setShowC] = useState(false)
  const colKey = 'sjp-cols-' + (exportName || columns.map(c => c.key).join('-'))
  const [hiddenCols, setHiddenCols] = useState(() => { try { return JSON.parse(localStorage.getItem(colKey)) || [] } catch (e) { return [] } })
  const setHidden = h => { setHiddenCols(h); try { localStorage.setItem(colKey, JSON.stringify(h)) } catch (e) { /* ignore */ } }
  const { s } = useApp()
  const val = (c, r) => (c.value ? c.value(r) : r[c.key])
  const shown = columns.filter(c => !hiddenCols.includes(c.key))
  const tabTest = tabs?.find(x => x.key === tab)?.test
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase()
    let out = data
    if (tabTest) out = out.filter(tabTest)
    out = out.filter(r => filters.every(f => !fv[f.key] || String(f.get(r)) === fv[f.key]))
    if (ql) out = out.filter(r => columns.some(c => String(val(c, r) ?? '').toLowerCase().includes(ql)) || (r._search || '').toLowerCase().includes(ql))
    if (sort.key) {
      const c = columns.find(x => x.key === sort.key)
      if (c) out = [...out].sort((a, b) => {
        const x = val(c, a), y = val(c, b)
        if (x == null || x === '') return 1
        if (y == null || y === '') return -1
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * sort.dir
        return String(x).localeCompare(String(y), 'th', { numeric: true }) * sort.dir
      })
    }
    return out
  }, [data, q, fv, sort, columns, tab])
  const pages = Math.max(1, Math.ceil(filtered.length / size))
  const pg = Math.min(page, pages)
  const slice = filtered.slice((pg - 1) * size, pg * size)
  useEffect(() => setPage(1), [q, fv, size, tab])
  const activeF = Object.values(fv).filter(Boolean).length
  const doExport = () => {
    const csv = toCsv(shown.map(c => c.label), filtered.map(r => shown.map(c => { const x = val(c, r); return x == null ? '' : x })))
    downloadFile((exportName || 'export') + '-' + new Date().toISOString().slice(0, 10) + '.csv', csv)
    act(st => db.audit(st, 'export', 'reports', null, `ส่งออก ${exportName || 'ข้อมูล'} (${filtered.length} แถว)`))
  }
  const from = filtered.length ? (pg - 1) * size + 1 : 0
  return (
    <div className="dt">
      {tabs && (
        <div className="utabs" role="tablist">
          {tabs.map(x => <button key={x.key} role="tab" aria-selected={tab === x.key} className={tab === x.key ? 'active' : ''} onClick={() => setTab(x.key)}>{x.label}<span className="tab-count">{x.test ? data.filter(x.test).length : data.length}</span></button>)}
        </div>
      )}
      <div className="table-tools">
        <div className="searchbox">
          <Icon name="search" size={18} />
          <input type="search" placeholder={searchPlaceholder} value={q} onChange={e => setQ(e.target.value)} aria-label="ค้นหา" />
          {q && <button type="button" className="search-clear" onClick={() => setQ('')} aria-label="ล้างคำค้น">×</button>}
        </div>
        {filters.length > 0 && <button className={'btn tool' + (showF || activeF ? ' on' : '')} onClick={() => setShowF(!showF)} aria-expanded={showF}><Icon name="filter" size={18} /> ตัวกรอง{activeF > 0 && <span className="tab-count">{activeF}</span>}</button>}
        <span className="grow" />
        {toolbar}
        {canExport && <button className="btn tool" onClick={doExport} disabled={!filtered.length}><Icon name="download" size={18} /> ส่งออก CSV</button>}
        <div className="pop-wrap">
          <button className="btn tool" onClick={() => setShowC(!showC)} aria-expanded={showC}><Icon name="columns" size={18} /> คอลัมน์</button>
          {showC && (
            <div className="popover right" style={{ minWidth: 220 }}>
              <div className="pop-title">แสดงคอลัมน์</div>
              {columns.map(c => <label key={c.key} className="pop-row check"><input type="checkbox" checked={!hiddenCols.includes(c.key)} onChange={() => setHidden(hiddenCols.includes(c.key) ? hiddenCols.filter(x => x !== c.key) : [...hiddenCols, c.key])} /> {c.label}</label>)}
              {hiddenCols.length > 0 && <button className="pop-row" onClick={() => setHidden([])}>แสดงทั้งหมด</button>}
            </div>
          )}
        </div>
      </div>
      {showF && filters.length > 0 && (
        <div className="filter-row">
          {filters.map(f => (
            <select key={f.key} value={fv[f.key] || ''} onChange={e => setFv({ ...fv, [f.key]: e.target.value })} aria-label={f.label}>
              <option value="">{f.label}: ทั้งหมด</option>
              {f.options.map(o => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}
            </select>
          ))}
          {activeF > 0 && <button className="btn sm" onClick={() => setFv({})}>ล้างตัวกรอง</button>}
        </div>
      )}
      <div className="tablecard">
        {data.length === 0 ? <Empty text={emptyText || 'ยังไม่มีข้อมูล'}>{emptyAction && <button className="btn primary" style={{ marginTop: 6 }} onClick={emptyAction.onClick}>{emptyAction.label}</button>}</Empty> : filtered.length === 0 ? <Empty text="ไม่พบรายการที่ตรงกับการค้นหา/ตัวกรอง" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>{shown.map(c => (
                  <th key={c.key} onClick={() => setSort(sort.key === c.key ? { key: c.key, dir: -sort.dir } : { key: c.key, dir: 1 })} className="sortable" aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                    {c.label} {sort.key === c.key ? (sort.dir === 1 ? '▲' : '▼') : ''}
                  </th>))}
                </tr>
              </thead>
              <tbody>
                {slice.map((r, i) => (
                  <tr key={r.id || i} className={(onRow ? 'click ' : '') + (rowClass ? rowClass(r) : '')} onClick={onRow ? () => onRow(r) : undefined}>
                    {shown.map(c => <td key={c.key} data-label={c.label}>{c.render ? c.render(r) : String(val(c, r) ?? '–')}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="pager">
        <span className="muted">{filtered.length ? `${from}–${Math.min(filtered.length, pg * size)} จาก ${filtered.length}` : '0 รายการ'}{filtered.length !== data.length && !tabs ? ` (ทั้งหมด ${data.length})` : ''}</span>
        <select value={size} onChange={e => setSize(Number(e.target.value))} aria-label="จำนวนต่อหน้า">{[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / หน้า</option>)}</select>
        <span className="grow" />
        <button className="btn sm" disabled={pg <= 1} onClick={() => setPage(pg - 1)}>ก่อนหน้า</button>
        <span>หน้า {pg} / {pages}</span>
        <button className="btn sm" disabled={pg >= pages} onClick={() => setPage(pg + 1)}>ถัดไป</button>
      </div>
    </div>
  )
}

export function History({ entity, id }) {
  const { s } = useApp()
  const list = s.audit.filter(a => a.entity === entity && a.recId === id).slice().reverse()
  if (!list.length) return <Empty text="ยังไม่มีประวัติ" />
  return (
    <div className="timeline">
      {list.map(a => (
        <div key={a.id} className="tl-item">
          <div className="tl-dot" />
          <div>
            <div><b>{a.summary}</b></div>
            <div className="muted small">{a.userName} · {fmtDateTime(a.at)}</div>
            {a.changes?.length > 0 && (
              <ul className="changes">
                {a.changes.slice(0, 12).map((c, i) => c.from === '' && c.to === '' ? <li key={i}>{c.field}</li> : (
                  <li key={i}>{c.field}: <span className="old">{short(c.from)}</span> → <span className="new">{short(c.to)}</span></li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
const short = v => {
  if (v === undefined || v === null || v === '') return '(ว่าง)'
  const t = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return t.length > 60 ? t.slice(0, 60) + '…' : t
}

export function Kv({ label, children }) {
  return <div className="kv"><div className="k">{label}</div><div className="v">{children}</div></div>
}
