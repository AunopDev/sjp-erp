import React, { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate, Link } from 'react-router-dom'
import { useApp, recPath, Badge } from './ui'
import Icon, { iconForPath } from './Icon'
import { act, getPersistError } from '../lib/store'
import * as db from '../lib/db'
import { PRESET_NAV, ENT } from '../lib/schema'
import { ymd } from '../lib/util'
import { apiGet, usePlatform } from '../platform/session'
import { tr } from '../platform/util'
import { escLevel } from '../pages/Tickets'

const DEFAULT_PINS = ['/', '/tickets', '/projects', '/platform/builder']
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch (e) { return d } }
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) { /* ignore */ } }

function useTheme() {
  const [theme, setTheme] = useState(() => load('sjp-theme', 'dark'))
  useEffect(() => { document.documentElement.dataset.theme = theme; save('sjp-theme', theme) }, [theme])
  return [theme, () => setTheme(theme === 'dark' ? 'light' : 'dark')]
}
export function ThemeInit() {
  useEffect(() => { document.documentElement.dataset.theme = load('sjp-theme', 'dark') }, [])
  return null
}

// menu of the metadata-driven modules, built from their definitions and filtered by what this user may see
function platformGroups(s, lang) {
  const out = []
  const r = apiGet('/api/meta/menu')
  if (r.ok) {
    for (const g of r.data) {
      out.push([tr(g.title, lang), g.items.map(i => [i.kind === 'report' ? `/p/${g.module}/r/${i.id.split('.')[1]}` : `/p/${i.id.replace('.', '/')}`, tr(i.label, lang), null])])
    }
  }
  const admin = !!db.roleOf(s)?.isAdmin
  out.push([lang === 'en' ? 'Module platform' : 'แพลตฟอร์มโมดูล', [...(admin ? [['/platform/builder', lang === 'en' ? 'Build your own module' : 'สร้างโมดูลเอง (Builder)', null]] : []), ['/platform', lang === 'en' ? 'Modules & platform' : 'โมดูลและแพลตฟอร์ม', null]]])
  return out
}

function buildNav(s, can, lang) {
  const hidden = s.config.nav?.hidden || []
  const custom = {}
  ;(s.config.modules || []).filter(m => m.active && can(m.key, 'view')).forEach(m => {
    const g = m.group || 'โมดูลของฉัน'
    ;(custom[g] = custom[g] || []).push(['/m/' + m.key.slice(2), m.name, null])
  })
  const base = PRESET_NAV.map(([g, items]) => [g, items.filter(i => !hidden.includes(i[0]))])
  const groups = [...base.slice(0, -1), ...Object.entries(custom), ...platformGroups(s, lang), base[base.length - 1]]
  return groups.map(([g, items]) => [g, items.filter(i => !i[2] || can(i[2], 'view'))]).filter(g => g[1].length)
}

// ---------- full menu ----------
function MenuOverlay({ groups, pins, togglePin, onClose, badge }) {
  useEffect(() => {
    const h = e => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="menu-panel" role="dialog" aria-label="เมนูทั้งหมด">
        <div className="menu-head"><b>เมนูทั้งหมด</b><span className="muted small">กดดาวเพื่อปักหมุดไว้ที่แถบด้านข้างและแถบล่าง</span><span className="grow" /><button className="icon-btn" onClick={onClose} aria-label="ปิด"><Icon name="close" /></button></div>
        <div className="menu-grid">
          {groups.map(([g, items]) => (
            <div key={g} className="menu-group">
              <h4>{g}</h4>
              {items.map(([to, l]) => (
                <div key={to} className="menu-item">
                  <NavLink to={to} end={to === '/'} onClick={onClose}><Icon name={iconForPath(to)} /><span>{l}</span>{badge[to] > 0 && <em className="dot-badge">{badge[to]}</em>}</NavLink>
                  <button className={'star' + (pins.includes(to) ? ' on' : '')} onClick={() => togglePin(to)} aria-label={pins.includes(to) ? 'ถอดหมุด ' + l : 'ปักหมุด ' + l} aria-pressed={pins.includes(to)}><Icon name="star" size={18} /></button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------- command palette (Ctrl K) ----------
function Palette({ s, groups, onClose }) {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const ents = ['tickets', 'projects', 'customers', 'vendors', 'sites', 'items', 'serials', 'purchaseOrders', ...(s.config.modules || []).map(m => m.key)]
  const index = useMemo(() => {
    const out = []
    groups.forEach(([g, items]) => items.forEach(([to, l]) => out.push({ kind: 'หน้า', label: l, sub: g, to, text: l + ' ' + g })))
    ents.forEach(e => {
      if (!ENT[e]) return
      db.rows(s, e).slice(0, 400).forEach(r => {
        const label = db.label(s, e, r.id)
        const extra = [r.symptom, r.point, r.serialNo, r.sku, r.model].filter(Boolean).join(' ')
        out.push({ kind: ENT[e].label, label, sub: r.code, to: recPath(e, r.id), text: [r.code, label, extra, e === 'tickets' ? db.label(s, 'sites', r.site) : ''].join(' ') })
      })
    })
    return out
  }, [s.data, groups])
  const ql = q.trim().toLowerCase()
  const results = (ql ? index.filter(x => x.text.toLowerCase().includes(ql)) : index.filter(x => x.kind === 'หน้า')).slice(0, 40)
  useEffect(() => setIdx(0), [q])
  const go = r => { if (r) { nav(r.to); onClose() } }
  const key = e => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(results.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') go(results[idx])
  }
  return (
    <div className="overlay palette-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label="ค้นหา">
        <div className="palette-input"><Icon name="search" /><input autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={key} placeholder="ค้นหารหัสเอกสาร ชื่อ Serial ไซต์ ลูกค้า หรือชื่อหน้า…" aria-label="ค้นหา" /><kbd>Esc</kbd></div>
        <div className="palette-list">
          {results.length === 0 ? <div className="state">ไม่พบรายการที่ตรงกับ “{q}”</div> : results.map((r, i) => (
            <button key={r.to + r.label + i} className={'palette-row' + (i === idx ? ' on' : '')} onMouseEnter={() => setIdx(i)} onClick={() => go(r)}>
              <span className="pk">{r.kind}</span><span className="pl">{r.label}</span><span className="muted small">{r.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------- bell ----------
function Bell({ s, user }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const items = []
  s.approvals.filter(a => a.status === 'pending' && db.isApprover(s, a.cfg) && a.by !== user.id).forEach(a => items.push({ id: a.id, to: '/my', text: 'รออนุมัติ: ' + a.title, tone: 'amber' }))
  db.rows(s, 'tickets').filter(t => db.isOpenTicket(s, t) && escLevel(s, db.ticketMetrics(t).ageH) > 0).forEach(t => items.push({ id: t.id, to: '/tickets/' + t.id, text: `เคสค้างเกินเกณฑ์: ${t.code} ${t.title}`, tone: 'red' }))
  db.rows(s, 'pmRecords').filter(r => r.status !== 'เสร็จ' && r.assignee === user.id && r.dueDate < ymd(new Date())).forEach(r => items.push({ id: r.id, to: '/pm/records/' + r.id, text: `งาน PM เกินกำหนด: ${r.code}`, tone: 'red' }))
  db.rows(s, 'tickets').filter(t => t.assignee === user.id && db.isOpenTicket(s, t)).forEach(t => items.push({ id: 'm' + t.id, to: '/tickets/' + t.id, text: `เคสของฉัน: ${t.code} ${t.title}`, tone: 'blue' }))
  return (
    <div className="pop-wrap" ref={ref}>
      <button className="icon-btn bell" onClick={() => setOpen(!open)} aria-label={`การแจ้งเตือน ${items.length} รายการ`} aria-expanded={open}>
        <Icon name="bell" />{items.length > 0 && <span className="bell-badge">{items.length > 99 ? '99+' : items.length}</span>}
      </button>
      {open && (
        <div className="popover right">
          <div className="pop-title">การแจ้งเตือน</div>
          {items.length === 0 ? <div className="state small">ไม่มีเรื่องที่ต้องดำเนินการ</div> : items.slice(0, 12).map(i => <Link key={i.id} to={i.to} className="pop-row" onClick={() => setOpen(false)}><Badge color={i.tone}>{i.tone === 'red' ? 'เร่ง' : i.tone === 'amber' ? 'อนุมัติ' : 'งาน'}</Badge> {i.text}</Link>)}
        </div>
      )}
    </div>
  )
}

function QuickCreate({ s, can }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const items = [
    can('tickets', 'create') && ['เปิดเคสใหม่ (แจ้งซ่อม)', '/tickets/new', 'ticket'],
    can('projects', 'create') && ['สร้างโครงการ', '/projects?new=1', 'folder'],
    can('purchase', 'create') && ['สร้างใบสั่งซื้อ', '/purchaseOrders?new=1', 'receipt'],
    can('warehouse', 'create') && ['เบิก / รับสินค้า', '/warehouse?tab=issue', 'box'],
    can('master', 'create') && ['เพิ่มลูกค้า', '/customers?new=1', 'building'],
    can('master', 'create') && ['เพิ่มไซต์งาน', '/sites?new=1', 'pin'],
    can('assets', 'create') && ['เพิ่มสินค้า/อุปกรณ์', '/items?new=1', 'chip'],
    db.roleOf(s)?.isAdmin && ['สร้างโมดูลใหม่ (Builder)', '/platform/builder', 'puzzle'],
    ...(s.config.modules || []).filter(m => m.active && can(m.key, 'create')).map(m => ['เพิ่ม: ' + m.name, '/m/' + m.key.slice(2) + '?new=1', 'puzzle'])
  ].filter(Boolean)
  if (!items.length) return null
  return (
    <div className="pop-wrap" ref={ref}>
      <button className="btn primary create-btn" onClick={() => setOpen(!open)} aria-expanded={open}><Icon name="plus" size={18} /> <span className="create-label">สร้าง</span></button>
      {open && (
        <div className="popover right">
          <div className="pop-title">สร้างรายการใหม่</div>
          {items.map(([l, to, ic]) => <Link key={to} to={to} className="pop-row" onClick={() => setOpen(false)}><Icon name={ic} size={18} /> {l}</Link>)}
        </div>
      )}
    </div>
  )
}

function UserMenu({ s, user, theme, toggleTheme }) {
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const ref = useRef()
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div className="pop-wrap" ref={ref}>
      <button className="user-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="avatar">{(user.name || '?').trim().charAt(0)}</span><span className="user-name">{user.name}</span>
      </button>
      {open && (
        <div className="popover right">
          <div className="pop-title">{user.name}<div className="muted small" style={{ fontWeight: 400 }}>{db.roleOf(s)?.name} · {user.username}</div></div>
          <button className="pop-row" onClick={toggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /> {theme === 'dark' ? 'ใช้โหมดสว่าง' : 'ใช้โหมดมืด'}</button>
          <button className="pop-row" onClick={() => { act(st => db.logout(st)); nav('/') }}><Icon name="logout" /> ออกจากระบบ</button>
        </div>
      )}
    </div>
  )
}

export default function Shell({ children }) {
  const { s, user, can } = useApp()
  const loc = useLocation()
  const [theme, toggleTheme] = useTheme()
  const [menu, setMenu] = useState(false)
  const [pal, setPal] = useState(false)
  const [collapsed, setCollapsed] = useState(() => load('sjp-sidebar-collapsed', false))
  const [pins, setPins] = useState(() => load('sjp-pins', DEFAULT_PINS))
  const { lang: plang, company: pcompany } = usePlatform()
  const groups = useMemo(() => buildNav(s, can, plang), [s.config, s.platform, user.id, plang, pcompany])
  const allPaths = groups.flatMap(g => g[1].map(i => i[0]))
  const pinned = pins.filter(p => allPaths.includes(p))
  const label = p => groups.flatMap(g => g[1]).find(i => i[0] === p)?.[1] || p
  const togglePin = p => { const n = pins.includes(p) ? pins.filter(x => x !== p) : [...pins, p]; setPins(n); save('sjp-pins', n) }
  useEffect(() => { setMenu(false); window.scrollTo(0, 0) }, [loc.pathname])
  useEffect(() => {
    const h = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPal(p => !p) } }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])
  const pending = s.approvals.filter(a => a.status === 'pending' && db.isApprover(s, a.cfg) && a.by !== user.id).length
  const tickets = db.rows(s, 'tickets')
  const mine = tickets.filter(t => t.assignee === user.id && db.isOpenTicket(s, t)).length
  const openTk = tickets.filter(t => db.isOpenTicket(s, t)).length
  const badge = { '/my': pending + mine, '/tickets': openTk }
  // current location in the menu tree
  const match = groups.flatMap(g => g[1].map(i => ({ g: g[0], to: i[0], l: i[1] }))).filter(x => (x.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(x.to))).sort((a, b) => b.to.length - a.to.length)[0]
  const perr = getPersistError()
  const bottom = pinned.slice(0, 4)
  return (
    <div className="app">
      <aside className={'rail' + (collapsed ? ' collapsed' : '')} aria-label="เมนูหลัก">
        <NavLink className="rail-logo" to="/" aria-label="หน้าแรก">
          <b>SJP</b>
          <span className="rail-brand-text"><strong>ERP</strong><small>ระบบงานบริษัท</small></span>
        </NavLink>
        <nav className="rail-nav">
          {groups.map(([g, items]) => (
            <div className="rail-group" key={g}>
              <h4>{g}</h4>
              {items.map(([to, l]) => (
                <NavLink key={to} to={to} end={to === '/'} title={l} className={({ isActive }) => 'rail-link' + (isActive ? ' active' : '')}>
                  <span className="rail-ic"><Icon name={iconForPath(to)} size={19} /></span>
                  <span className="rail-label">{l}</span>
                  {badge[to] > 0 && <em className="rail-badge">{badge[to]}</em>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="rail-foot">
          <button className="rail-foot-btn" onClick={toggleTheme}>
            <span className="rail-ic"><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={19} /></span>
            <span>{theme === 'dark' ? 'โหมดสว่าง' : 'โหมดมืด'}</span>
          </button>
        </div>
      </aside>
      <div className="main2">
        <header className="top">
          <button className="icon-btn sidebar-toggle" onClick={() => { const n = !collapsed; setCollapsed(n); save('sjp-sidebar-collapsed', n) }} title={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'} aria-label="ย่อ/ขยายเมนู"><Icon name="columns" size={20} /></button>
          <button className="menu-chip" onClick={() => setMenu(true)}><Icon name="grid" size={18} /> เมนู</button>
          <div className="crumbs">
            <span className="muted">{match?.g || 'SJP ERP'}</span><Icon name="chevron" size={16} className="muted" />
            <b>{match?.l || 'หน้า'}</b>
            {match && <button className={'star' + (pins.includes(match.to) ? ' on' : '')} onClick={() => togglePin(match.to)} aria-label="ปักหมุดหน้านี้" aria-pressed={pins.includes(match.to)}><Icon name="star" size={18} /></button>}
          </div>
          <span className="grow" />
          <button className="search-box" onClick={() => setPal(true)} aria-label="ค้นหา"><Icon name="search" size={18} /><span>ค้นหา รหัส · Serial · ไซต์ · ชื่อ…</span><kbd>Ctrl K</kbd></button>
          <QuickCreate s={s} can={can} />
          <Bell s={s} user={user} />
          <UserMenu s={s} user={user} theme={theme} toggleTheme={toggleTheme} />
        </header>
        {perr && <div className="notice bad" style={{ margin: 10 }}>{perr}</div>}
        <main className="content">{children}</main>
        <nav className="bottombar" aria-label="ทางลัดด้านล่าง">
          {bottom.map(p => (
            <NavLink key={p} to={p} end={p === '/'} className={({ isActive }) => 'bb-item' + (isActive ? ' active' : '')}>
              <span className="bb-ic"><Icon name={iconForPath(p)} size={24} />{badge[p] > 0 && <em className="dot-badge">{badge[p]}</em>}</span><span>{label(p)}</span>
            </NavLink>
          ))}
          <button className="bb-item" onClick={() => setMenu(true)}><span className="bb-ic"><Icon name="grid" size={24} /></span><span>เมนู</span></button>
        </nav>
      </div>
      {menu && <MenuOverlay groups={groups} pins={pins} togglePin={togglePin} onClose={() => setMenu(false)} badge={badge} />}
      {pal && <Palette s={s} groups={groups} onClose={() => setPal(false)} />}
    </div>
  )
}
