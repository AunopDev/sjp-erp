import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp, Page, DataTable, Modal, Badge, Empty, ErrorBox, Tabs, useSubmit, toast, askConfirm } from '../components/ui'
import { act, resetApplicationData, exportBackup } from '../lib/store'
import * as db from '../lib/db'
import { diffConfig } from '../lib/configdiff'
import { ENT, ACTIONS, resourcesOf } from '../lib/schema'
import { clone, same, move, Lines, FieldsEditor, ModulesEditor, NavEditor } from './SettingsModules'
import { fmtDateTime, downloadFile, uid } from '../lib/util'

const COLORS = ['gray', 'blue', 'indigo', 'amber', 'violet', 'teal', 'green', 'red']

function ListsEditor({ draft, upd }) {
  return (
    <div className="grid c2">
      <div className="card"><h3>ทีม (ค่าเสนอ รอยืนยัน)</h3><Lines value={draft.lists.teams} onChange={v => upd(d => { d.lists.teams = v })} /></div>
      <div className="card"><h3>แผนก (ค่าเสนอ รอยืนยัน)</h3><Lines value={draft.lists.depts} onChange={v => upd(d => { d.lists.depts = v })} /></div>
    </div>
  )
}

function ApproverSelect({ obj, onChange, s, draft }) {
  return (
    <div className="row">
      <select value={obj.approverRole || ''} onChange={e => onChange({ approverRole: e.target.value })}><option value="">ผู้อนุมัติ: ไม่ตั้ง (ไม่ต้องอนุมัติ)</option>{draft.roles.map(r => <option key={r.id} value={r.id}>บทบาท: {r.name}</option>)}</select>
      <select value={obj.approverUser || ''} onChange={e => onChange({ approverUser: e.target.value })}><option value="">หรือระบุผู้ใช้: –</option>{s.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
    </div>
  )
}

// ---------- project workflow ----------
function ProjectWfEditor({ draft, upd, s }) {
  const wf = draft.workflows.project
  const set = (i, patchObj) => upd(d => { Object.assign(d.workflows.project.steps[i], patchObj) })
  return (
    <div>
      <div className="notice warn small">ขั้นตอนทั้งหมดเป็น workflow ตั้งต้นจากเอกสารของผู้ใช้เพื่อให้ตรวจสอบ — ยังไม่มีการตั้งผู้อนุมัติ วงเงิน หรือเอกสารบังคับ จนกว่าจะยืนยัน
        <label className="check" style={{ marginTop: 6 }}><input type="checkbox" checked={wf.confirmed} onChange={e => upd(d => { d.workflows.project.confirmed = e.target.checked })} /> ฉันยืนยันว่า workflow โครงการนี้เป็นของจริง</label></div>
      {wf.steps.map((st, i) => (
        <details key={st.key} className="card" open={false}>
          <summary><b>{st.label}</b> {!st.enabled && <Badge color="gray">ปิดใช้</Badge>} {st.approvalRequired && <Badge color="amber">ต้องอนุมัติ</Badge>}</summary>
          <div className="form-grid" style={{ marginTop: 10 }}>
            <div className="field"><label>ชื่อขั้นตอน</label><input value={st.label} onChange={e => set(i, { label: e.target.value })} /></div>
            <div className="field"><label>คำอธิบาย</label><input value={st.desc} onChange={e => set(i, { desc: e.target.value })} /></div>
            <label className="check"><input type="checkbox" checked={st.enabled} onChange={e => set(i, { enabled: e.target.checked })} /> เปิดใช้ขั้นตอนนี้</label>
            <label className="check"><input type="checkbox" checked={st.requireDocs} onChange={e => set(i, { requireDocs: e.target.checked })} /> บังคับแนบเอกสารทุกรายการก่อนจบขั้นตอน</label>
            <label className="check"><input type="checkbox" checked={st.approvalRequired} onChange={e => set(i, { approvalRequired: e.target.checked })} /> ต้องอนุมัติก่อนจบขั้นตอน</label>
            {st.approvalRequired && <div className="field wide"><ApproverSelect obj={st} s={s} draft={draft} onChange={p => set(i, p)} />{!st.approverRole && !st.approverUser && <div className="muted small">ยังไม่ตั้งผู้อนุมัติ → ระบบจะไม่ขออนุมัติ (รอผู้ใช้ยืนยัน)</div>}</div>}
            <div className="field wide"><label>เอกสารของขั้นตอน (บรรทัดละ 1 รายการ)</label>
              <Lines value={st.docs.map(d => d.label)} onChange={v => set(i, { docs: v.map((l, k) => st.docs[k] && st.docs[k].label === l ? st.docs[k] : { key: st.docs[k]?.key || 'd_' + uid().slice(0, 5), label: l }) })} /></div>
            <div className="field wide"><label>ฟิลด์ของขั้นตอน</label>
              {st.fields.map((f, k) => (
                <div key={f.key} className="row" style={{ marginBottom: 4 }}>
                  <input style={{ maxWidth: 260 }} value={f.label} onChange={e => upd(d => { d.workflows.project.steps[i].fields[k].label = e.target.value })} />
                  <label className="check small"><input type="checkbox" checked={!!f.required} onChange={e => upd(d => { d.workflows.project.steps[i].fields[k].required = e.target.checked })} /> บังคับ</label>
                  <label className="check small"><input type="checkbox" checked={!!f.hidden} onChange={e => upd(d => { d.workflows.project.steps[i].fields[k].hidden = e.target.checked })} /> ซ่อน</label>
                </div>
              ))}
              <button className="btn sm" onClick={() => upd(d => { d.workflows.project.steps[i].fields.push({ key: 'cf_' + uid().slice(0, 6), label: 'ฟิลด์ใหม่', type: 'text' }) })}>+ เพิ่มฟิลด์ข้อความ</button></div>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => upd(d => { d.workflows.project.steps = move(d.workflows.project.steps, i, -1) })}>▲ เลื่อนขึ้น</button>
            <button className="btn sm" onClick={() => upd(d => { d.workflows.project.steps = move(d.workflows.project.steps, i, 1) })}>▼ เลื่อนลง</button>
            {!st.source && <button className="btn sm danger" onClick={() => upd(d => { d.workflows.project.steps.splice(i, 1) })}>ลบขั้นตอน</button>}
          </div>
        </details>
      ))}
      <button className="btn" onClick={() => upd(d => { d.workflows.project.steps.push({ key: 'x_' + uid().slice(0, 5), label: 'ขั้นตอนใหม่', desc: '', fields: [], docs: [], enabled: true, requireDocs: false, approvalRequired: false, approverRole: '', approverUser: '' }) })}>+ เพิ่มขั้นตอน</button>
    </div>
  )
}

// ---------- status workflows (ticket / po) ----------
function StatusWfEditor({ draft, upd, s, wfKey, fieldsOfEntity }) {
  const wf = draft.workflows[wfKey]
  const set = (i, p) => upd(d => { Object.assign(d.workflows[wfKey].statuses[i], p) })
  const ff = fieldsOfEntity ? draft.fields[fieldsOfEntity] : []
  const toggle = (arr, k) => (arr.includes(k) ? arr.filter(x => x !== k) : [...arr, k])
  return (
    <div>
      <div className="notice warn small">{wfKey === 'ticket' ? 'ชุดสถานะนี้เป็นข้อเสนอเริ่มต้นจากเอกสาร ให้ผู้ใช้ตรวจและยืนยันก่อนใช้จริง' : 'สถานะใบสั่งซื้อเป็นค่าเสนอ'}
        <label className="check" style={{ marginTop: 6 }}><input type="checkbox" checked={wf.confirmed} onChange={e => upd(d => { d.workflows[wfKey].confirmed = e.target.checked })} /> ฉันยืนยันว่าชุดสถานะนี้เป็นของจริง</label></div>
      {wf.statuses.map((st, i) => (
        <details key={st.key} className="card">
          <summary><Badge color={st.color}>{st.label}</Badge> {!st.enabled && <Badge color="gray">ปิดใช้</Badge>} <span className="muted small">→ {st.next.map(k => wf.statuses.find(x => x.key === k)?.label).filter(Boolean).join(', ') || 'ไม่มี'}</span></summary>
          <div className="form-grid" style={{ marginTop: 10 }}>
            <div className="field"><label>ชื่อสถานะ</label><input value={st.label} onChange={e => set(i, { label: e.target.value })} /></div>
            <div className="field"><label>สี</label><select value={st.color} onChange={e => set(i, { color: e.target.value })}>{COLORS.map(c => <option key={c}>{c}</option>)}</select></div>
            <label className="check"><input type="checkbox" checked={st.enabled} onChange={e => set(i, { enabled: e.target.checked })} /> เปิดใช้</label>
            <label className="check"><input type="checkbox" checked={!!st.final} onChange={e => set(i, { final: e.target.checked })} /> สถานะสิ้นสุด (ปิดเคส/จบงาน)</label>
            <label className="check"><input type="checkbox" checked={!!st.needClosePerm} onChange={e => set(i, { needClosePerm: e.target.checked })} /> ต้องมีสิทธิ์ “ปิดรายการ”</label>
            <div className="field wide"><label>เปลี่ยนไปสถานะใดได้ (ว่าง = ไปได้ทุกสถานะ)</label>
              <div className="row">{wf.statuses.filter(x => x.key !== st.key).map(x => <label key={x.key} className="check small"><input type="checkbox" checked={st.next.includes(x.key)} onChange={() => set(i, { next: toggle(st.next, x.key) })} /> {x.label}</label>)}</div></div>
            {ff.length > 0 && <div className="field wide"><label>ฟิลด์ที่ต้องกรอกก่อนเข้าสถานะนี้</label>
              <div className="row">{ff.filter(f => f.type !== 'file' && f.type !== 'rows').map(f => <label key={f.key} className="check small"><input type="checkbox" checked={(st.requiredFields || []).includes(f.key)} onChange={() => set(i, { requiredFields: toggle(st.requiredFields || [], f.key) })} /> {f.label}</label>)}</div></div>}
            <div className="field wide"><label>ผู้อนุมัติเมื่อเปลี่ยนมาสถานะนี้</label><ApproverSelect obj={st} s={s} draft={draft} onChange={p => set(i, p)} /></div>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => upd(d => { d.workflows[wfKey].statuses = move(d.workflows[wfKey].statuses, i, -1) })}>▲</button>
            <button className="btn sm" onClick={() => upd(d => { d.workflows[wfKey].statuses = move(d.workflows[wfKey].statuses, i, 1) })}>▼</button>
            <button className="btn sm danger" onClick={() => upd(d => { d.workflows[wfKey].statuses.splice(i, 1) })}>ลบสถานะ</button>
          </div>
        </details>
      ))}
      <button className="btn" onClick={() => upd(d => { d.workflows[wfKey].statuses.push({ key: 'x_' + uid().slice(0, 5), label: 'สถานะใหม่', color: 'gray', next: [], requiredFields: [], enabled: true, approverRole: '', approverUser: '' }) })}>+ เพิ่มสถานะ</button>
      {wfKey === 'po' && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>วงเงินอนุมัติใบสั่งซื้อ</h3>
          <p className="muted small">ยังไม่มีการตั้งวงเงิน (รอผู้ใช้แจ้ง) — เพิ่มแถวเพื่อกำหนด: PO ที่มูลค่าไม่เกินวงเงินนั้นต้องให้ผู้อนุมัติที่เลือกอนุมัติก่อนเปลี่ยนเป็น “สั่งซื้อแล้ว”</p>
          {wf.limits.map((l, i) => (
            <div key={i} className="row" style={{ marginBottom: 6 }}>
              <input type="number" style={{ maxWidth: 160 }} placeholder="วงเงินไม่เกิน (บาท)" value={l.upTo} onChange={e => upd(d => { d.workflows.po.limits[i].upTo = e.target.value })} />
              <ApproverSelect obj={l} s={s} draft={draft} onChange={p => upd(d => { Object.assign(d.workflows.po.limits[i], p) })} />
              <button className="btn ghost sm" onClick={() => upd(d => { d.workflows.po.limits.splice(i, 1) })}>ลบ</button>
            </div>
          ))}
          <button className="btn sm" onClick={() => upd(d => { d.workflows.po.limits.push({ upTo: '', approverRole: '', approverUser: '' }) })}>+ เพิ่มวงเงิน</button>
        </div>
      )}
    </div>
  )
}

// ---------- roles ----------
function RolesEditor({ draft, upd, s }) {
  const [rid, setRid] = useState(draft.roles[0]?.id)
  const idx = draft.roles.findIndex(r => r.id === rid)
  const role = draft.roles[idx] || draft.roles[0]
  if (!role) return <Empty />
  const i = draft.roles.indexOf(role)
  const users = s.users.filter(u => u.roleId === role.id)
  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="field"><label>บทบาท</label><select value={role.id} onChange={e => setRid(e.target.value)}>{draft.roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
        <button className="btn" onClick={() => { const id = 'role_' + uid().slice(0, 5); upd(d => { const c = clone(d.roles[i]); c.id = id; c.name = c.name + ' (สำเนา)'; c.isAdmin = false; d.roles.push(c) }); setRid(id) }}>+ สร้างบทบาท (คัดลอกจากที่เลือก)</button>
        {!role.isAdmin && <button className="btn danger" onClick={() => { upd(d => { d.roles.splice(i, 1) }); setRid(draft.roles[0].id) }}>ลบบทบาท</button>}
      </div>
      <div className="card">
        <div className="form-grid">
          <div className="field"><label>ชื่อบทบาท</label><input value={role.name} onChange={e => upd(d => { d.roles[i].name = e.target.value })} /></div>
          <div className="field"><label>จำกัดข้อมูลตาม</label>
            <select value={role.scope} disabled={role.isAdmin} onChange={e => upd(d => { d.roles[i].scope = e.target.value })}>
              {[['all', 'ทั้งหมด'], ['dept', 'แผนกของผู้ใช้'], ['team', 'ทีมของผู้ใช้'], ['project', 'โครงการที่ผู้ใช้ถูกกำหนด'], ['site', 'ไซต์ที่ผู้ใช้ถูกกำหนด'], ['own', 'เฉพาะที่ตนเองรับผิดชอบ/สร้าง']].map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}</select></div>
        </div>
        <p className="muted small">การจำกัดใช้กับ โครงการ Ticket ใบสั่งซื้อ การเคลื่อนไหวคลัง PM Serial และไซต์ — ผู้ใช้ {users.length} คนใช้บทบาทนี้{role.isAdmin && ' · ผู้ดูแลระบบมีสิทธิ์ทุกอย่างและไม่ถูกจำกัด'}</p>
        <div className="table-wrap"><table className="mini perm-table"><thead><tr><th>หมวด</th>{ACTIONS.map(a => <th key={a[0]}>{a[1]}</th>)}</tr></thead>
          <tbody>{resourcesOf(draft).map(([r, l]) => <tr key={r}><td>{l}</td>{ACTIONS.map(([a]) => <td key={a}><input type="checkbox" disabled={role.isAdmin} checked={role.isAdmin || !!role.perms[r]?.[a]} onChange={e => upd(d => { d.roles[i].perms[r] = d.roles[i].perms[r] || {}; d.roles[i].perms[r][a] = e.target.checked })} aria-label={`${l} ${a}`} /></td>)}</tr>)}</tbody></table></div>
      </div>
    </div>
  )
}

// ---------- users ----------
function UserModal({ u, draftRoles, onClose }) {
  const { s } = useApp()
  const [v, setV] = useState(u || { username: '', name: '', roleId: draftRoles[0]?.id, dept: '', team: '', projectIds: [], siteIds: [], active: true })
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, run] = useSubmit()
  const multi = (k, opts) => (
    <div className="field wide"><label>{k === 'projectIds' ? 'โครงการที่เข้าถึง (ใช้กับบทบาทจำกัดตามโครงการ)' : 'ไซต์ที่เข้าถึง (ใช้กับบทบาทจำกัดตามไซต์)'}</label>
      <div className="row">{opts.map(o => <label key={o[0]} className="check small"><input type="checkbox" checked={v[k].includes(o[0])} onChange={() => setV({ ...v, [k]: v[k].includes(o[0]) ? v[k].filter(x => x !== o[0]) : [...v[k], o[0]] })} /> {o[1]}</label>)}</div></div>
  )
  return (
    <Modal wide title={u ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn primary" disabled={busy} onClick={async () => {
      const r = await run(() => act(st => db.saveUser(st, v, pw)), 'บันทึกผู้ใช้แล้ว'); if (r.ok) onClose(); else if (r.error !== 'busy') setErr(r.error)
    }}>บันทึก</button></>}>
      <div className="form-grid">
        <div className="field"><label>ชื่อผู้ใช้ *</label><input value={v.username} onChange={e => setV({ ...v, username: e.target.value })} /></div>
        <div className="field"><label>ชื่อ-สกุล *</label><input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} /></div>
        <div className="field"><label>บทบาท</label><select value={v.roleId} onChange={e => setV({ ...v, roleId: e.target.value })}>{draftRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
        <div className="field"><label>{u ? 'ตั้งรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)' : 'รหัสผ่าน * (อย่างน้อย 6 ตัว)'}</label><input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></div>
        <div className="field"><label>แผนก</label><select value={v.dept} onChange={e => setV({ ...v, dept: e.target.value })}><option value="">–</option>{s.config.lists.depts.map(x => <option key={x}>{x}</option>)}</select></div>
        <div className="field"><label>ทีม</label><select value={v.team} onChange={e => setV({ ...v, team: e.target.value })}><option value="">–</option>{s.config.lists.teams.map(x => <option key={x}>{x}</option>)}</select></div>
        {multi('projectIds', db.rows(s, 'projects').map(p => [p.id, p.code]))}
        {multi('siteIds', db.rows(s, 'sites').map(p => [p.id, p.name]))}
        <label className="check"><input type="checkbox" checked={v.active !== false} onChange={e => setV({ ...v, active: e.target.checked })} /> เปิดใช้งานบัญชี</label>
      </div>
      {err && <div className="err" role="alert">{err}</div>}
    </Modal>
  )
}
function UsersAdmin({ draft }) {
  const { s } = useApp()
  const [edit, setEdit] = useState(null)
  const cols = [
    { key: 'username', label: 'ชื่อผู้ใช้' }, { key: 'name', label: 'ชื่อ-สกุล' }, { key: 'role', label: 'บทบาท', value: u => s.config.roles.find(r => r.id === u.roleId)?.name },
    { key: 'dept', label: 'แผนก' }, { key: 'team', label: 'ทีม' }, { key: 'active', label: 'สถานะ', value: u => (u.active !== false ? 'ใช้งาน' : 'ปิด'), render: u => <Badge color={u.active !== false ? 'green' : 'gray'}>{u.active !== false ? 'ใช้งาน' : 'ปิด'}</Badge> }
  ]
  return (
    <div>
      <p className="muted small">ผู้ใช้และรหัสผ่านบันทึกทันที (ไม่ผ่านขั้นตอนตรวจผลกระทบ) — รหัสผ่านไม่ถูกแสดงในหน้าจอหรือรายงาน</p>
      <button className="btn primary" style={{ marginBottom: 10 }} onClick={() => setEdit({})}>+ เพิ่มผู้ใช้</button>
      <DataTable columns={cols} data={s.users} onRow={u => setEdit(u)} />
      {edit && <UserModal u={edit.id ? edit : null} draftRoles={draft.roles} onClose={() => setEdit(null)} />}
    </div>
  )
}

// ---------- escalation ----------
function EscalationEditor({ draft, upd }) {
  const es = draft.escalation
  return (
    <div>
      <div className="notice warn">ช่วงเวลา 6–12, 24, 48 และ 60 ชม. เป็น <b>ตัวอย่างจากเอกสาร</b> ไม่ใช่ SLA จริง การแจ้งเตือน/ยกระดับ<b>ปิดอยู่</b> จนกว่าผู้ใช้ยืนยันค่าจริงและเปิดใช้ด้านล่าง</div>
      <div className="card">
        <label className="check"><input type="checkbox" checked={es.confirmed} onChange={e => upd(d => { d.escalation.confirmed = e.target.checked; if (!e.target.checked) d.escalation.enabled = false })} /> ฉันยืนยันว่าเกณฑ์เวลาด้านล่างเป็นค่าจริงที่บริษัทใช้ (ไม่ใช่ตัวอย่าง)</label>
        <label className="check" style={{ marginTop: 6 }}><input type="checkbox" disabled={!es.confirmed} checked={es.enabled} onChange={e => upd(d => { d.escalation.enabled = e.target.checked })} /> เปิดใช้การไฮไลต์/แจ้งเตือน/ยกระดับเคสค้างตามเกณฑ์</label>
      </div>
      <div className="card"><h3>ช่วงอายุเคสสำหรับ Dashboard (ชั่วโมง คั่นด้วย ,)</h3>
        <input value={es.buckets.join(', ')} onChange={e => upd(d => { d.escalation.buckets = e.target.value.split(/[,\s]+/).map(Number).filter(n => n > 0) })} />
        <p className="muted small">ใช้แบ่งกลุ่มอายุเคสใน Dashboard และรายงานเท่านั้น ไม่ใช่การแจ้งเตือน</p></div>
      <div className="card"><h3>เกณฑ์แจ้งเตือน/ยกระดับ</h3>
        {es.rules.map((r, i) => (
          <div key={r.id} className="row" style={{ marginBottom: 6 }}>
            <input style={{ maxWidth: 260 }} value={r.label} onChange={e => upd(d => { d.escalation.rules[i].label = e.target.value })} />
            <input type="number" style={{ maxWidth: 110 }} value={r.afterHours} onChange={e => upd(d => { d.escalation.rules[i].afterHours = e.target.value })} /><span>ชม.</span>
            <select style={{ maxWidth: 220 }} value={r.action} onChange={e => upd(d => { d.escalation.rules[i].action = e.target.value })}>{['ไฮไลต์ในรายการ', 'แจ้งเตือนผู้รับผิดชอบ', 'แจ้งเตือนหัวหน้าทีม', 'ยกระดับเคส'].map(a => <option key={a}>{a}</option>)}</select>
            {r.example && <Badge color="amber">ตัวอย่าง</Badge>}
            <button className="btn ghost sm" onClick={() => upd(d => { d.escalation.rules.splice(i, 1) })}>ลบ</button>
          </div>
        ))}
        <button className="btn sm" onClick={() => upd(d => { d.escalation.rules.push({ id: uid().slice(0, 5), label: 'เกณฑ์ใหม่', afterHours: 24, action: 'ไฮไลต์ในรายการ', toRole: '' }) })}>+ เพิ่มเกณฑ์</button>
        <p className="muted small">เมื่อเปิดใช้ แถวเคสค้างจะถูกไฮไลต์ตามจำนวนเกณฑ์ที่เกิน และเคสจะขึ้นในหน้า “งานของฉัน” ส่วนแจ้งเตือน (ระบบนี้ยังไม่ส่งอีเมล/LINE)</p></div>
    </div>
  )
}

// ---------- versions & impact ----------
function ImpactModal({ s, next, title, onClose }) {
  const items = useMemo(() => diffConfig(s, s.config, next), [])
  const [label, setLabel] = useState('')
  const [busy, run] = useSubmit()
  const blocked = items.some(i => i.level === 'block')
  const color = { info: 'blue', warn: 'amber', block: 'red' }
  return (
    <Modal wide title={title || 'ตรวจผลกระทบก่อนใช้การตั้งค่า'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn primary" disabled={busy || blocked || !items.length || !label.trim()} onClick={async () => {
        const r = await run(() => act(st => db.applyConfig(st, next, label.trim(), items)), 'ใช้การตั้งค่าแล้ว'); if (r.ok) onClose(true)
      }}>ยืนยันและใช้การตั้งค่า</button></>}>
      {items.length === 0 ? <Empty text="ไม่มีการเปลี่ยนแปลง" /> : items.map((it, i) => <div key={i} style={{ padding: '4px 0' }}><Badge color={color[it.level]}>{{ info: 'แจ้งทราบ', warn: 'ระวัง', block: 'ทำไม่ได้' }[it.level]}</Badge> {it.text}</div>)}
      {blocked && <div className="notice bad" style={{ marginTop: 10 }}>มีรายการที่ทำไม่ได้ — แก้ไขก่อนจึงจะใช้การตั้งค่าได้</div>}
      <div className="field" style={{ marginTop: 12 }}><label>บันทึกการเปลี่ยนแปลงนี้ (จำเป็น) *</label><input value={label} onChange={e => setLabel(e.target.value)} placeholder="เช่น เพิ่มฟิลด์เลขที่สัญญาใน Ticket" /></div>
      <p className="muted small">ทุกครั้งที่ใช้ ระบบเก็บเวอร์ชันไว้ และย้อนกลับได้ที่แท็บ “เวอร์ชัน/ย้อนกลับ”</p>
    </Modal>
  )
}
function Versions({ s }) {
  const [target, setTarget] = useState(null)
  const list = [...s.configVersions].reverse()
  return (
    <div>
      <div className="card">
        {list.map((v, i) => (
          <div key={v.id} className="row" style={{ padding: '8px 0', borderBottom: '1px dashed #e6ecf2' }}>
            <b>เวอร์ชัน {v.no}</b>{i === 0 && <Badge color="green">ใช้อยู่</Badge>}<span>{v.label}</span><span className="muted small">{db.label(s, 'users', v.by)} · {fmtDateTime(v.at)}</span>
            <span className="grow" />
            {i > 0 && <button className="btn sm" onClick={() => setTarget(v)}>ย้อนกลับมาใช้เวอร์ชันนี้</button>}
            {v.summary?.length > 0 && <details><summary className="small">รายละเอียด ({v.summary.length})</summary>{v.summary.map((x, k) => <div key={k} className="small">• {x.text}</div>)}</details>}
          </div>
        ))}
      </div>
      {target && <ImpactModal s={s} next={target.config} title={`ย้อนกลับไปเวอร์ชัน ${target.no} — ตรวจผลกระทบ`} onClose={() => setTarget(null)} />}
    </div>
  )
}

function AuditLog({ s }) {
  const rows = [...s.audit].reverse().map(a => ({ ...a, when: a.at, ent: ENT[a.entity]?.label || a.entity }))
  const cols = [
    { key: 'when', label: 'เวลา', render: r => fmtDateTime(r.at) }, { key: 'userName', label: 'ผู้ดำเนินการ' },
    { key: 'action', label: 'การกระทำ' }, { key: 'ent', label: 'ประเภท' }, { key: 'recCode', label: 'รายการ' }, { key: 'summary', label: 'รายละเอียด' }
  ]
  return <DataTable columns={cols} data={rows} pageSize={25} exportName="audit-log" canExport filters={[{ key: 'action', label: 'การกระทำ', options: [...new Set(s.audit.map(a => a.action))], get: r => r.action }, { key: 'userName', label: 'ผู้ใช้', options: [...new Set(s.audit.map(a => a.userName))], get: r => r.userName }]} />
}

function DataTab() {
  const { s } = useApp()
  return (
    <div className="card">
      <h3>ข้อมูลและการสำรอง</h3>
      <p className="muted">ข้อมูลธุรกิจเก็บไว้ในเบราว์เซอร์เครื่องนี้ และสามารถสำรองเป็นไฟล์ JSON ได้จากหน้านี้</p>
      <div className="row">
        <button className="btn" onClick={() => { const b = JSON.parse(exportBackup()); b.users = b.users.map(({ pwHash, ...u }) => u); b.configVersions = undefined; downloadFile('sjp-erp-backup.json', JSON.stringify(b, null, 1), 'application/json'); act(st => db.audit(st, 'export', 'settings', null, 'ส่งออกข้อมูลสำรอง (ไม่รวมรหัสผ่าน)')) }}>ส่งออกข้อมูลสำรอง (JSON ไม่รวมรหัสผ่าน)</button>
        <button className="btn danger" onClick={async () => {
          const r = await askConfirm({ title: 'ล้างข้อมูลทั้งหมด', message: 'รายการธุรกิจ ประวัติ การตั้งค่า และผู้ใช้ทั้งหมดจะถูกลบถาวร แล้วระบบจะกลับไปหน้าตั้งค่าผู้ดูแลคนแรก', reasonLabel: 'พิมพ์เหตุผลเพื่อยืนยัน', danger: true, confirmText: 'ล้างข้อมูลทั้งหมด' })
          if (r.ok) resetApplicationData()
        }}>ล้างข้อมูลทั้งหมด</button>
      </div>
      <p className="muted small">ข้อมูลในระบบ: {Object.entries(s.data).map(([k, v]) => `${ENT[k]?.label || k} ${v.length}`).join(' · ')}</p>
    </div>
  )
}

const SUBS = [['modules', 'โมดูลของฉัน (สร้างเอง)'], ['nav', 'เมนู'], ['fields', 'ฟิลด์/แบบฟอร์ม'], ['lists', 'ทีม/แผนก'], ['wf-project', 'Workflow โครงการ'], ['wf-ticket', 'Workflow Ticket'], ['wf-po', 'Workflow ใบสั่งซื้อ'], ['roles', 'บทบาท/สิทธิ์'], ['users', 'ผู้ใช้'], ['esc', 'เกณฑ์เคสค้าง/แจ้งเตือน'], ['ver', 'เวอร์ชัน/ย้อนกลับ'], ['audit', 'ประวัติการเปลี่ยนแปลง'], ['data', 'ข้อมูล/สำรอง']]

// the draft lives outside the component so it survives switching pages
let _draft = null
let _baseJson = ''
const _subs = new Set()
function useDraft(config) {
  const [, force] = useState(0)
  useEffect(() => { const f = () => force(x => x + 1); _subs.add(f); return () => _subs.delete(f) }, [])
  const j = JSON.stringify(config)
  if (j !== _baseJson || !_draft) { _baseJson = j; _draft = clone(config) }
  const upd = fn => { const n = clone(_draft); fn(n); _draft = n; _subs.forEach(f => f()) }
  const reset = () => { _draft = clone(config); _subs.forEach(f => f()) }
  return [_draft, upd, reset]
}

export default function Settings() {
  const { s, can } = useApp()
  const params = useParams()
  const nav = useNavigate()
  const tab = SUBS.some(x => x[0] === params['*']) ? params['*'] : 'modules'
  const setTab = k => nav('/settings/' + k)
  const [draft, upd, reset] = useDraft(s.config)
  const [impact, setImpact] = useState(false)
  if (!can('settings', 'view')) return <Page title="ตั้งค่าระบบ"><ErrorBox error="ไม่มีสิทธิ์เข้าถึงการตั้งค่า" /></Page>
  const canEdit = can('settings', 'edit')
  const dirty = !same(draft, s.config)
  return (
    <Page title="ตั้งค่าระบบและตัวสร้างโมดูล" subtitle="สร้างโมดูลใหม่ ปรับฟิลด์ workflow สิทธิ์ และเมนู — การเปลี่ยนแปลงจะมีผลเมื่อกด “ตรวจผลกระทบและใช้”">
      {!canEdit && <div className="notice">คุณดูการตั้งค่าได้อย่างเดียว (ไม่มีสิทธิ์แก้ไข)</div>}
      {dirty && canEdit && (
        <div className="notice warn row" style={{ position: 'sticky', top: 58, zIndex: 10 }}>
          <b>มีการแก้ไขที่ยังไม่ได้ใช้</b><span className="grow" />
          <button className="btn" onClick={reset}>ยกเลิกการแก้ไข</button>
          <button className="btn primary" onClick={() => setImpact(true)}>ตรวจผลกระทบและใช้</button>
        </div>
      )}
      <Tabs tabs={SUBS} value={tab} onChange={setTab} />
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {tab === 'modules' && <ModulesEditor draft={draft} upd={upd} s={s} StatusWf={StatusWfEditor} />}
        {tab === 'nav' && <NavEditor draft={draft} upd={upd} />}
        {tab === 'fields' && <FieldsEditor draft={draft} upd={upd} />}
        {tab === 'lists' && <ListsEditor draft={draft} upd={upd} />}
        {tab === 'wf-project' && <ProjectWfEditor draft={draft} upd={upd} s={s} />}
        {tab === 'wf-ticket' && <StatusWfEditor draft={draft} upd={upd} s={s} wfKey="ticket" fieldsOfEntity="tickets" />}
        {tab === 'wf-po' && <StatusWfEditor draft={draft} upd={upd} s={s} wfKey="po" />}
        {tab === 'roles' && <RolesEditor draft={draft} upd={upd} s={s} />}
        {tab === 'esc' && <EscalationEditor draft={draft} upd={upd} />}
      </fieldset>
      {tab === 'users' && (canEdit ? <UsersAdmin draft={draft} /> : <Empty text="ไม่มีสิทธิ์จัดการผู้ใช้" />)}
      {tab === 'ver' && (canEdit ? <Versions s={s} /> : <Empty text="ไม่มีสิทธิ์" />)}
      {tab === 'audit' && <AuditLog s={s} />}
      {tab === 'data' && (canEdit ? <DataTab /> : <Empty text="ไม่มีสิทธิ์" />)}
      {impact && <ImpactModal s={s} next={draft} onClose={() => setImpact(false)} />}
    </Page>
  )
}
