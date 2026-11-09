import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp, Page, Badge, Empty, useSubmit, toast, askConfirm, recPath } from '../components/ui'
import { act } from '../lib/store'
import * as db from '../lib/db'
import { fmtDateTime, fmtDuration, ymd } from '../lib/util'
import { escLevel } from './Tickets'

export default function MyWork() {
  const { s, user } = useApp()
  const [busy, run] = useSubmit()
  const myTickets = db.rows(s, 'tickets').filter(t => t.assignee === user.id && db.isOpenTicket(s, t))
  const myPm = db.rows(s, 'pmRecords').filter(r => r.assignee === user.id && r.status !== 'เสร็จ')
  const myProjects = db.rows(s, 'projects').filter(p => p.manager === user.id && !p.closed)
  const myPoSteps = myProjects.map(p => ({ p, cur: db.currentStep(s, p) })).filter(x => x.cur)
  const approvals = s.approvals.filter(a => a.status === 'pending' && db.isApprover(s, a.cfg))
  const mineRequested = s.approvals.filter(a => a.by === user.id).slice(-5).reverse()
  const alerts = db.rows(s, 'tickets').filter(t => db.isOpenTicket(s, t) && escLevel(s, db.ticketMetrics(t).ageH) > 0)
  const decide = async (a, ok) => {
    let note = ''
    if (!ok) { const r = await askConfirm({ title: 'ไม่อนุมัติ', message: a.title, reasonLabel: 'เหตุผล', danger: true, confirmText: 'ไม่อนุมัติ' }); if (!r.ok) return; note = r.reason }
    run(() => act(st => db.decideApproval(st, a.id, ok, note)), ok ? 'อนุมัติแล้ว' : 'บันทึกการไม่อนุมัติแล้ว')
  }
  const link = a => recPath(a.entity, a.recId)
  return (
    <Page title="งานของฉัน" subtitle={user.name}>
      <div className="card">
        <h2>รออนุมัติ ({approvals.length})</h2>
        {approvals.length === 0 ? <Empty text="ไม่มีรายการรออนุมัติ — ผู้อนุมัติยังไม่ถูกตั้งค่า (รอยืนยันจากผู้ใช้) หรือไม่มีคำขอ" /> : approvals.map(a => (
          <div key={a.id} className="row" style={{ padding: '6px 0', borderBottom: '1px dashed #e6ecf2' }}>
            <Link to={link(a)}>{a.title}</Link><span className="muted small">ขอโดย {db.label(s, 'users', a.by)} · {fmtDateTime(a.at)}</span><span className="grow" />
            <button className="btn sm primary" disabled={busy || a.by === user.id && !db.roleOf(s)?.isAdmin} onClick={() => decide(a, true)}>อนุมัติ</button>
            <button className="btn sm" disabled={busy} onClick={() => decide(a, false)}>ไม่อนุมัติ</button>
          </div>
        ))}
        {mineRequested.length > 0 && <div className="small muted" style={{ marginTop: 8 }}>คำขอของฉัน: {mineRequested.map(a => `${a.title} (${{ pending: 'รออนุมัติ', approved: 'อนุมัติ', rejected: 'ไม่อนุมัติ' }[a.status]})`).join(' · ')}</div>}
      </div>
      {alerts.length > 0 && (
        <div className="card"><h2>แจ้งเตือนเคสค้างตามเกณฑ์ที่ยืนยันแล้ว ({alerts.length})</h2>
          {alerts.map(t => <div key={t.id}><Link to={'/tickets/' + t.id}>{t.code}</Link> {t.title} · อายุ {fmtDuration(db.ticketMetrics(t).ageH)}</div>)}</div>
      )}
      <div className="grid c2">
        <div className="card"><h2>Ticket ที่รับผิดชอบ ({myTickets.length})</h2>
          {myTickets.length === 0 ? <Empty text="ไม่มีเคสค้างที่มอบหมายให้คุณ" /> : myTickets.map(t => (
            <div key={t.id} style={{ padding: '4px 0' }}><Link to={'/tickets/' + t.id}>{t.code}</Link> {t.title} <Badge color={db.ticketStatusOf(s, t.status)?.color}>{db.ticketStatusOf(s, t.status)?.label}</Badge> <span className="muted small">{fmtDuration(db.ticketMetrics(t).ageH)}</span></div>
          ))}
        </div>
        <div className="card"><h2>งาน PM ที่ต้องทำ ({myPm.length})</h2>
          {myPm.length === 0 ? <Empty text="ไม่มีงาน PM ค้าง" /> : myPm.map(r => <div key={r.id} style={{ padding: '4px 0' }}><Link to={'/pm/records/' + r.id}>{r.code}</Link> {db.label(s, 'sites', r.site)} · กำหนด {r.dueDate} {r.dueDate < ymd(new Date()) && <Badge color="red">เกินกำหนด</Badge>}</div>)}
        </div>
      </div>
      <div className="card"><h2>โครงการที่ดูแล ({myPoSteps.length})</h2>
        {myPoSteps.length === 0 ? <Empty text="ไม่มีโครงการที่คุณเป็นผู้จัดการ" /> : myPoSteps.map(({ p, cur }) => <div key={p.id} style={{ padding: '4px 0' }}><Link to={'/projects/' + p.id}>{p.code} {p.name}</Link> · ขั้นตอน: {cur.cfg.label}</div>)}
      </div>
    </Page>
  )
}
void toast
