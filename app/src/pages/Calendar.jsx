import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp, Page, Empty } from '../components/ui'
import * as db from '../lib/db'
import { ymd, fmtDate } from '../lib/util'

const TYPES = [['ticket', 'นัดหมายช่าง'], ['pm', 'งาน PM'], ['project', 'ขั้นตอนโครงการ'], ['po', 'กำหนดส่งของ (PO)']]

export default function CalendarPage() {
  const { s, user } = useApp()
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [on, setOn] = useState({ ticket: true, pm: true, project: true, po: true })
  const [mine, setMine] = useState(false)
  const events = useMemo(() => {
    const ev = []
    db.rows(s, 'tickets').forEach(t => (t.appointments || []).filter(a => a.status === 'นัดหมาย').forEach(a =>
      ev.push({ type: 'ticket', date: a.date, label: `${a.time || ''} ${t.title}`, to: '/tickets/' + t.id, who: a.tech })))
    db.rows(s, 'pmRecords').filter(r => r.status !== 'เสร็จ').forEach(r => ev.push({ type: 'pm', date: r.dueDate, label: `PM ${db.label(s, 'sites', r.site)}`, to: '/pm/records/' + r.id, who: r.assignee }))
    db.rows(s, 'projects').filter(p => !p.closed).forEach(p => db.stepsOf(s, p).forEach(({ cfg, st }) => {
      if (st.plannedDate && !['done', 'skipped'].includes(st.status)) ev.push({ type: 'project', date: st.plannedDate, label: `${p.code} ${cfg.label.replace(/^\d+\.\s*/, '')}`, to: '/projects/' + p.id, who: st.owner || p.manager })
      if (cfg.key === 'design' && st.values?.planStart && st.status !== 'done') ev.push({ type: 'project', date: st.values.planStart, label: `${p.code} เริ่มติดตั้ง`, to: '/projects/' + p.id, who: p.manager })
    }))
    db.rows(s, 'purchaseOrders').filter(o => o.dueDate && !['closed', 'received', 'cancelled'].includes(o.status)).forEach(o => ev.push({ type: 'po', date: o.dueDate, label: `${o.code} ส่งของ`, to: '/purchaseOrders/' + o.id, who: null }))
    return ev
  }, [s])
  const shown = events.filter(e => on[e.type] && (!mine || e.who === user.id))
  const byDay = {}
  shown.forEach(e => { (byDay[e.date] = byDay[e.date] || []).push(e) })
  const y = cursor.getFullYear(), m = cursor.getMonth()
  const first = new Date(y, m, 1)
  const start = new Date(y, m, 1 - first.getDay())
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  const today = ymd(new Date())
  const upcoming = shown.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12)
  return (
    <Page title="ปฏิทินงาน" subtitle="งานติดตั้ง นัดหมายช่าง งาน PM และกำหนดส่งของ">
      <div className="card row">
        <button className="btn" onClick={() => setCursor(new Date(y, m - 1, 1))}>‹</button>
        <b style={{ minWidth: 150, textAlign: 'center' }}>{cursor.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}</b>
        <button className="btn" onClick={() => setCursor(new Date(y, m + 1, 1))}>›</button>
        <button className="btn" onClick={() => { const d = new Date(); d.setDate(1); setCursor(d) }}>วันนี้</button>
        <span className="grow" />
        {TYPES.map(([k, l]) => <label key={k} className="check small"><input type="checkbox" checked={on[k]} onChange={e => setOn({ ...on, [k]: e.target.checked })} /> {l}</label>)}
        <label className="check small"><input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} /> เฉพาะงานของฉัน</label>
      </div>
      <div className="cal" role="grid" aria-label="ปฏิทิน">
        {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(d => <div key={d} className="dow">{d}</div>)}
        {days.map(d => {
          const k = ymd(d)
          const list = byDay[k] || []
          return (
            <div key={k} className={'day' + (d.getMonth() !== m ? ' other' : '') + (k === today ? ' today' : '')}>
              <div className="small">{d.getDate()}</div>
              {list.slice(0, 3).map((e, i) => <Link key={i} to={e.to} className={'ev t-' + e.type} title={e.label}>{e.label}</Link>)}
              {list.length > 3 && <div className="small muted">+{list.length - 3} งาน</div>}
            </div>
          )
        })}
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>งานที่กำลังจะถึง</h3>
        {upcoming.length === 0 ? <Empty text="ไม่มีงานที่กำหนดไว้" /> : upcoming.map((e, i) => <div key={i} style={{ padding: '3px 0' }}>{fmtDate(e.date)} · <span className={'badge'}>{TYPES.find(t => t[0] === e.type)[1]}</span> <Link to={e.to}>{e.label}</Link> {e.who && <span className="muted small">· {db.label(s, 'users', e.who)}</span>}</div>)}
      </div>
    </Page>
  )
}
