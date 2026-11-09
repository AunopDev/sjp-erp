import React from 'react'
import { Link } from 'react-router-dom'
import { useApp, Page, Empty, Badge } from '../components/ui'
import Icon from '../components/Icon'
import BuilderPromo from './platform/BuilderPromo'
import * as db from '../lib/db'
import { bucketLabel, bucketList } from './Tickets'
import { ymd, addDays, fmtAgo, fmtDuration } from '../lib/util'

const q = o => '?' + new URLSearchParams(o).toString()
function Bars({ data, to }) {
  const max = Math.max(1, ...data.map(d => d[1]))
  return data.map(([l, n, k]) => (
    <Link key={l} to={to ? to(k ?? l) : '#'} className="hbar" style={{ color: 'inherit' }}>
      <span>{l}</span><div className="bar"><div style={{ width: (n / max) * 100 + '%' }} /></div><b>{n}</b>
    </Link>
  ))
}

function Tile({ to, icon, n, label, sub, tone }) {
  return (
    <Link to={to} className={'tile ' + (tone || '')}>
      <span className="tile-ic"><Icon name={icon} size={22} /></span>
      <span className="tile-body"><span className="tile-n">{n}</span><span className="tile-l">{label}</span>{sub && <span className="tile-s">{sub}</span>}</span>
    </Link>
  )
}

const hello = () => { const h = new Date().getHours(); return h < 12 ? 'สวัสดีตอนเช้า' : h < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น' }
const HIDE_ACTIONS = ['login', 'logout', 'export', 'seed']

export default function Dashboard() {
  const { s, user, can } = useApp()
  const tickets = db.rows(s, 'tickets')
  const open = tickets.filter(t => db.isOpenTicket(s, t))
  const edges = s.config.escalation.buckets
  const bl = bucketList(edges)
  const byBucket = bl.map(b => [b, open.filter(t => bucketLabel(db.ticketMetrics(t).ageH, edges) === b).length])
  const byStatus = s.config.workflows.ticket.statuses.filter(x => !x.final).map(x => [x.label, open.filter(t => t.status === x.key).length, x.key])
  const byTeam = [...s.config.lists.teams, ''].map(tm => [tm || '(ยังไม่ระบุทีม)', open.filter(t => (t.team || '') === tm).length, tm]).filter(x => x[1] > 0)
  const byWho = [...new Set(open.map(t => t.assignee || ''))].map(w => [w ? db.label(s, 'users', w) : '(ยังไม่มอบหมาย)', open.filter(t => (t.assignee || '') === w).length, w])
  const projects = db.rows(s, 'projects')
  const activeP = projects.filter(p => !p.closed)
  const stepCount = {}
  activeP.forEach(p => { const c = db.currentStep(s, p); const k = c ? c.cfg.label.replace(/^\d+\.\s*/, '') : 'ครบทุกขั้นตอน'; stepCount[k] = (stepCount[k] || 0) + 1 })
  const pm = db.rows(s, 'pmRecords').filter(r => r.status !== 'เสร็จ')
  const today = ymd(new Date()), wk = ymd(addDays(new Date(), 7))
  const pmOver = pm.filter(r => r.dueDate < today)
  const pmWeek = pm.filter(r => r.dueDate >= today && r.dueDate <= wk)
  const bal = db.balances(s)
  const lowItems = db.rows(s, 'items').filter(it => it.minStock && Object.values(bal).reduce((a, w) => a + (w[it.id] || 0), 0) < Number(it.minStock))
  const pend = s.approvals.filter(a => a.status === 'pending' && db.isApprover(s, a.cfg))
  const warr = db.rows(s, 'serials').filter(x => x.warrantyEnd && x.status === 'ติดตั้งแล้ว' && (new Date(x.warrantyEnd) - new Date()) / 86400000 <= 30 && new Date(x.warrantyEnd) >= new Date())
  const urgent = open.filter(t => ['เร่งด่วน', 'สูง'].includes(t.priority))
  const mine = open.filter(t => t.assignee === user.id)
  const oldest = [...open].sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt)).slice(0, 6)
  const activity = [...s.audit].reverse().filter(a => !HIDE_ACTIONS.includes(a.action)).slice(0, 9)
  const es = s.config.escalation
  const mods = (s.config.modules || []).filter(m => m.active && can(m.key, 'view'))
  return (
    <Page title={`${hello()}, ${user.name.replace(/\s*\(.*\)/, '')}`} subtitle={new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' · ภาพรวมสิ่งที่ต้องดำเนินการวันนี้'} icon="home">
      <BuilderPromo />
      <div className="tiles">
        {can('tickets', 'view') && <Tile to={'/tickets' + q({ open: 'เคสค้าง' })} icon="ticket" n={open.length} label="เคสค้าง" sub={urgent.length ? `${urgent.length} เคสสูง/เร่งด่วน` : 'ไม่มีเคสเร่งด่วน'} tone={urgent.length ? 'bad' : ''} />}
        {can('tickets', 'view') && <Tile to="/my" icon="check" n={mine.length} label="เคสที่มอบหมายให้ฉัน" sub={mine.length ? 'กดเพื่อดูงานของฉัน' : 'ไม่มีงานค้าง'} />}
        <Tile to="/my" icon="doc" n={pend.length} label="รออนุมัติ" sub={pend.length ? 'รอการตัดสินใจจากคุณ' : 'ไม่มีรายการค้าง'} tone={pend.length ? 'warn' : ''} />
        {can('pm', 'view') && <Tile to="/pm" icon="wrench" n={pmOver.length} label="งาน PM เกินกำหนด" sub={`สัปดาห์นี้ครบกำหนด ${pmWeek.length} งาน`} tone={pmOver.length ? 'bad' : ''} />}
        {can('projects', 'view') && <Tile to="/projects" icon="folder" n={activeP.length} label="โครงการที่ดำเนินการ" sub={`ปิดแล้ว ${projects.length - activeP.length}`} />}
        {can('warehouse', 'view') && <Tile to="/warehouse" icon="box" n={lowItems.length} label="สินค้าต่ำกว่าขั้นต่ำ" sub={lowItems[0] ? lowItems.slice(0, 2).map(i => i.name.replace(/\s*\(.*\)/, '')).join(', ') : 'สต็อกปกติ'} tone={lowItems.length ? 'warn' : ''} />}
        {can('assets', 'view') && <Tile to="/serials" icon="tag" n={warr.length} label="ใกล้หมดประกัน (30 วัน)" sub="อุปกรณ์ที่ติดตั้งแล้ว" tone={warr.length ? 'warn' : ''} />}
      </div>

      {mods.length > 0 && (
        <div className="row" style={{ marginBottom: 16 }}>
          <span className="muted">โมดูลของฉัน:</span>
          {mods.map(m => { const list = db.rows(s, m.key); const wf = s.config.workflows[m.key]; const n = wf ? list.filter(r => !wf.statuses.find(x => x.key === r.status)?.final).length : list.length; return <Link key={m.key} className="chip" to={'/m/' + m.key.slice(2)}>{m.name} <b>{n}</b></Link> })}
        </div>
      )}

      <div className="grid c2">
        {can('tickets', 'view') && (
          <div className="card">
            <div className="row"><h2 style={{ margin: 0 }}>เคสที่ค้างนานที่สุด</h2><span className="grow" /><Link to="/tickets">ดูทั้งหมด</Link></div>
            {oldest.length === 0 ? <Empty text="ไม่มีเคสค้าง — เยี่ยมมาก" /> : oldest.map(t => {
              const stt = db.ticketStatusOf(s, t.status)
              return (
                <Link key={t.id} to={'/tickets/' + t.id} className="list-row">
                  <span className="mono muted">{t.code}</span>
                  <span className="lr-main"><b>{t.title}</b><span className="sub">{db.label(s, 'sites', t.site)}{t.assignee ? ' · ' + db.label(s, 'users', t.assignee) : ' · ยังไม่มอบหมาย'}</span></span>
                  <Badge color={stt?.color}>{stt?.label}</Badge>
                  <span className="lr-age">{fmtDuration(db.ticketMetrics(t).ageH)}</span>
                </Link>
              )
            })}
          </div>
        )}
        <div className="card">
          <div className="row"><h2 style={{ margin: 0 }}>ความเคลื่อนไหวล่าสุด</h2><span className="grow" />{can('settings', 'view') && <Link to="/settings/audit">ประวัติทั้งหมด</Link>}</div>
          {activity.length === 0 ? <Empty text="ยังไม่มีความเคลื่อนไหว" /> : activity.map(a => (
            <div key={a.id} className="list-row static">
              <span className="avatar sm">{(a.userName || '?').trim().charAt(0)}</span>
              <span className="lr-main"><span>{a.summary}</span><span className="sub">{a.userName}</span></span>
              <span className="lr-age muted">{fmtAgo(a.at)}</span>
            </div>
          ))}
        </div>
      </div>

      {can('tickets', 'view') && (
        <div className="grid c2">
          <div className="card"><h2>เคสค้างแยกตามอายุเคส</h2>
            <div className="notice small">{es.enabled && es.confirmed ? 'ช่วงอายุตั้งตามหน้าตั้งค่า' : 'ช่วงอายุเป็นตัวอย่างสำหรับดูภาพรวมเท่านั้น — ไม่ใช่ SLA และยังไม่เปิดแจ้งเตือน/ยกระดับอัตโนมัติ (รอยืนยัน)'}</div>
            <Bars data={byBucket} to={k => '/tickets' + q({ open: 'เคสค้าง', bucket: k })} /></div>
          <div className="card"><h2>เคสค้างแยกตามสถานะ</h2>{open.length === 0 ? <Empty text="ไม่มีเคสค้าง" /> : <Bars data={byStatus.filter(x => x[1] > 0)} to={k => '/tickets' + q({ status: k })} />}</div>
          <div className="card"><h2>เคสค้างแยกตามทีม</h2>{byTeam.length === 0 ? <Empty text="ไม่มีเคสค้าง" /> : <Bars data={byTeam} to={k => '/tickets' + q({ open: 'เคสค้าง', team: k })} />}</div>
          <div className="card"><h2>เคสค้างแยกตามผู้รับผิดชอบ</h2>{byWho.length === 0 ? <Empty text="ไม่มีเคสค้าง" /> : <Bars data={byWho} to={k => '/tickets' + q({ open: 'เคสค้าง', ...(k ? { assignee: k } : {}) })} />}</div>
        </div>
      )}
      {can('projects', 'view') && (
        <div className="card"><h2>โครงการแยกตามขั้นตอนปัจจุบัน</h2>
          {activeP.length === 0 ? <Empty text="ไม่มีโครงการที่ดำเนินการ" /> : <Bars data={Object.entries(stepCount)} to={() => '/projects'} />}</div>
      )}
    </Page>
  )
}
