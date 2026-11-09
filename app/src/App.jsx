import React, { useState, useEffect } from 'react'
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate, Link } from 'react-router-dom'
import { useApp, Hosts, Page, ErrorBox, toast, useSubmit } from './components/ui'
import { act, getPersistError } from './lib/store'
import * as db from './lib/db'
import Shell, { ThemeInit } from './components/Shell'
import Dashboard from './pages/Dashboard'
import MyWork from './pages/MyWork'
import { EntityList, EntityDetail } from './pages/Entity'
import Projects, { ProjectDetail } from './pages/Projects'
import Tickets, { TicketDetail, TicketNew } from './pages/Tickets'
import Purchase, { PoDetail } from './pages/Purchase'
import Warehouse from './pages/Warehouse'
import CalendarPage from './pages/Calendar'
import Pm, { PmRecordPage } from './pages/Pm'
import Reports from './pages/Reports'
import Review from './pages/Review'
import Settings from './pages/Settings'
import ModulePage, { ModuleDetail } from './pages/Module'
import PlatformHome from './pages/platform/PlatformHome'
import PlatformBuilder from './pages/platform/PlatformBuilder'
import { PlatformList, PlatformRecord, PlatformReport } from './pages/platform/PlatformEntity'

class Boundary extends React.Component {
  state = { err: null }
  static getDerivedStateFromError(err) { return { err } }
  componentDidUpdate(prev) { if (prev.k !== this.props.k && this.state.err) this.setState({ err: null }) }
  render() { return this.state.err ? <Page title="เกิดข้อผิดพลาด"><ErrorBox error={this.state.err.message} /></Page> : this.props.children }
}


function Login() {
  const { s } = useApp()
  const firstRun = s.users.length === 0
  const [name, setName] = useState('')
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [confirmP, setConfirmP] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [busy, run] = useSubmit()
  const submit = async e => {
    e.preventDefault()
    setErr('')
    if (firstRun && p !== confirmP) {
      setErr('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน')
      return
    }
    const r = await run(() => act(st => firstRun
      ? db.setupAdmin(st, { username: u, name, password: p })
      : db.login(st, u, p)))
    if (r && !r.ok && r.error !== 'busy') setErr(r.error)
  }
  return (
    <div className="login-wrap">
      <div className="login-bg2" aria-hidden="true"><i /><i /><i /></div>
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo"><b>SJP</b></div>
        <h1>SJP ERP</h1>
        <div className="login-sub">เอส เจ พี อินฟอร์เมชั่นซิสเต็ม จำกัด</div>
        <div className="login-note">{firstRun ? 'เริ่มต้นด้วยฐานข้อมูลว่าง — สร้างผู้ดูแลระบบคนแรกเพื่อเริ่มใช้งาน' : 'เข้าสู่ระบบเพื่อจัดการข้อมูลของบริษัท'}</div>
        {firstRun && <div className="field"><label htmlFor="ln">ชื่อผู้ดูแลระบบ</label><input id="ln" value={name} onChange={e => setName(e.target.value)} autoComplete="name" autoFocus /></div>}
        <div className="field" style={{ marginTop: firstRun ? 12 : 0 }}><label htmlFor="lu">ชื่อผู้ใช้</label><input id="lu" value={u} onChange={e => setU(e.target.value)} autoComplete="username" autoFocus={!firstRun} /></div>
        <div className="field" style={{ marginTop: 12 }}><label htmlFor="lp">รหัสผ่าน</label>
          <div className="pw-wrap"><input id="lp" type={show ? 'text' : 'password'} value={p} onChange={e => setP(e.target.value)} autoComplete="current-password" /><button type="button" onClick={() => setShow(!show)} aria-label={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}>{show ? 'ซ่อน' : 'แสดง'}</button></div></div>
        {firstRun && <div className="field" style={{ marginTop: 12 }}><label htmlFor="lcp">ยืนยันรหัสผ่าน</label><input id="lcp" type={show ? 'text' : 'password'} value={confirmP} onChange={e => setConfirmP(e.target.value)} autoComplete="new-password" /></div>}
        {err && <div className="err" style={{ marginTop: 8 }} role="alert">{err}</div>}
        <button className="btn primary" disabled={busy || !u || !p || (firstRun && (!name || !confirmP))}>{busy ? 'กำลังดำเนินการ…' : firstRun ? 'สร้างผู้ดูแลและเริ่มใช้งาน' : 'เข้าสู่ระบบ'}</button>
        <div className="small muted" style={{ marginTop: 14, textAlign: 'center' }}>{firstRun ? 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' : 'ลืมรหัสผ่าน? ติดต่อผู้ดูแลระบบของบริษัท'}</div>
      </form>
      <div className="login-foot">© 2026 SJP Information System Co., Ltd. · SJP ERP</div>
    </div>
  )
}

function AppRoutes() {
  const loc = useLocation()
  return (
    <Boundary k={loc.pathname}>
      <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/my" element={<MyWork />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/tickets" element={<Tickets />} />
              <Route path="/tickets/new" element={<TicketNew />} />
              <Route path="/tickets/:id" element={<TicketDetail />} />
              <Route path="/purchaseOrders" element={<Purchase />} />
              <Route path="/purchaseOrders/:id" element={<PoDetail />} />
              <Route path="/warehouse" element={<Warehouse />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/pm" element={<Pm />} />
              <Route path="/pm/records/:id" element={<PmRecordPage />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/review" element={<Review />} />
              <Route path="/settings/*" element={<Settings />} />
              <Route path="/platform" element={<PlatformHome />} />
              <Route path="/platform/builder" element={<PlatformBuilder />} />
              <Route path="/p/:module/r/:key" element={<PlatformReport />} />
              <Route path="/p/:module/:entity" element={<PlatformList />} />
              <Route path="/p/:module/:entity/:id" element={<PlatformRecord />} />
              <Route path="/m/:key" element={<ModulePage />} />
              <Route path="/m/:key/:id" element={<ModuleDetail />} />
              {['customers', 'vendors', 'contacts', 'sites', 'items', 'serials'].map(e => <Route key={e} path={'/' + e} element={<EntityList entity={e} />} />)}
              {['customers', 'vendors', 'contacts', 'sites', 'items', 'serials'].map(e => <Route key={e + 'd'} path={'/' + e + '/:id'} element={<EntityDetail entity={e} />} />)}
              <Route path="*" element={<Page title="ไม่พบหน้านี้"><div className="state">ไม่พบหน้าที่ต้องการ <Link to="/">กลับหน้าแรก</Link></div></Page>} />
            </Routes>
    </Boundary>
  )
}

export default function App() {
  const { user } = useApp()
  return (
    <>
      {user ? <Shell><AppRoutes /></Shell> : <Login />}
      <Hosts />
      <ThemeInit />
    </>
  )
}
void Navigate; void toast
