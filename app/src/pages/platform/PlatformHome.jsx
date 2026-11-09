import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Page, Tabs, Badge, ErrorBox, toast, askConfirm, useSubmit } from '../../components/ui'
import { usePlatform } from '../../platform/session'
import { tr } from '../../platform/util'
import { downloadFile, fmtDateTime } from '../../lib/util'
import { PlatBar } from './PlatformEntity'
import BuilderPromo from './BuilderPromo'

const STATUS = {
  active: ['green', 'ใช้งานอยู่', 'Active'], disabled: ['gray', 'ปิดใช้งาน', 'Disabled'],
  blocked: ['red', 'ถูกระงับ (ขาดโมดูลที่ต้องพึ่งพา)', 'Blocked (missing dependency)'], available: ['blue', 'ยังไม่ได้ติดตั้ง', 'Not installed']
}

function Modules({ lang }) {
  const { get, send, isAdmin } = usePlatform()
  const [busy, run] = useSubmit()
  const [msg, setMsg] = useState(null)
  const r = get('/api/modules')
  if (!r.ok) return <ErrorBox error={r.error} />
  const th = lang !== 'en'
  const act = (name, verb, body, okText) => run(async () => {
    const res = send('POST', `/api/modules/${name}/${verb}`, body)
    if (res.ok) { setMsg(null); toast(okText) } else setMsg({ name, text: res.error })
    return res
  })
  const uninstall = async m => {
    const c = await askConfirm({ title: th ? `ถอดโมดูล “${tr(m.title, lang)}”?` : `Uninstall “${tr(m.title, lang)}”?`, message: th ? 'ข้อมูลของโมดูลจะถูกเก็บไว้ และกู้คืนได้เมื่อติดตั้งใหม่ โมดูลอื่นที่ไม่เกี่ยวข้องยังใช้งานได้ตามปกติ' : 'Its data is kept and restored if you install it again.', confirmText: th ? 'ถอดโมดูล' : 'Uninstall', danger: true })
    if (c.ok) act(m.name, 'uninstall', {}, th ? 'ถอดโมดูลแล้ว' : 'Uninstalled')
  }
  return (
    <div className="stack">
      {!isAdmin && <div className="notice">{th ? 'เฉพาะผู้ดูแลระบบของบริษัทเท่านั้นที่ติดตั้ง/ถอด/อัปเวอร์ชันโมดูลได้' : 'Only company administrators can manage modules.'}</div>}
      {r.data.map(m => {
        const [color, sth, sen] = STATUS[m.status]
        return (
          <div className="card" key={m.name} data-testid={'module-' + m.name}>
            <div className="row">
              <h3 style={{ margin: 0 }}>{tr(m.title, lang)} <span className="muted small">({m.name})</span></h3>
              <Badge color={color}>{th ? sth : sen}</Badge>
              {m.installedVersion && <Badge color="gray">v{m.installedVersion}</Badge>}
              {m.builder && <Badge color="indigo">{th ? 'สร้างจาก Builder' : 'Builder'}</Badge>}
              <span className="grow" />
              {isAdmin && m.status === 'available' && <button className="btn primary sm" disabled={busy} onClick={() => act(m.name, 'install', {}, th ? 'ติดตั้งแล้ว' : 'Installed')}>{th ? 'ติดตั้ง' : 'Install'}</button>}
              {isAdmin && m.upgradeTo && <button className="btn primary sm" disabled={busy} onClick={() => act(m.name, 'upgrade', {}, th ? 'อัปเวอร์ชันแล้ว' : 'Upgraded')}>{th ? `อัปเวอร์ชันเป็น ${m.upgradeTo}` : `Upgrade to ${m.upgradeTo}`}</button>}
              {isAdmin && m.status === 'active' && <button className="btn sm" disabled={busy} onClick={() => act(m.name, 'disable', {}, th ? 'ปิดใช้งานแล้ว' : 'Disabled')}>{th ? 'ปิดใช้งาน' : 'Disable'}</button>}
              {isAdmin && (m.status === 'disabled' || m.status === 'blocked') && <button className="btn sm" disabled={busy} onClick={() => act(m.name, 'enable', {}, th ? 'เปิดใช้งานแล้ว' : 'Enabled')}>{th ? 'เปิดใช้งาน' : 'Enable'}</button>}
              {isAdmin && m.installedVersion && <button className="btn sm" disabled={busy} onClick={() => exportModule(m, send, get, th)}>{th ? 'ส่งออก' : 'Export'}</button>}
              {isAdmin && m.installedVersion && <button className="btn danger sm" disabled={busy} onClick={() => uninstall(m)}>{th ? 'ถอด' : 'Uninstall'}</button>}
            </div>
            {m.description && <div className="muted" style={{ marginTop: 6 }}>{m.description}</div>}
            <div className="small muted" style={{ marginTop: 6 }}>
              {m.dependsOn.length > 0 ? `${th ? 'ต้องพึ่งพา' : 'Needs'}: ${m.dependsOn.map(d => `${d.name} ${d.version || ''}`).join(', ')}` : (th ? 'ไม่ต้องพึ่งพาโมดูลอื่น' : 'No dependencies')}
              {' · '}{th ? 'เอกสาร' : 'Documents'}: {m.entities.map(e => tr(e.label, lang)).join(', ') || '–'}
            </div>
            {msg && msg.name === m.name && <pre className="notice bad" style={{ whiteSpace: 'pre-wrap', marginTop: 10 }} role="alert">{msg.text}</pre>}
          </div>
        )
      })}
    </div>
  )
}

function exportModule(m, send, get, th) {
  const r = get(`/api/modules/${m.name}/export`, { includeData: 'true' })
  if (!r.ok) { toast(r.error, 'err'); return }
  downloadFile(`${m.name}-${m.installedVersion}.sjpmodule.json`, JSON.stringify(r.data, null, 1), 'application/json')
  toast(th ? 'ส่งออกแพ็กเกจแล้ว' : 'Exported')
  void send
}

function ImportPane({ lang }) {
  const { send, isAdmin } = usePlatform()
  const [text, setText] = useState('')
  const [withData, setWithData] = useState(true)
  const [err, setErr] = useState('')
  const [busy, run] = useSubmit()
  const th = lang !== 'en'
  const onFile = async e => { const f = e.target.files[0]; if (f) setText(await f.text()) }
  const doImport = () => run(async () => {
    const res = send('POST', '/api/modules/import', { package: text, includeData: withData })
    if (res.ok) { setErr(''); setText(''); toast(th ? `นำเข้าโมดูล ${res.data.name} แล้ว (${res.data.action})` : 'Imported') } else setErr(res.error)
    return res
  })
  return (
    <div className="card">
      <h3>{th ? 'นำเข้าแพ็กเกจโมดูล' : 'Import a module package'}</h3>
      <p className="muted">{th ? 'เลือกไฟล์ .sjpmodule.json ที่ส่งออกจากบริษัทอื่น ระบบจะตรวจความถูกต้อง โมดูลที่ต้องพึ่งพา แล้วติดตั้งให้บริษัทที่เลือกอยู่ด้านบน' : 'Choose a package exported from another company.'}</p>
      <div className="field"><input type="file" accept=".json,application/json" onChange={onFile} aria-label="package file" /></div>
      <div className="field" style={{ marginTop: 10 }}><textarea rows={6} value={text} onChange={e => setText(e.target.value)} placeholder={th ? 'หรือวางเนื้อหาแพ็กเกจ JSON ที่นี่' : 'or paste package JSON here'} aria-label="package json" /></div>
      <label className="check" style={{ marginTop: 8 }}><input type="checkbox" checked={withData} onChange={e => setWithData(e.target.checked)} /> {th ? 'นำเข้าข้อมูลที่แนบมาในแพ็กเกจด้วย' : 'Include data in the package'}</label>
      {err && <pre className="notice bad" style={{ whiteSpace: 'pre-wrap', marginTop: 10 }} role="alert">{err}</pre>}
      <div className="row" style={{ marginTop: 12 }}><button className="btn primary" disabled={!isAdmin || busy || !text.trim()} onClick={doImport}>{th ? 'นำเข้าและติดตั้ง' : 'Import & install'}</button></div>
    </div>
  )
}

function Members({ lang }) {
  const { s, get, send, company } = usePlatform()
  const th = lang !== 'en'
  const mem = get('/api/members')
  if (!mem.ok) return <ErrorBox error={mem.error} />
  const roleList = Object.values(s.platform.installed[company] || {}).filter(r => r.enabled).flatMap(r => (r.manifest.roles || []).map(x => ({ id: `${r.name}.${x.key}`, label: x.label })))
  const roleOf = uid => mem.data.find(x => x.user === uid)?.roles || []
  const toggle = (u, role) => {
    const cur = roleOf(u.id)
    const next = cur.includes(role) ? cur.filter(x => x !== role) : [...cur, role]
    const res = send('PUT', `/api/members/${u.id}`, { roles: next, name: u.name })
    if (!res.ok) toast(res.error, 'err')
  }
  return (
    <div className="card">
      <h3>{th ? 'สมาชิกของบริษัทและบทบาท' : 'Company members & roles'}</h3>
      <p className="muted">{th ? 'ผู้ใช้ต้องได้รับบทบาทอย่างน้อยหนึ่งบทบาทจึงจะเห็นเมนูและข้อมูลของโมดูล (ผู้ดูแลระบบหลักเห็นทุกบริษัทเสมอ)' : 'A user needs at least one role to see module data.'}</p>
      <div className="table-wrap"><table className="tbl"><thead><tr><th>{th ? 'ผู้ใช้' : 'User'}</th><th>{th ? 'บทบาท' : 'Roles'}</th></tr></thead><tbody>
        {s.users.filter(u => u.active !== false).map(u => (
          <tr key={u.id}><td>{u.name} <span className="muted small">({u.username})</span></td>
            <td><div className="row">{[{ id: 'admin', label: { th: 'ผู้ดูแลบริษัท', en: 'Company admin' } }, ...roleList].map(rl => <label key={rl.id} className="check"><input type="checkbox" checked={roleOf(u.id).includes(rl.id)} onChange={() => toggle(u, rl.id)} /> {tr(rl.label, lang)}</label>)}</div></td></tr>
        ))}
      </tbody></table></div>
    </div>
  )
}

function Events({ lang }) {
  const { get } = usePlatform()
  const r = get('/api/events')
  const th = lang !== 'en'
  if (!r.ok) return <ErrorBox error={r.error} />
  return (
    <div className="card">
      <h3>{th ? 'เหตุการณ์ระหว่างโมดูล (Event bus)' : 'Event bus'}</h3>
      <p className="muted">{th ? 'โมดูลไม่เรียกกันตรงๆ — ส่งเหตุการณ์ แล้วโมดูลที่สมัครรับเหตุการณ์ไว้จะทำงานต่อเอง' : 'Modules never call each other; they publish events.'}</p>
      <div className="table-wrap"><table className="tbl"><thead><tr><th>{th ? 'เวลา' : 'Time'}</th><th>{th ? 'เหตุการณ์' : 'Event'}</th><th>{th ? 'ผู้รับ' : 'Handled by'}</th></tr></thead><tbody>
        {r.data.filter(e => !e.event.startsWith('platform.') || e.deliveries.length).slice(0, 80).map(e => (
          <tr key={e.id}><td>{fmtDateTime(e.at)}</td><td><code>{e.event}</code></td>
            <td>{e.deliveries.length ? e.deliveries.map((d, i) => <div key={i}>{d.ok ? '✔' : '✖'} {d.module}{d.produced?.length ? ` → ${d.produced.join(', ')}` : ''}{d.error ? ` — ${d.error}` : ''}</div>) : <span className="muted">{th ? 'ไม่มีผู้รับ' : 'no subscribers'}</span>}</td></tr>
        ))}
      </tbody></table></div>
    </div>
  )
}

function AuditPane({ lang }) {
  const { get } = usePlatform()
  const r = get('/api/audit', { limit: 150 })
  const th = lang !== 'en'
  if (!r.ok) return <ErrorBox error={r.error} />
  return (
    <div className="card">
      <h3>{th ? 'Audit log — ใครแก้อะไรเมื่อไร' : 'Audit log'}</h3>
      <div className="table-wrap"><table className="tbl"><thead><tr><th>{th ? 'เมื่อ' : 'When'}</th><th>{th ? 'ผู้ทำ' : 'Who'}</th><th>{th ? 'สิ่งที่ทำ' : 'What'}</th></tr></thead><tbody>
        {r.data.map(a => <tr key={a.id}><td>{fmtDateTime(a.at)}</td><td>{a.userName}</td><td>{tr(a.summary, lang)}{a.changes?.length > 0 && <div className="small muted">{a.changes.map(c => `${tr(c.label, lang)}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`).join(' · ')}</div>}</td></tr>)}
      </tbody></table></div>
    </div>
  )
}

function Companies({ lang }) {
  const { get, send, isAdmin, company, setCompany } = usePlatform()
  const [name, setName] = useState('')
  const th = lang !== 'en'
  const r = get('/api/companies')
  const add = () => {
    const res = send('POST', '/api/companies', { name })
    if (res.ok) { setName(''); setCompany(res.data.id); toast(th ? 'เพิ่มบริษัทแล้ว — ติดตั้งโมดูลให้บริษัทนี้ในแท็บ “โมดูล”' : 'Company added') } else toast(res.error, 'err')
  }
  return (
    <div className="card">
      <h3>{th ? 'บริษัท (หลายบริษัทในระบบเดียว ข้อมูลแยกกัน)' : 'Companies'}</h3>
      <ul className="plain">{(r.ok ? r.data : []).map(c => <li key={c.id}>{c.name} {c.id === company ? <Badge color="green">{th ? 'กำลังใช้งาน' : 'current'}</Badge> : <button className="btn ghost sm" onClick={() => setCompany(c.id)}>{th ? 'สลับไปบริษัทนี้' : 'Switch'}</button>}</li>)}</ul>
      {isAdmin && <div className="row" style={{ marginTop: 10 }}><input value={name} onChange={e => setName(e.target.value)} placeholder={th ? 'ชื่อบริษัทใหม่' : 'New company name'} aria-label="company name" /><button className="btn primary" disabled={!name.trim()} onClick={add}>{th ? 'เพิ่มบริษัท' : 'Add company'}</button></div>}
    </div>
  )
}

export default function PlatformHome() {
  const { lang, companies, company, isAdmin } = usePlatform()
  const [tab, setTab] = useState('modules')
  const th = lang !== 'en'
  const cname = companies.find(c => c.id === company)?.name
  const tabs = [['modules', th ? 'โมดูล' : 'Modules'], ['import', th ? 'นำเข้า' : 'Import'], ['members', th ? 'สมาชิก & สิทธิ์' : 'Members'], ['events', th ? 'เหตุการณ์' : 'Events'], ['audit', 'Audit log'], ['companies', th ? 'บริษัท' : 'Companies']]
  return (
    <Page title={th ? 'โมดูลและแพลตฟอร์ม' : 'Modules & platform'} icon="puzzle" subtitle={cname ? (th ? `บริษัท: ${cname}` : `Company: ${cname}`) : ''}
      actions={<><PlatBar />{isAdmin && <Link className="btn primary" to="/platform/builder">Module Builder</Link>}</>}>
      {!company ? <ErrorBox error={th ? 'ยังไม่มีบริษัทที่คุณเข้าถึงได้' : 'No company available'} /> : (
        <>
          <BuilderPromo />
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
          {tab === 'modules' && <Modules lang={lang} />}
          {tab === 'import' && <ImportPane lang={lang} />}
          {tab === 'members' && (isAdmin ? <Members lang={lang} /> : <div className="notice">{th ? 'เฉพาะผู้ดูแลระบบ' : 'Admins only'}</div>)}
          {tab === 'events' && (isAdmin ? <Events lang={lang} /> : <div className="notice">{th ? 'เฉพาะผู้ดูแลระบบ' : 'Admins only'}</div>)}
          {tab === 'audit' && (isAdmin ? <AuditPane lang={lang} /> : <div className="notice">{th ? 'เฉพาะผู้ดูแลระบบ (ดูประวัติรายเอกสารได้ในหน้าเอกสาร)' : 'Admins only'}</div>)}
          {tab === 'companies' && <Companies lang={lang} />}
        </>
      )}
    </Page>
  )
}
