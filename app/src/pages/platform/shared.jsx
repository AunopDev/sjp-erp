import React, { useMemo } from 'react'
import { apiGet } from '../../platform/session'
import { optionsOf } from '../../platform/parts'
import { tr } from '../../platform/util'
import { evalFormula } from '../../lib/modules'

export const refEntity = (ref, module) => (ref.includes('.') ? ref : `${module}.${ref}`)
export const money = n => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const toLoc = (v, f) => (v === undefined || v === null || v === '' ? '' : f.type === 'money' ? money(v) : Number(v).toLocaleString('th-TH'))

// read-only text of one value
export function showVal(f, rec, lang) {
  const v = rec[f.key]
  if (v === undefined || v === null || v === '') return '–'
  switch (f.type) {
    case 'money': case 'number': case 'formula': return toLoc(v, f)
    case 'boolean': return v ? (lang === 'en' ? 'Yes' : 'ใช่') : (lang === 'en' ? 'No' : 'ไม่ใช่')
    case 'select': return tr(optionsOf(f).find(o => o.value === v)?.label ?? v, lang)
    case 'ref': return rec._labels?.[f.key] || '(ไม่พบ)'
    case 'file': return (Array.isArray(v) ? v : [v]).map(x => x.name || x).join(', ')
    case 'rows': return `${v.length} ${lang === 'en' ? 'rows' : 'แถว'}`
    default: return String(v)
  }
}

function RefSelect({ id, module, f, value, onChange, disabled, lang }) {
  const target = f.ref ? refEntity(f.ref, module) : ''
  const opts = useMemo(() => { if (!target) return []; const r = apiGet(`/api/meta/options/${target.replace('.', '/')}`); return r.ok ? r.data : [] }, [target])
  const known = opts.some(o => o.value === value)
  return (
    <select id={id} value={value ?? ''} disabled={disabled} onChange={e => onChange(e.target.value)}>
      <option value="">{lang === 'en' ? '– choose –' : '– เลือก –'}</option>
      {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      {value && !known && <option value={value}>(ไม่พบ/ไม่มีสิทธิ์ดู)</option>}
    </select>
  )
}

function Cell({ c, module, value, onChange, lang }) {
  if (c.type === 'ref') return <RefSelect module={module} f={c} value={value} onChange={onChange} lang={lang} />
  if (c.type === 'number' || c.type === 'money') return <input type="number" inputMode="decimal" step="any" value={value ?? ''} onChange={e => onChange(e.target.value)} aria-label={tr(c.label, lang)} />
  if (c.type === 'date') return <input type="date" value={value ?? ''} onChange={e => onChange(e.target.value)} aria-label={tr(c.label, lang)} />
  if (c.type === 'select') return <select value={value ?? ''} onChange={e => onChange(e.target.value)} aria-label={tr(c.label, lang)}><option value="">–</option>{optionsOf(c).map(o => <option key={o.value} value={o.value}>{tr(o.label, lang)}</option>)}</select>
  return <input value={value ?? ''} onChange={e => onChange(e.target.value)} aria-label={tr(c.label, lang)} />
}

function RowsEditor({ f, module, value, onChange, disabled, lang }) {
  const rows = Array.isArray(value) ? value : []
  const set = (i, k, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  return (
    <div className="table-wrap">
      <table className="tbl" data-testid={'rows-' + f.key}>
        <thead><tr>{f.columns.map(c => <th key={c.key}>{tr(c.label, lang)}{c.required ? ' *' : ''}</th>)}{!disabled && <th />}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {f.columns.map(c => (
                <td key={c.key} data-label={tr(c.label, lang)}>
                  {c.type === 'formula' ? <span className="formula-box">{toLoc(Math.round((evalFormula(c.formula, r) || 0) * 100) / 100, c) || '0'}</span>
                    : disabled ? <span>{c.type === 'ref' ? (r[c.key] ? '…' : '–') : String(r[c.key] ?? '–')}</span>
                      : <Cell c={c} module={module} value={r[c.key]} onChange={v => set(i, c.key, v)} lang={lang} />}
                </td>
              ))}
              {!disabled && <td><button type="button" className="btn sm" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={lang === 'en' ? 'Remove row' : 'ลบแถว'}>×</button></td>}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={f.columns.length + 1} className="muted">{lang === 'en' ? 'No rows yet' : 'ยังไม่มีรายการ'}</td></tr>}
        </tbody>
      </table>
      {!disabled && <button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={() => onChange([...rows, {}])}>+ {lang === 'en' ? 'Add row' : 'เพิ่มแถว'}</button>}
    </div>
  )
}

export function PField({ f, module, value, onChange, error, disabled, values, lang }) {
  const id = 'pf-' + f.key
  const label = tr(f.label, lang)
  const ro = disabled || f.readOnly
  let input
  switch (f.type) {
    case 'textarea': input = <textarea id={id} rows={3} value={value ?? ''} disabled={ro} onChange={e => onChange(e.target.value)} />; break
    case 'number': case 'money': input = <input id={id} type="number" inputMode="decimal" step="any" value={value ?? ''} disabled={ro} onChange={e => onChange(e.target.value)} />; break
    case 'date': input = <input id={id} type="date" value={value ?? ''} disabled={ro} onChange={e => onChange(e.target.value)} />; break
    case 'boolean': input = <label className="check"><input id={id} type="checkbox" checked={!!value} disabled={ro} onChange={e => onChange(e.target.checked)} /> {lang === 'en' ? 'Yes' : 'ใช่'}</label>; break
    case 'select': input = <select id={id} value={value ?? ''} disabled={ro} onChange={e => onChange(e.target.value)}><option value="">{lang === 'en' ? '– choose –' : '– เลือก –'}</option>{optionsOf(f).map(o => <option key={o.value} value={o.value}>{tr(o.label, lang)}</option>)}</select>; break
    case 'ref': input = <RefSelect id={id} module={module} f={f} value={value} onChange={onChange} disabled={ro} lang={lang} />; break
    case 'file': input = (
      <div>
        <input id={id} type="file" multiple disabled={ro} onChange={e => onChange([...(value || []), ...[...e.target.files].map(x => ({ name: x.name, size: x.size, type: x.type }))])} />
        {(value || []).map((x, i) => <div key={i} className="small">{x.name} <button type="button" className="btn ghost sm" disabled={ro} onClick={() => onChange(value.filter((_, j) => j !== i))}>×</button></div>)}
      </div>
    ); break
    case 'formula': {
      const x = evalFormula(f.formula, values || {})
      input = <div className="formula-box">{isNaN(x) ? '–' : money(x)} <span className="muted small">{lang === 'en' ? '(calculated)' : '(คำนวณอัตโนมัติ)'}</span></div>
      break
    }
    case 'rows': input = <RowsEditor f={f} module={module} value={value} onChange={onChange} disabled={ro} lang={lang} />; break
    default: input = <input id={id} value={value ?? ''} disabled={ro} onChange={e => onChange(e.target.value)} />
  }
  return (
    <div className={'field' + (f.type === 'rows' || f.type === 'textarea' ? ' wide' : '')}>
      <label htmlFor={id}>{label}{f.required ? ' *' : ''}</label>
      {input}
      {error && <div className="err" role="alert">{error}</div>}
    </div>
  )
}

// Generated form: sections come from component groups; conditional fields follow showIf.
export function RecordForm({ screen, values, setValues, errors = {}, disabled, lang }) {
  const groups = []
  for (const f of screen.fields) {
    if (f.system) continue
    if (f.showIf && values[f.showIf.field] !== f.showIf.value) continue
    const g = f.group?.key || ''
    let cur = groups.find(x => x.key === g)
    if (!cur) groups.push(cur = { key: g, label: f.group?.label, fields: [] })
    cur.fields.push(f)
  }
  return (
    <div className="stack">
      {groups.map(g => (
        <div key={g.key || 'main'}>
          {g.label && <div className="section-title">{tr(g.label, lang)}</div>}
          <div className="grid2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
            {g.fields.map(f => <PField key={f.key} f={f} module={screen.module} value={values[f.key]} onChange={v => setValues({ ...values, [f.key]: v })} error={errors[f.key]} disabled={disabled} values={values} lang={lang} />)}
          </div>
        </div>
      ))}
    </div>
  )
}
