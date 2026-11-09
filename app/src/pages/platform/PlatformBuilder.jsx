import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Page, ErrorBox, toast, useSubmit } from '../../components/ui'
import { usePlatform } from '../../platform/session'
import { PARTS, COMPONENTS, expandFields } from '../../platform/parts'
import { tr } from '../../platform/util'
import { RecordForm } from './shared'
import { PlatBar } from './PlatformEntity'

const L = (th, en) => ({ th, en })
const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean)
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '').replace(/^\d+/, '')

// one-line explanation shown on every part so nobody has to guess what it is for
const HINTS = {
  text: 'ชื่อ รหัส เบอร์โทร', textarea: 'รายละเอียดยาวๆ', number: 'จำนวน อายุ', money: 'ราคา ยอดเงิน', date: 'วันนัด วันที่ซื้อ',
  select: 'เลือกจากรายการที่กำหนด', boolean: 'ติ๊กใช่/ไม่ใช่', ref: 'เลือกจากเอกสารอื่น เช่น สินค้า', file: 'แนบรูปหรือเอกสาร', formula: 'คำนวณเอง เช่น ราคา×จำนวน', rows: 'ตารางหลายบรรทัด เช่น รายการสินค้า'
}

// ready-made starting points (module name + first document + optional statuses)
const TEMPLATES = [
  {
    id: 'register', name: 'ทะเบียนทั่วไป', desc: 'เก็บรายการอะไรก็ได้ พร้อมประเภทและวันที่', doc: { th: 'รายการ', en: 'Item', prefix: 'REG' },
    fields: [{ key: 'name', type: 'text', label: L('ชื่อรายการ', 'Name'), required: true }, { key: 'kind', type: 'select', label: L('ประเภท', 'Type'), options: ['ประเภท 1', 'ประเภท 2'] }, { key: 'date', type: 'date', label: L('วันที่', 'Date') }, { key: 'note', type: 'textarea', label: L('หมายเหตุ', 'Note') }]
  },
  {
    id: 'asset', name: 'ทะเบียนทรัพย์สิน/เครื่องมือ', desc: 'เลขทะเบียน มูลค่า วันที่ซื้อ รูปถ่าย', doc: { th: 'ทรัพย์สิน', en: 'Asset', prefix: 'AST' },
    fields: [{ key: 'name', type: 'text', label: L('ชื่อทรัพย์สิน', 'Asset name'), required: true }, { key: 'assetNo', type: 'text', label: L('เลขทะเบียน', 'Asset no.'), unique: true }, { key: 'cost', type: 'money', label: L('มูลค่า', 'Cost') }, { key: 'bought', type: 'date', label: L('วันที่ซื้อ', 'Bought on') }, { key: 'photos', type: 'file', label: L('รูปภาพ', 'Photos') }]
  },
  {
    id: 'request', name: 'ใบขออนุมัติ (มีผู้อนุมัติ)', desc: 'รายการหลายบรรทัด ยอดรวมอัตโนมัติ ร่าง → รออนุมัติ → อนุมัติแล้ว', doc: { th: 'ใบขออนุมัติ', en: 'Request', prefix: 'REQ' },
    fields: [{ key: 'title', type: 'text', label: L('เรื่องที่ขอ', 'Subject'), required: true }, { key: 'needDate', type: 'date', label: L('วันที่ต้องการ', 'Needed by') }, { key: 'items', type: 'rows', label: L('รายการ', 'Items'), columns: [{ key: 'name', type: 'text', label: L('รายการ', 'Item') }, { key: 'qty', type: 'number', label: L('จำนวน', 'Qty') }, { key: 'price', type: 'money', label: L('ราคา', 'Price') }] }, { key: 'total', type: 'formula', label: L('ยอดรวม', 'Total'), formula: 'SUM({items.qty*price})' }],
    statuses: ['ร่าง', 'รออนุมัติ', 'อนุมัติแล้ว'], approval: true, lock: true
  },
  {
    id: 'job', name: 'ติดตามงาน/งานซ่อม', desc: 'รับเรื่อง → กำลังทำ → เสร็จสิ้น พร้อมผู้รับผิดชอบ', doc: { th: 'งาน', en: 'Job', prefix: 'JOB' },
    fields: [{ key: 'title', type: 'text', label: L('เรื่อง', 'Subject'), required: true }, { key: 'owner', type: 'text', label: L('ผู้รับผิดชอบ', 'Owner') }, { key: 'due', type: 'date', label: L('กำหนดเสร็จ', 'Due date') }, { key: 'detail', type: 'textarea', label: L('รายละเอียด', 'Details') }],
    statuses: ['รับเรื่อง', 'กำลังดำเนินการ', 'เสร็จสิ้น'], approval: false, lock: false
  }
]

// "ร่าง / รออนุมัติ / อนุมัติแล้ว" → workflow definition (keys stay stable when a status keeps its name)
function buildWorkflow(names, approval, lock, prev) {
  if (names.length < 2) return undefined
  const old = prev?.states || []
  let n = old.length
  const keys = names.map(name => old.find(s => tr(s.label) === name)?.key || `s${++n}`)
  const last = names.length - 1
  const states = names.map((name, i) => ({ key: keys[i], label: L(name, name), ...(i === last ? { final: true, locked: !!lock } : {}) }))
  const transitions = []
  for (let i = 1; i <= last; i++) {
    const t = { key: `to_${keys[i]}`, label: L(i === last && approval ? `อนุมัติ → ${names[i]}` : `ส่งต่อ → ${names[i]}`, `Go to ${names[i]}`), from: [keys[i - 1]], to: keys[i] }
    if (i === last && approval) t.approvers = { roles: ['approver'] }
    transitions.push(t)
    if (i < last + 0 && i >= 1) transitions.push({ key: `back_${keys[i - 1]}`, label: L(`ย้อนกลับ → ${names[i - 1]}`, `Back to ${names[i - 1]}`), from: [keys[i]], to: keys[i - 1], requireComment: true })
  }
  return { initial: keys[0], states, transitions }
}

export default function PlatformBuilder() {
  const { s, company, lang, get, send, isAdmin } = usePlatform()
  const th = lang !== 'en'
  const [qs] = useSearchParams()
  const [modName, setModName] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [draft, setDraft] = useState(null)
  const [isNewEntity, setIsNewEntity] = useState(false)
  const [sel, setSel] = useState(-1)
  const [preview, setPreview] = useState({})
  const [msg, setMsg] = useState(null)
  const [statusText, setStatusText] = useState('')
  const [approval, setApproval] = useState(false)
  const [lock, setLock] = useState(true)
  const [busy, run] = useSubmit()
  const started = useRef(false)

  const mods = get('/api/modules')
  const own = mods.ok ? mods.data.filter(m => m.builder && m.status === 'active') : []
  const mod = modName && s.platform.installed[company]?.[modName]
  const targets = useMemo(() => (mods.ok ? mods.data.filter(m => m.status === 'active').flatMap(m => m.entities.map(e => ({ id: `${m.name}.${e.key}`, label: `${tr(m.title, lang)} › ${tr(e.label, lang)}` }))) : []), [mods.ok && mods.data, lang])

  const openEditor = (e, isNew, extra = {}) => {
    setDraft(JSON.parse(JSON.stringify(e))); setIsNewEntity(isNew); setSel(-1); setMsg(null); setPreview({})
    const wf = e.workflow
    setStatusText(extra.statuses ? extra.statuses.join('\n') : wf ? wf.states.map(x => tr(x.label)).join('\n') : '')
    setApproval(extra.approval ?? !!wf?.transitions?.some(t => t.approvers))
    setLock(extra.lock ?? (wf ? !!wf.states[wf.states.length - 1]?.locked : true))
  }
  const blank = () => ({ key: '', label: { th: '', en: '' }, prefix: '', fields: [] })

  const createModule = async (title, tpl) => {
    const res = send('POST', '/api/builder/modules', { title })
    if (!res.ok) { toast(res.error, 'err'); return res }
    setModName(res.data.name); setNewTitle('')
    if (tpl) openEditor({ ...blank(), label: { th: tpl.doc.th, en: tpl.doc.en }, prefix: tpl.doc.prefix, fields: JSON.parse(JSON.stringify(tpl.fields)) }, true, tpl)
    else openEditor(blank(), true)
    toast(th ? 'สร้างโมดูลแล้ว ขั้นต่อไป: ออกแบบเอกสารแรก' : 'Module created. Next: design the first document')
    return res
  }
  // /platform/builder?template=asset starts straight from a template (used by the shortcuts on the home page)
  useEffect(() => {
    const t = TEMPLATES.find(x => x.id === qs.get('template'))
    if (t && isAdmin && company && !started.current) { started.current = true; createModule(t.name, t) }
  }, [qs, isAdmin, company])

  if (!isAdmin) return <Page title="Module Builder" actions={<PlatBar />}><ErrorBox error={th ? 'เฉพาะผู้ดูแลระบบเท่านั้นที่สร้างโมดูลได้' : 'Administrators only'} /></Page>
  if (!company) return <Page title="Module Builder"><ErrorBox error="no company" /></Page>

  const setField = (i, patch) => setDraft(d => ({ ...d, fields: d.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) }))
  const nextKey = (fields, base) => { let n = fields.length + 1; while (fields.some(f => f.key === `${base}${n}`)) n++; return `${base}${n}` }
  const addPart = (type, at) => setDraft(d => {
    const fields = [...d.fields]
    const f = type.startsWith('component:')
      ? { component: type.slice(10), key: nextKey(fields, type.slice(10)), label: COMPONENTS[type.slice(10)].label }
      : { key: nextKey(fields, 'field'), type, label: { th: `${PARTS[type].label.th} ${fields.length + 1}`, en: `${PARTS[type].label.en} ${fields.length + 1}` }, ...(type === 'select' ? { options: ['ตัวเลือก 1', 'ตัวเลือก 2'] } : {}), ...(type === 'rows' ? { columns: [{ key: 'name', type: 'text', label: L('รายการ', 'Item') }, { key: 'qty', type: 'number', label: L('จำนวน', 'Qty') }] } : {}) }
    fields.splice(at === undefined ? fields.length : at, 0, f)
    setSel(at === undefined ? fields.length - 1 : at)
    return { ...d, fields }
  })
  const move = (from, to) => setDraft(d => {
    const fields = [...d.fields]
    const [x] = fields.splice(from, 1)
    fields.splice(to > from ? to - 1 : to, 0, x)
    return { ...d, fields }
  })
  const duplicate = i => setDraft(d => { const fields = [...d.fields]; fields.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(fields[i])), key: nextKey(fields, 'field') }); return { ...d, fields } })
  const onDrop = (e, at) => {
    e.preventDefault(); e.stopPropagation()
    const t = e.dataTransfer.getData('text/plain')
    if (t.startsWith('new:')) addPart(t.slice(4), at)
    else if (t.startsWith('move:')) move(Number(t.slice(5)), at === undefined ? draft.fields.length : at)
  }

  const names = lines(statusText)
  const wfNow = draft ? buildWorkflow(names, approval, lock, draft.workflow) : undefined
  const save = () => run(async () => {
    const existing = mod?.manifest.entities.map(e => e.key) || []
    let key = draft.key
    if (!key) { const base = slug(draft.label.en) || 'doc'; key = base; let n = 1; while (existing.includes(key)) key = base + ++n }
    const label = { th: draft.label.th || draft.label.en, en: draft.label.en || draft.label.th }
    const def = { ...draft, key, label, workflow: wfNow }
    if (!wfNow) delete def.workflow
    const res = send('PUT', `/api/builder/modules/${modName}/entities`, def)
    if (res.ok) { setMsg({ ok: true, ...res.data, key }); setIsNewEntity(false); setDraft(d => ({ ...d, key, label, workflow: wfNow })) } else setMsg({ ok: false, text: res.error })
    return res
  })

  const screen = draft ? { module: modName, fields: expandFields(draft.fields).concat(wfNow ? [] : []) } : null
  const f = draft && sel >= 0 ? draft.fields[sel] : null
  const stage = !modName ? 1 : !draft ? 1 : msg?.ok ? 4 : 2
  const steps = [[1, th ? 'เลือกโมดูล' : 'Module'], [2, th ? 'ออกแบบฟอร์ม' : 'Design form'], [3, th ? 'ตั้งสถานะ (ไม่บังคับ)' : 'Statuses'], [4, th ? 'เผยแพร่' : 'Publish']]

  return (
    <Page title="Module Builder" icon="puzzle" subtitle={th ? 'สร้างโมดูลและเอกสารของคุณเองโดยไม่ต้องเขียนโค้ด — บันทึกแล้วมีฟอร์ม หน้ารายการ ประวัติแก้ไข และ API ใช้งานได้ทันที' : 'Build your own modules with no code'} actions={<PlatBar />}>
      <ol className="b-steps" aria-label="steps">
        {steps.map(([n, t]) => <li key={n} className={'b-step' + (stage === n || (n === 3 && stage === 2 && draft) ? ' on' : '') + (stage > n ? ' done' : '')}><b>{stage > n ? '✓' : n}</b><span>{t}</span></li>)}
      </ol>

      {!draft && (
        <>
          <div className="card">
            <h3>{th ? 'เริ่มจากแบบสำเร็จรูป (คลิกเดียวได้โมดูลพร้อมฟอร์ม)' : 'Start from a template'}</h3>
            <div className="b-gallery">
              {TEMPLATES.map(t => (
                <button key={t.id} className="b-tpl" disabled={busy} onClick={() => run(() => createModule(t.name, t))} data-testid={'tpl-' + t.id}>
                  <b>{t.name}</b><span className="muted small">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            <h3>{th ? 'หรือเริ่มจากหน้าว่าง' : 'Or start blank'}</h3>
            <div className="row">
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && newTitle.trim() && run(() => createModule(newTitle))} placeholder={th ? 'ตั้งชื่อโมดูล เช่น ทะเบียนเครื่องมือ' : 'Module title'} aria-label="new module title" style={{ minWidth: 280 }} />
              <button className="btn primary" disabled={busy || !newTitle.trim()} onClick={() => run(() => createModule(newTitle))}>{th ? 'สร้างโมดูล' : 'Create module'}</button>
            </div>
          </div>
          {own.length > 0 && (
            <div className="card">
              <h3>{th ? 'โมดูลที่คุณสร้างไว้' : 'Your modules'}</h3>
              <label htmlFor="bm" className="muted small">{th ? 'เลือกโมดูลเพื่อแก้ไขหรือเพิ่มเอกสาร' : 'Choose a module'}</label>
              <div className="row"><select id="bm" value={modName} onChange={e => setModName(e.target.value)}>
                <option value="">{th ? '– เลือกโมดูล –' : '– choose –'}</option>
                {own.map(m => <option key={m.name} value={m.name}>{tr(m.title, lang)} (v{m.installedVersion})</option>)}
              </select></div>
              {mod && (
                <>
                  <ul className="plain" style={{ marginTop: 10 }}>{mod.manifest.entities.map(e => (
                    <li key={e.key} className="row"><b>{tr(e.label, lang)}</b> <span className="muted small">{e.fields.length} {th ? 'ฟิลด์' : 'fields'}{e.workflow ? ` · ${e.workflow.states.length} ${th ? 'สถานะ' : 'statuses'}` : ''}</span>
                      <button className="btn sm" onClick={() => openEditor(e, false)}>{th ? 'แก้ไขฟอร์ม' : 'Edit'}</button>
                      <Link className="btn sm" to={`/p/${modName}/${e.key}/new`}>{th ? 'เพิ่มข้อมูล' : 'Add data'}</Link>
                      <Link className="btn sm" to={`/p/${modName}/${e.key}`}>{th ? 'เปิดหน้ารายการ' : 'Open list'}</Link></li>
                  ))}
                    {!mod.manifest.entities.length && <li className="muted">{th ? 'ยังไม่มีเอกสาร' : 'No documents yet'}</li>}
                  </ul>
                  <button className="btn primary" onClick={() => openEditor(blank(), true)}>+ {th ? 'เอกสารใหม่ในโมดูลนี้' : 'New document'}</button>
                </>
              )}
            </div>
          )}
        </>
      )}

      {mod && draft && (
        <>
          <div className="card">
            <div className="row">
              <div className="field"><label htmlFor="en-th">{th ? 'ชื่อเอกสาร (ไทย)' : 'Name (Thai)'}</label><input id="en-th" value={draft.label.th} onChange={e => setDraft({ ...draft, label: { ...draft.label, th: e.target.value } })} placeholder={th ? 'เช่น ใบขอซื้อ' : ''} /></div>
              <div className="field"><label htmlFor="en-en">{th ? 'ชื่อเอกสาร (อังกฤษ — เว้นว่างได้)' : 'Name (English)'}</label><input id="en-en" value={draft.label.en} onChange={e => setDraft({ ...draft, label: { ...draft.label, en: e.target.value } })} /></div>
              <div className="field"><label htmlFor="en-px">{th ? 'อักษรนำหน้าเลขที่' : 'Number prefix'}</label><input id="en-px" value={draft.prefix} maxLength={8} onChange={e => setDraft({ ...draft, prefix: e.target.value.toUpperCase() })} placeholder="DOC" /></div>
              <span className="grow" />
              <button className="btn" onClick={() => { setDraft(null); setMsg(null) }}>{th ? 'ปิดตัวแก้ไข' : 'Close'}</button>
              <button className="btn primary" disabled={busy || !(draft.label.th || draft.label.en) || !draft.fields.length} onClick={save}>{th ? 'บันทึกและใช้งานทันที' : 'Save & publish'}</button>
            </div>
            {!draft.fields.length && <div className="hint" style={{ marginTop: 8 }}>{th ? 'เพิ่มอย่างน้อย 1 ฟิลด์ก่อนจึงจะบันทึกได้' : 'Add at least one field'}</div>}
            {msg && !msg.ok && <pre className="notice bad" style={{ whiteSpace: 'pre-wrap', marginTop: 10 }} role="alert">{msg.text}</pre>}
          </div>

          {msg?.ok && (
            <div className="card b-done" role="status">
              <h3>{th ? `เผยแพร่แล้ว เป็นโมดูลเวอร์ชัน ${msg.version}` : `Published as v${msg.version}`}</h3>
              <div className="muted">{th ? 'เอกสารนี้ใช้งานได้แล้ว: มีฟอร์ม หน้ารายการ ประวัติการแก้ไข และเมนู ข้อมูลเดิมยังอยู่ครบ ขั้นต่อไป: เพิ่มข้อมูลชิ้นแรก' : 'The document is ready: form, list, history and menu. Next: add the first record.'}</div>
              <div className="row" style={{ marginTop: 10 }}>
                <Link className="btn primary" to={`/p/${modName}/${msg.key}/new`}>{th ? 'เพิ่มข้อมูลชิ้นแรก' : 'Add the first record'}</Link>
                <Link className="btn" to={`/p/${modName}/${msg.key}`}>{th ? 'เปิดหน้ารายการ' : 'Open the list'}</Link>
                <Link className="btn" to="/platform">{th ? 'กำหนดว่าใครใช้ได้ (สมาชิก & สิทธิ์)' : 'Choose who can use it'}</Link>
              </div>
            </div>
          )}

          <div className="b-grid">
            <div className="card" aria-label="palette">
              <h3>{th ? '① ชิ้นส่วน (ลากไปวาง หรือกดเพื่อเพิ่ม)' : 'Parts (drag or click)'}</h3>
              <div className="stack">
                {Object.values(PARTS).map(p => (
                  <button key={p.key} className="btn b-part" draggable data-testid={'part-' + p.key} onDragStart={e => e.dataTransfer.setData('text/plain', 'new:' + p.key)} onClick={() => addPart(p.key)}>
                    <span>{p.icon} {tr(p.label, lang)}</span><small className="muted">{HINTS[p.key]}</small>
                  </button>
                ))}
                <div className="muted small">{th ? 'บล็อกสำเร็จรูป' : 'Components'}</div>
                {Object.values(COMPONENTS).filter(c => c.layout === 'block').map(c => (
                  <button key={c.key} className="btn b-part" draggable data-testid={'comp-' + c.key} onDragStart={e => e.dataTransfer.setData('text/plain', 'new:component:' + c.key)} onClick={() => addPart('component:' + c.key)}><span>▣ {tr(c.label, lang)}</span><small className="muted">{c.key === 'address' ? 'ที่อยู่ครบชุด' : 'ผู้อนุมัติ วันที่ หมายเหตุ'}</small></button>
                ))}
              </div>
            </div>

            <div className="card" onDragOver={e => e.preventDefault()} onDrop={e => onDrop(e)} data-testid="canvas" aria-label="canvas">
              <h3>{th ? '② ฟอร์มของคุณ (กดเลือกเพื่อแก้ไข ลากเพื่อสลับลำดับ)' : 'Your form'}</h3>
              {!draft.fields.length && <div className="state empty">{th ? 'ลากชิ้นส่วนมาวางที่นี่ หรือกดชิ้นส่วนทางซ้าย' : 'Drop parts here'}</div>}
              {draft.fields.map((fd, i) => (
                <div key={i} className={'bf' + (sel === i ? ' sel' : '')} draggable onDragStart={e => e.dataTransfer.setData('text/plain', 'move:' + i)} onDragOver={e => e.preventDefault()} onDrop={e => onDrop(e, i)} onClick={() => setSel(i)}>
                  <div className="row"><b>{tr(fd.label, lang) || fd.key}</b><span className="muted small">{fd.component ? `▣ ${fd.component}` : PARTS[fd.type]?.label[lang]}{fd.required ? ' *' : ''}</span><span className="grow" />
                    <button className="btn sm" disabled={i === 0} onClick={e => { e.stopPropagation(); move(i, i - 1) }} aria-label="up">↑</button>
                    <button className="btn sm" disabled={i === draft.fields.length - 1} onClick={e => { e.stopPropagation(); move(i, i + 2) }} aria-label="down">↓</button>
                    <button className="btn sm" onClick={e => { e.stopPropagation(); duplicate(i) }} aria-label="duplicate" title={th ? 'ทำซ้ำ' : 'Duplicate'}>⧉</button>
                    <button className="btn sm danger" onClick={e => { e.stopPropagation(); setDraft(d => ({ ...d, fields: d.fields.filter((_, j) => j !== i) })); setSel(-1) }} aria-label="remove">×</button></div>
                </div>
              ))}
            </div>

            <div className="card" aria-label="properties">
              <h3>{th ? 'คุณสมบัติของฟิลด์ที่เลือก' : 'Field properties'}</h3>
              {!f ? <div className="muted">{th ? 'กดเลือกฟิลด์ในฟอร์มเพื่อเปลี่ยนชื่อ หรือกำหนดว่าต้องกรอก' : 'Select a field'}</div> : (
                <div className="stack">
                  <div className="field"><label htmlFor="p-th">{th ? 'ชื่อที่แสดง (ไทย)' : 'Label (Thai)'}</label><input id="p-th" value={f.label?.th ?? ''} onChange={e => setField(sel, { label: { ...(f.label || {}), th: e.target.value } })} /></div>
                  <div className="field"><label htmlFor="p-en">{th ? 'ชื่อที่แสดง (อังกฤษ)' : 'Label (English)'}</label><input id="p-en" value={f.label?.en ?? ''} onChange={e => setField(sel, { label: { ...(f.label || {}), en: e.target.value } })} /></div>
                  {!f.component && <label className="check"><input type="checkbox" checked={!!f.required} onChange={e => setField(sel, { required: e.target.checked })} /> {th ? 'จำเป็นต้องกรอก' : 'Required'}</label>}
                  {f.type === 'select' && <div className="field"><label htmlFor="p-opt">{th ? 'ตัวเลือก (บรรทัดละหนึ่งค่า)' : 'Options (one per line)'}</label><textarea id="p-opt" rows={4} value={(f.options || []).map(o => (typeof o === 'object' ? o.value : o)).join('\n')} onChange={e => setField(sel, { options: lines(e.target.value) })} /></div>}
                  {f.type === 'ref' && <div className="field"><label htmlFor="p-ref">{th ? 'ลิงก์ไปเอกสาร' : 'Links to'}</label><select id="p-ref" value={f.ref || ''} onChange={e => setField(sel, { ref: e.target.value })}><option value="">–</option>{targets.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>}
                  {f.type === 'formula' && <div className="field"><label htmlFor="p-fx">{th ? 'สูตร เช่น {price}*{qty} หรือ SUM({items.qty*price})' : 'Formula'}</label><input id="p-fx" value={f.formula || ''} onChange={e => setField(sel, { formula: e.target.value })} /></div>}
                  {f.type === 'rows' && <div className="field"><label htmlFor="p-cols">{th ? 'คอลัมน์ (รหัส|ชื่อ|ชนิด ต่อบรรทัด)' : 'Columns (key|label|type)'}</label><textarea id="p-cols" rows={4} value={(f.columns || []).map(c => `${c.key}|${tr(c.label, 'th')}|${c.type}`).join('\n')} onChange={e => setField(sel, { columns: lines(e.target.value).map(l => { const [key, label, type] = l.split('|'); return { key: (key || 'col').trim(), label: { th: (label || key || '').trim(), en: (label || key || '').trim() }, type: PARTS[(type || 'text').trim()] ? (type || 'text').trim() : 'text' } }) })} /></div>}
                  {(f.type === 'number' || f.type === 'money') && <label className="check"><input type="checkbox" checked={f.min === 0} onChange={e => setField(sel, { min: e.target.checked ? 0 : undefined })} /> {th ? 'ห้ามติดลบ' : 'Not negative'}</label>}
                  {f.type === 'text' && <label className="check"><input type="checkbox" checked={!!f.unique} onChange={e => setField(sel, { unique: e.target.checked })} /> {th ? 'ห้ามซ้ำกัน' : 'Unique'}</label>}
                  <details><summary className="muted small">{th ? 'ตั้งค่าขั้นสูง' : 'Advanced'}</summary>
                    <div className="field"><label htmlFor="p-key">{th ? 'รหัสภายในของฟิลด์ (ไม่ต้องแก้ก็ได้)' : 'Internal key'}</label><input id="p-key" value={f.key} onChange={e => setField(sel, { key: e.target.value.replace(/[^A-Za-z0-9_]/g, '') })} /></div>
                  </details>
                </div>
              )}
            </div>
          </div>

          <div className="card" data-testid="status-card">
            <h3>{th ? '③ สถานะและขั้นตอนอนุมัติ (ไม่บังคับ)' : 'Statuses & approval (optional)'}</h3>
            <div className="muted small">{th ? 'พิมพ์ชื่อสถานะเรียงตามลำดับ บรรทัดละหนึ่งสถานะ — ระบบสร้างปุ่มเลื่อนสถานะ ย้อนกลับ และบันทึกประวัติให้เอง ไม่ต้องการสถานะก็เว้นว่างไว้' : 'One status per line.'}</div>
            <div className="field" style={{ marginTop: 8 }}><label htmlFor="st-text">{th ? 'สถานะ (บรรทัดละหนึ่งค่า)' : 'Statuses'}</label><textarea id="st-text" rows={4} value={statusText} onChange={e => setStatusText(e.target.value)} placeholder={'ร่าง\nรออนุมัติ\nอนุมัติแล้ว'} /></div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn sm" onClick={() => setStatusText('ร่าง\nรออนุมัติ\nอนุมัติแล้ว')}>{th ? 'ใส่ตัวอย่าง: ร่าง → รออนุมัติ → อนุมัติแล้ว' : 'Example'}</button>
              <label className="check"><input type="checkbox" checked={approval} onChange={e => setApproval(e.target.checked)} disabled={names.length < 2} /> {th ? 'ขั้นตอนสุดท้ายต้องให้ “ผู้อนุมัติ” กดเท่านั้น' : 'Last step needs an approver'}</label>
              <label className="check"><input type="checkbox" checked={lock} onChange={e => setLock(e.target.checked)} disabled={names.length < 2} /> {th ? 'ล็อกเอกสารเมื่อถึงสถานะสุดท้าย (แก้ไขไม่ได้)' : 'Lock at the last status'}</label>
            </div>
            {names.length >= 2 && <div className="b-flow" aria-label="flow">{names.map((n, i) => <span key={i}><em>{n}</em>{i < names.length - 1 && <i>→</i>}</span>)}</div>}
            {names.length === 1 && <div className="hint">{th ? 'ต้องมีอย่างน้อย 2 สถานะ' : 'Needs at least 2'}</div>}
          </div>

          <div className="card">
            <h3>{th ? 'ตัวอย่างฟอร์มที่ผู้ใช้จะเห็น' : 'Live preview'}</h3>
            {screen.fields.length ? <RecordForm screen={screen} values={preview} setValues={setPreview} lang={lang} /> : <div className="muted">–</div>}
          </div>
        </>
      )}
    </Page>
  )
}
