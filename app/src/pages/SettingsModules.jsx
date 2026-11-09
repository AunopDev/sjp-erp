import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApp, Modal, Badge, Empty, Tabs, toast, askConfirm } from '../components/ui'
import { ENT, ACTIONS, resourcesOf, PRESET_NAV } from '../lib/schema'
import { TEMPLATES, buildModule } from '../lib/modules'
import { uid } from '../lib/util'

export const clone = x => structuredClone(x)
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
export function move(arr, i, d) {
  const j = i + d
  if (j < 0 || j >= arr.length) return arr
  const n = [...arr];
  [n[i], n[j]] = [n[j], n[i]]
  return n
}
export function Lines({ value, onChange, placeholder }) {
  const [txt, setTxt] = useState(value.join('\n'))
  useEffect(() => { if (!same(txt.split('\n').map(x => x.trim()).filter(Boolean), value)) setTxt(value.join('\n')) }, [value])
  return <textarea rows={Math.max(3, value.length + 1)} value={txt} placeholder={placeholder} onChange={e => { setTxt(e.target.value); onChange(e.target.value.split('\n').map(x => x.trim()).filter(Boolean)) }} />
}

export const TYPES = [
  ['text', 'ข้อความสั้น'], ['textarea', 'ข้อความยาว'], ['number', 'ตัวเลข'], ['date', 'วันที่'], ['datetime', 'วันที่-เวลา'],
  ['select', 'ตัวเลือก (เลือก 1 ค่า)'], ['multiselect', 'ตัวเลือก (เลือกได้หลายค่า)'], ['boolean', 'ใช่/ไม่ใช่'],
  ['file', 'ไฟล์แนบ'], ['ref', 'ข้อมูลเชื่อมโยง (ลูกค้า ผู้ใช้ โมดูลอื่น ฯลฯ)'], ['rows', 'ตารางย่อย (หลายบรรทัด)'],
  ['formula', 'สูตรคำนวณอัตโนมัติ'], ['email', 'อีเมล'], ['phone', 'เบอร์โทร'], ['url', 'ลิงก์เว็บ'], ['section', 'หัวข้อคั่นส่วน (ไม่เก็บข้อมูล)']
]
const typeName = f => TYPES.find(t => t[0] === f.type)?.[1] || f.type

export const entLabel = (draft, e) => (draft.modules || []).find(m => m.key === e)?.name || ENT[e]?.label || (e === 'users' ? 'ผู้ใช้' : e)
const refTargets = draft => [
  ...['customers', 'vendors', 'contacts', 'sites', 'items', 'serials', 'projects', 'tickets', 'purchaseOrders', 'warehouses'].map(e => [e, ENT[e].label]),
  ['users', 'ผู้ใช้ระบบ'], ...(draft.modules || []).map(m => [m.key, m.name + ' (โมดูลที่สร้างเอง)'])
]

// ---------- add / edit a field ----------
function FieldModal({ init, isNew, siblings, draft, onSave, onClose }) {
  const [f, setF] = useState(() => init ? clone(init) : { key: 'cf_' + uid().replace(/-/g, '').slice(0, 6), label: '', type: 'text', system: false, required: false })
  const set = p => setF(x => ({ ...x, ...p }))
  const locked = !isNew
  const isSys = !!f.system
  const others = siblings.filter(x => x.key !== f.key && x.type !== 'section')
  const nums = others.filter(x => ['number', 'formula'].includes(x.type))
  const rowsF = others.filter(x => x.type === 'rows')
  const [sb, setSb] = useState({ rows: rowsF[0]?.key || '', a: '', b: '' })
  const sbRows = rowsF.find(x => x.key === sb.rows)
  const lab = e => (e.replace(/\{(\w+)\}/g, (m, k) => '«' + (others.find(x => x.key === k)?.label || k) + '»'))
  const save = () => {
    if (!f.label.trim()) return toast('กรอกชื่อที่แสดง', 'err')
    if (f.type === 'formula' && !(f.formula || '').trim()) return toast('กรอกสูตรคำนวณ', 'err')
    if (f.type === 'rows' && !(f.cols || []).length) return toast('ตารางย่อยต้องมีอย่างน้อย 1 คอลัมน์', 'err')
    if (['select', 'multiselect'].includes(f.type) && !f.optionsFrom && !(f.options || []).length) return toast('ใส่ตัวเลือกอย่างน้อย 1 ค่า', 'err')
    const out = { ...f, label: f.label.trim() }
    if (!out.showIf?.field) delete out.showIf
    if (out.default === '') delete out.default
    onSave(out)
  }
  const siF = f.showIf ? others.find(x => x.key === f.showIf.field) : null
  return (
    <Modal wide title={isNew ? 'เพิ่มฟิลด์' : 'ตั้งค่าฟิลด์: ' + init.label} onClose={onClose} footer={<><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn primary" onClick={save}>ตกลง</button></>}>
      <div className="form-grid">
        <div className="field"><label>ชื่อที่แสดง *</label><input value={f.label} onChange={e => set({ label: e.target.value })} autoFocus /></div>
        <div className="field"><label>ชนิดข้อมูล</label><select value={f.type} disabled={locked} onChange={e => set({ type: e.target.value })}>{TYPES.map(t => <option key={t[0]} value={t[0]}>{t[1]}</option>)}</select></div>
        <div className="field wide"><label>คำอธิบายใต้ชื่อ (ไม่บังคับ)</label><input value={f.help || ''} onChange={e => set({ help: e.target.value })} /></div>
        {!['section', 'formula'].includes(f.type) && <label className="check"><input type="checkbox" checked={!!f.required} onChange={e => set({ required: e.target.checked })} /> บังคับกรอก</label>}
        {!['section'].includes(f.type) && <label className="check"><input type="checkbox" checked={!!f.wide} onChange={e => set({ wide: e.target.checked })} /> แสดงเต็มความกว้าง</label>}
        {f.type === 'text' && !isSys && <label className="check"><input type="checkbox" checked={!!f.unique} onChange={e => set({ unique: e.target.checked })} /> ห้ามซ้ำ</label>}
        {['number', 'formula'].includes(f.type) && <div className="field"><label>หน่วยท้ายตัวเลข (เช่น บาท, ชิ้น)</label><input value={f.suffix || ''} onChange={e => set({ suffix: e.target.value })} /></div>}
        {['text', 'textarea', 'number', 'email', 'phone', 'url'].includes(f.type) && <div className="field"><label>ค่าเริ่มต้น</label><input value={f.default ?? ''} onChange={e => set({ default: e.target.value })} /></div>}
        {f.type === 'date' && <div className="field"><label>ค่าเริ่มต้น</label><select value={f.default || ''} onChange={e => set({ default: e.target.value })}><option value="">ว่าง</option><option value="@today">วันนี้</option></select></div>}
        {f.type === 'ref' && <div className="field"><label>เชื่อมกับ</label><select value={f.ref || ''} disabled={locked} onChange={e => set({ ref: e.target.value })}><option value="">– เลือก –</option>{refTargets(draft).map(r => <option key={r[0]} value={r[0]}>{r[1]}</option>)}</select></div>}
        {f.type === 'ref' && f.ref === 'users' && <div className="field"><label>ค่าเริ่มต้น</label><select value={f.default || ''} onChange={e => set({ default: e.target.value })}><option value="">ว่าง</option><option value="@me">ผู้ที่กำลังบันทึก</option></select></div>}
        {['select', 'multiselect'].includes(f.type) && !f.optionsFrom && <div className="field wide"><label>ตัวเลือก (บรรทัดละ 1 ค่า)</label><Lines value={f.options || []} onChange={v => set({ options: v })} /></div>}
        {f.type === 'rows' && !locked && (
          <div className="field wide"><label>คอลัมน์ของตารางย่อย (คอลัมน์ที่ 1 = c1, ที่ 2 = c2 …)</label>
            {(f.cols || []).map((c, i) => (
              <div key={c.key} className="row" style={{ marginBottom: 6 }}>
                <span className="badge">{c.key}</span>
                <input style={{ maxWidth: 220 }} placeholder="ชื่อคอลัมน์" value={c.label} onChange={e => set({ cols: f.cols.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                <select style={{ maxWidth: 180 }} value={c.type} onChange={e => set({ cols: f.cols.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })}>{[['text', 'ข้อความ'], ['number', 'ตัวเลข'], ['select', 'ตัวเลือก'], ['ref', 'เชื่อมข้อมูล']].map(t => <option key={t[0]} value={t[0]}>{t[1]}</option>)}</select>
                {c.type === 'select' && <input style={{ maxWidth: 240 }} placeholder="ตัวเลือก คั่นด้วย ," value={(c.options || []).join(',')} onChange={e => set({ cols: f.cols.map((x, j) => (j === i ? { ...x, options: e.target.value.split(',').map(z => z.trim()).filter(Boolean) } : x)) })} />}
                {c.type === 'ref' && <select style={{ maxWidth: 200 }} value={c.ref || ''} onChange={e => set({ cols: f.cols.map((x, j) => (j === i ? { ...x, ref: e.target.value } : x)) })}><option value="">– เลือก –</option>{refTargets(draft).map(r => <option key={r[0]} value={r[0]}>{r[1]}</option>)}</select>}
                <button className="btn ghost sm" onClick={() => set({ cols: f.cols.filter((_, j) => j !== i) })}>ลบ</button>
              </div>
            ))}
            <button className="btn sm" onClick={() => set({ cols: [...(f.cols || []), { key: 'c' + (Math.max(0, ...(f.cols || []).map(z => Number(String(z.key).slice(1)) || 0)) + 1), label: '', type: 'text' }] })}>+ เพิ่มคอลัมน์</button>
          </div>
        )}
        {f.type === 'formula' && (
          <div className="field wide"><label>สูตร *</label>
            <input value={f.formula || ''} onChange={e => set({ formula: e.target.value })} placeholder="เช่น {qty} * {price} หรือ SUM({items.c1*c2})" />
            <div className="muted small">ใช้ + - * / ( ) ตัวเลข และ {'{ฟิลด์}'} — อ่านเป็น: {lab(f.formula || '') || '–'}</div>
            <div className="row" style={{ marginTop: 6 }}>{nums.map(n => <button key={n.key} type="button" className="btn sm" onClick={() => set({ formula: (f.formula || '') + '{' + n.key + '}' })}>+ {n.label}</button>)}</div>
            {rowsF.length > 0 && (
              <div className="row" style={{ marginTop: 8 }}>
                <span className="small">ผลรวมจากตารางย่อย:</span>
                <select style={{ maxWidth: 200 }} value={sb.rows} onChange={e => setSb({ rows: e.target.value, a: '', b: '' })}>{rowsF.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
                <select style={{ maxWidth: 180 }} value={sb.a} onChange={e => setSb({ ...sb, a: e.target.value })}><option value="">คอลัมน์</option>{(sbRows?.cols || []).filter(c => c.type === 'number').map(c => <option key={c.key} value={c.key}>{c.label} ({c.key})</option>)}</select>
                <span>×</span>
                <select style={{ maxWidth: 180 }} value={sb.b} onChange={e => setSb({ ...sb, b: e.target.value })}><option value="">(ไม่คูณ)</option>{(sbRows?.cols || []).filter(c => c.type === 'number').map(c => <option key={c.key} value={c.key}>{c.label} ({c.key})</option>)}</select>
                <button type="button" className="btn sm" disabled={!sb.a} onClick={() => set({ formula: (f.formula || '') + 'SUM({' + sb.rows + '.' + sb.a + (sb.b ? '*' + sb.b : '') + '})' })}>ใส่สูตรผลรวม</button>
              </div>
            )}
          </div>
        )}
        {f.type !== 'section' && others.length > 0 && (
          <div className="field wide"><label>แสดงฟิลด์นี้เมื่อ… (เงื่อนไข ไม่บังคับ)</label>
            <div className="row">
              <select style={{ maxWidth: 240 }} value={f.showIf?.field || ''} onChange={e => set({ showIf: e.target.value ? { field: e.target.value, value: others.find(x => x.key === e.target.value)?.type === 'boolean' ? true : '' } : undefined })}><option value="">แสดงเสมอ</option>{others.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}</select>
              {siF && <span>=</span>}
              {siF?.type === 'boolean' && <select style={{ maxWidth: 120 }} value={String(f.showIf.value)} onChange={e => set({ showIf: { ...f.showIf, value: e.target.value === 'true' } })}><option value="true">ใช่</option><option value="false">ไม่ใช่</option></select>}
              {siF && siF.type !== 'boolean' && (siF.options ? <select style={{ maxWidth: 220 }} value={f.showIf.value} onChange={e => set({ showIf: { ...f.showIf, value: e.target.value } })}><option value="">– เลือก –</option>{siF.options.map(o => <option key={o}>{o}</option>)}</select> : <input style={{ maxWidth: 220 }} value={f.showIf.value} onChange={e => set({ showIf: { ...f.showIf, value: e.target.value } })} />)}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ---------- fields editor (any form, or one module) ----------
export function FieldsEditor({ draft, upd, fixedEntity }) {
  const builtIn = Object.keys(draft.fields).filter(e => ENT[e] && !ENT[e].custom && draft.fields[e].length)
  const ents = [...builtIn, ...(draft.modules || []).map(m => m.key)]
  const [sel, setSel] = useState('tickets')
  const entity = fixedEntity || sel
  const [modal, setModal] = useState(null)
  const list = draft.fields[entity] || []
  const set = (i, k, v) => upd(d => { d.fields[entity][i][k] = v })
  return (
    <div>
      {!fixedEntity && (
        <div className="row" style={{ marginBottom: 10 }}>
          <div className="field"><label>แบบฟอร์ม/โมดูล</label><select value={sel} onChange={e => setSel(e.target.value)}>{ents.map(e => <option key={e} value={e}>{entLabel(draft, e)}</option>)}</select></div>
        </div>
      )}
      <div className="row" style={{ marginBottom: 10 }}><span className="grow" /><button className="btn primary" onClick={() => setModal({ isNew: true })}>+ เพิ่มฟิลด์</button></div>
      <div className="card">
        {list.length === 0 ? <Empty text="ยังไม่มีฟิลด์ — กด “เพิ่มฟิลด์”" /> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>ลำดับ</th><th>ชื่อที่แสดง</th><th>ชนิด</th><th>บังคับ</th><th>ซ่อน</th><th>ตัวเลือก</th><th /></tr></thead>
            <tbody>{list.map((f, i) => (
              <tr key={f.key}>
                <td><button className="btn ghost sm" onClick={() => upd(d => { d.fields[entity] = move(d.fields[entity], i, -1) })} aria-label="ขึ้น">▲</button><button className="btn ghost sm" onClick={() => upd(d => { d.fields[entity] = move(d.fields[entity], i, 1) })} aria-label="ลง">▼</button></td>
                <td><input value={f.label} onChange={e => set(i, 'label', e.target.value)} /> {!f.system && <Badge color="violet">เพิ่มเอง</Badge>}{f.showIf && <Badge color="amber">มีเงื่อนไข</Badge>}</td>
                <td>{typeName(f)}{f.type === 'ref' && ` → ${entLabel(draft, f.ref)}`}{f.type === 'formula' && <div className="muted small">{f.formula}</div>}</td>
                <td>{!['section', 'formula'].includes(f.type) && <input type="checkbox" checked={!!f.required} onChange={e => set(i, 'required', e.target.checked)} aria-label="บังคับ" />}</td>
                <td><input type="checkbox" checked={!!f.hidden} onChange={e => set(i, 'hidden', e.target.checked)} aria-label="ซ่อน" /></td>
                <td style={{ minWidth: 200 }}>{['select', 'multiselect'].includes(f.type) && (f.optionsFrom ? <span className="muted small">ใช้รายการกลาง ({f.optionsFrom})</span> : <Lines value={f.options || []} onChange={v => set(i, 'options', v)} />)}</td>
                <td><button className="btn sm" onClick={() => setModal({ idx: i })}>ตั้งค่า</button>{!f.system && <button className="btn ghost sm" onClick={() => upd(d => { d.fields[entity].splice(i, 1) })}>ลบ</button>}</td>
              </tr>
            ))}</tbody></table></div>
        )}
        <p className="muted small">ฟิลด์ที่มีข้อมูลแล้วลบไม่ได้ ให้ใช้ “ซ่อน” — ระบบจะแสดงผลกระทบก่อนใช้การตั้งค่าทุกครั้ง</p>
      </div>
      {modal && (
        <FieldModal isNew={!!modal.isNew} init={modal.isNew ? null : list[modal.idx]} siblings={list} draft={draft} onClose={() => setModal(null)}
          onSave={f => { upd(d => { if (modal.isNew) d.fields[entity].push(f); else d.fields[entity][modal.idx] = f }); setModal(null) }} />
      )}
    </div>
  )
}

// ---------- module builder ----------
function NewModuleModal({ draft, onCreate, onClose }) {
  const [tplId, setTplId] = useState('blank')
  const [name, setName] = useState('')
  const [group, setGroup] = useState('โมดูลของฉัน')
  const [prefix, setPrefix] = useState('')
  const [grant, setGrant] = useState({})
  const tpl = TEMPLATES.find(t => t.id === tplId)
  return (
    <Modal wide title="สร้างโมดูลใหม่" onClose={onClose} footer={<><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn primary" onClick={() => {
      if (!name.trim()) return toast('กรอกชื่อโมดูล', 'err')
      onCreate(buildModule(tpl, name.trim(), group.trim(), prefix.trim() || tpl.module.prefix), grant)
    }}>สร้างโมดูล</button></>}>
      <h3 style={{ marginBottom: 8 }}>1. เลือกจุดเริ่มต้น</h3>
      <div className="grid c2" style={{ marginBottom: 14 }}>
        {TEMPLATES.map(t => (
          <label key={t.id} className="card tpl" style={{ cursor: 'pointer', borderColor: tplId === t.id ? 'var(--pri)' : undefined, margin: 0 }}>
            <input type="radio" name="tpl" checked={tplId === t.id} onChange={() => { setTplId(t.id); if (!name) setName(t.id === 'blank' ? '' : t.name) }} /> <b>{t.name}</b>
            <div className="muted small">{t.desc}</div>
          </label>
        ))}
      </div>
      <h3 style={{ marginBottom: 8 }}>2. ตั้งชื่อ</h3>
      <div className="form-grid">
        <div className="field"><label>ชื่อโมดูล *</label><input value={name} onChange={e => setName(e.target.value)} placeholder="เช่น ใบลา, ติดตามหนังสือราชการ, ทะเบียนยานพาหนะ" /></div>
        <div className="field"><label>อยู่ในกลุ่มเมนู</label><input value={group} onChange={e => setGroup(e.target.value)} list="groups" /><datalist id="groups">{[...new Set((draft.modules || []).map(m => m.group))].map(g => <option key={g} value={g} />)}</datalist></div>
        <div className="field"><label>ตัวอักษรนำหน้าเลขที่เอกสาร</label><input value={prefix} onChange={e => setPrefix(e.target.value.replace(/[^A-Za-z]/g, '').slice(0, 5))} placeholder={tpl.module.prefix} /></div>
      </div>
      <h3 style={{ margin: '14px 0 6px' }}>3. ใครใช้ได้บ้าง (ผู้ดูแลระบบใช้ได้เสมอ)</h3>
      <div className="row">{draft.roles.filter(r => !r.isAdmin).map(r => <label key={r.id} className="check small"><input type="checkbox" checked={!!grant[r.id]} onChange={e => setGrant({ ...grant, [r.id]: e.target.checked })} /> {r.name} (ดู/สร้าง/แก้ไข)</label>)}</div>
      <p className="muted small">ปรับสิทธิ์ละเอียดได้ภายหลังในแท็บ “สิทธิ์” ของโมดูล</p>
    </Modal>
  )
}

const DEFAULT_STATUSES = () => [
  { key: 's' + uid().slice(0, 4), label: 'ใหม่', color: 'blue', next: [], requiredFields: [], enabled: true, approverRole: '', approverUser: '' },
  { key: 's' + uid().slice(0, 4), label: 'กำลังดำเนินการ', color: 'amber', next: [], requiredFields: [], enabled: true, approverRole: '', approverUser: '' },
  { key: 's' + uid().slice(0, 4), label: 'เสร็จสิ้น', color: 'green', next: [], requiredFields: [], enabled: true, approverRole: '', approverUser: '', final: true }
]

export function ModulesEditor({ draft, upd, StatusWf, s }) {
  const [sp, setSp] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const [sub, setSub] = useState('general')
  const mods = draft.modules || []
  const m = mods.find(x => x.key === sp.get('m')) || null
  const mi = mods.findIndex(x => x.key === m?.key)
  const setM = p => upd(d => { Object.assign(d.modules[mi], p) })
  const live = (s.config.modules || []).some(x => x.key === m?.key)
  const create = (b, grant) => {
    upd(d => {
      d.modules.push(b.module)
      d.fields[b.module.key] = b.fields
      if (b.workflow) d.workflows[b.module.key] = b.workflow
      d.roles.forEach(r => { if (grant[r.id]) { r.perms[b.module.key] = { view: true, create: true, edit: true } } })
    })
    setCreating(false); setSub('general'); setSp({ m: b.module.key })
    toast('สร้างโมดูลในร่างแล้ว — กด “ตรวจผลกระทบและใช้” ด้านบนเพื่อเปิดใช้งานจริง')
  }
  const remove = async () => {
    const r = await askConfirm({ title: 'ลบโมดูลออกจากการตั้งค่า', message: `ลบโมดูล “${m.name}” ฟิลด์ สถานะ และสิทธิ์ของโมดูลนี้ (ถ้าโมดูลมีข้อมูลอยู่ ระบบจะไม่ให้ใช้การเปลี่ยนแปลงนี้ — ให้ซ่อนจากเมนูแทน)`, danger: true, confirmText: 'ลบ' })
    if (!r.ok) return
    upd(d => { d.modules.splice(mi, 1); delete d.fields[m.key]; delete d.workflows[m.key]; d.roles.forEach(x => { delete x.perms[m.key] }) })
    setSp({})
  }
  const fields = (m && draft.fields[m.key]) || []
  const wf = m && draft.workflows[m.key]
  const tog = (arr, k) => (arr.includes(k) ? arr.filter(x => x !== k) : [...arr, k])
  const selectFields = fields.filter(f => f.type === 'select')
  return (
    <div>
      {!m ? (
        <div>
          <div className="notice">สร้างโมดูลงานของตัวเองได้ไม่จำกัด: กำหนดฟิลด์ สถานะ มุมมอง (ตาราง/บอร์ด/ปฏิทิน) สิทธิ์ และเชื่อมโยงกับข้อมูลเดิมได้ โมดูลจะขึ้นในเมนูซ้ายหลังกด “ตรวจผลกระทบและใช้”</div>
          <button className="btn primary" style={{ marginBottom: 14 }} onClick={() => setCreating(true)}>+ สร้างโมดูลใหม่</button>
          <div className="grid c2">
            {mods.map(x => (
              <div key={x.key} className="card" style={{ margin: 0 }}>
                <h3>{x.name} {!x.active && <Badge color="gray">ซ่อนจากเมนู</Badge>} {!(s.config.modules || []).some(z => z.key === x.key) && <Badge color="amber">ยังไม่ใช้งานจริง</Badge>}</h3>
                <div className="muted small">{x.desc}</div>
                <div className="small">กลุ่มเมนู: {x.group} · {(draft.fields[x.key] || []).length} ฟิลด์ · {(s.data[x.key] || []).length} รายการ{draft.workflows[x.key] ? ' · มีสถานะ' : ''}</div>
                <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setSp({ m: x.key })}>แก้ไขโมดูล</button>
              </div>
            ))}
          </div>
          {mods.length === 0 && <Empty text="ยังไม่มีโมดูลที่สร้างเอง" />}
        </div>
      ) : (
        <div>
          <div className="row" style={{ marginBottom: 10 }}>
            <button className="btn" onClick={() => setSp({})}>ทุกโมดูล</button>
            <h2 style={{ margin: 0 }}>{m.name}</h2>
            {live ? <a className="btn" href={'#/m/' + m.key.slice(2)}>เปิดใช้งานโมดูล</a> : <Badge color="amber">ยังเป็นร่าง</Badge>}
          </div>
          <Tabs tabs={[['general', 'ข้อมูลทั่วไป'], ['fields', 'ฟิลด์ (' + fields.length + ')'], ['wf', 'สถานะ/ขั้นตอน'], ['view', 'ตารางและมุมมอง'], ['perms', 'สิทธิ์'], ['danger', 'ลบโมดูล']]} value={sub} onChange={setSub} />
          {sub === 'general' && (
            <div className="card form-grid">
              <div className="field"><label>ชื่อโมดูล *</label><input value={m.name} onChange={e => setM({ name: e.target.value })} /></div>
              <div className="field"><label>กลุ่มเมนู</label><input value={m.group} onChange={e => setM({ group: e.target.value })} /></div>
              <div className="field wide"><label>คำอธิบายสั้น ๆ</label><input value={m.desc || ''} onChange={e => setM({ desc: e.target.value })} /></div>
              <div className="field"><label>ตัวอักษรนำหน้าเลขที่ (มีผลกับรายการใหม่)</label><input value={m.prefix} onChange={e => setM({ prefix: e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 5) })} /></div>
              <div className="field"><label>ฟิลด์ที่ใช้เป็นชื่อรายการ</label><select value={m.titleField} onChange={e => setM({ titleField: e.target.value })}>{fields.filter(f => ['text', 'select', 'number', 'date', 'email', 'phone'].includes(f.type)).map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</select></div>
              <label className="check"><input type="checkbox" checked={m.active} onChange={e => setM({ active: e.target.checked })} /> แสดงโมดูลในเมนู</label>
            </div>
          )}
          {sub === 'fields' && <FieldsEditor draft={draft} upd={upd} fixedEntity={m.key} />}
          {sub === 'wf' && (
            <div>
              <label className="check card"><input type="checkbox" checked={!!wf} onChange={e => upd(d => { if (e.target.checked) d.workflows[m.key] = { confirmed: true, statuses: DEFAULT_STATUSES() }; else delete d.workflows[m.key] })} /> ใช้สถานะ/ขั้นตอนกับโมดูลนี้ (เช่น ร่าง → รออนุมัติ → เสร็จ)</label>
              {wf ? <StatusWf draft={draft} upd={upd} s={s} wfKey={m.key} fieldsOfEntity={m.key} /> : <Empty text="โมดูลนี้ไม่มีสถานะ — เปิดตัวเลือกด้านบนหากต้องการ" />}
            </div>
          )}
          {sub === 'view' && (
            <div className="grid c2">
              <div className="card"><h3>มุมมองเริ่มต้น</h3>
                <div className="field"><label>เปิดมาเป็น</label><select value={m.view} onChange={e => setM({ view: e.target.value })}><option value="table">ตาราง</option><option value="kanban">บอร์ด (ลากการ์ด)</option><option value="calendar">ปฏิทิน</option></select></div>
                <div className="field" style={{ marginTop: 10 }}><label>บอร์ดแบ่งคอลัมน์ตาม</label><select value={m.groupField || (wf ? 'status' : '')} onChange={e => setM({ groupField: e.target.value })}>{wf && <option value="status">สถานะ</option>}{selectFields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}<option value="">(ไม่ระบุ)</option></select></div>
                <div className="field" style={{ marginTop: 10 }}><label>ปฏิทินใช้ฟิลด์วันที่</label><select value={m.dateField || ''} onChange={e => setM({ dateField: e.target.value })}><option value="">(ไม่ระบุ)</option>{fields.filter(f => ['date', 'datetime'].includes(f.type)).map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</select></div>
              </div>
              <div className="card"><h3>คอลัมน์ในตาราง</h3>
                {fields.filter(f => !['section', 'rows'].includes(f.type)).map(f => <label key={f.key} className="check"><input type="checkbox" checked={m.cols.includes(f.key)} onChange={() => setM({ cols: tog(m.cols, f.key) })} /> {f.label}</label>)}
                <p className="muted small">ลำดับคอลัมน์ตามลำดับฟิลด์ที่คลิก (เลือกใหม่เพื่อต่อท้าย)</p></div>
              <div className="card"><h3>ตัวกรองด่วน</h3>
                {fields.filter(f => ['select', 'ref', 'boolean'].includes(f.type)).map(f => <label key={f.key} className="check"><input type="checkbox" checked={m.filters.includes(f.key)} onChange={() => setM({ filters: tog(m.filters, f.key) })} /> {f.label}</label>)}
                {fields.filter(f => ['select', 'ref'].includes(f.type)).length === 0 && <span className="muted">เพิ่มฟิลด์ตัวเลือกหรือข้อมูลเชื่อมโยงก่อน</span>}</div>
              <div className="card"><h3>ตัวเลขสรุปด้านบน (รวมยอด)</h3>
                {fields.filter(f => ['number', 'formula'].includes(f.type)).map(f => <label key={f.key} className="check"><input type="checkbox" checked={(m.summary || []).includes(f.key)} onChange={() => setM({ summary: tog(m.summary || [], f.key) })} /> {f.label}</label>)}
                {fields.filter(f => ['number', 'formula'].includes(f.type)).length === 0 && <span className="muted">ยังไม่มีฟิลด์ตัวเลข</span>}</div>
            </div>
          )}
          {sub === 'perms' && (
            <div className="card">
              <p className="muted">กำหนดว่าบทบาทใดทำอะไรกับโมดูลนี้ได้ (ผู้ดูแลระบบทำได้ทุกอย่าง) — “ปิดรายการ” ใช้กับสถานะที่ตั้งว่าต้องมีสิทธิ์ปิด</p>
              <div className="table-wrap"><table className="mini perm-table"><thead><tr><th>บทบาท</th>{ACTIONS.map(a => <th key={a[0]}>{a[1]}</th>)}</tr></thead>
                <tbody>{draft.roles.filter(r => !r.isAdmin).map(r => {
                  const ri = draft.roles.indexOf(r)
                  return <tr key={r.id}><td>{r.name}</td>{ACTIONS.map(([a]) => <td key={a}><input type="checkbox" checked={!!r.perms[m.key]?.[a]} onChange={e => upd(d => { d.roles[ri].perms[m.key] = d.roles[ri].perms[m.key] || {}; d.roles[ri].perms[m.key][a] = e.target.checked })} aria-label={r.name + ' ' + a} /></td>)}</tr>
                })}</tbody></table></div>
            </div>
          )}
          {sub === 'danger' && (
            <div className="card">
              <p>ถ้าโมดูลมีข้อมูลอยู่แล้ว ระบบจะไม่ให้ลบ ให้ปิด “แสดงโมดูลในเมนู” แทน (ข้อมูลและประวัติยังอยู่)</p>
              <button className="btn danger" onClick={remove}>ลบโมดูลนี้</button>
            </div>
          )}
        </div>
      )}
      {creating && <NewModuleModal draft={draft} onCreate={create} onClose={() => setCreating(false)} />}
    </div>
  )
}

// ---------- menu ----------
export function NavEditor({ draft, upd }) {
  const hidden = draft.nav?.hidden || []
  const fixed = ['/', '/my', '/settings']
  const tog = p => upd(d => { d.nav = d.nav || { hidden: [] }; d.nav.hidden = d.nav.hidden.includes(p) ? d.nav.hidden.filter(x => x !== p) : [...d.nav.hidden, p] })
  return (
    <div className="grid c2">
      <div className="card"><h3>เมนูพรีเซ็ต</h3>
        <p className="muted small">ซ่อนเมนูที่ไม่ใช้ได้ (ข้อมูลและสิทธิ์ไม่เปลี่ยน แค่ไม่แสดงในเมนู)</p>
        {PRESET_NAV.map(([group, items]) => (
          <div key={group}><b>{group}</b>
            {items.map(([to, l]) => <label key={to} className="check"><input type="checkbox" disabled={fixed.includes(to)} checked={!hidden.includes(to)} onChange={() => tog(to)} /> {l}</label>)}</div>
        ))}
      </div>
      <div className="card"><h3>เมนูของโมดูลที่สร้างเอง</h3>
        {(draft.modules || []).length === 0 ? <Empty text="ยังไม่มีโมดูลที่สร้างเอง" /> : (draft.modules || []).map((m, i) => (
          <label key={m.key} className="check"><input type="checkbox" checked={m.active} onChange={e => upd(d => { d.modules[i].active = e.target.checked })} /> {m.name} <span className="muted small">(กลุ่ม: {m.group})</span></label>
        ))}
        <p className="muted small">เปลี่ยนชื่อกลุ่มเมนูและลำดับได้ที่หน้าแก้ไขโมดูล</p>
      </div>
    </div>
  )
}
export { resourcesOf }
