import React, { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useApp, Page, DataTable, Modal, Badge, Empty, ErrorBox, History, Kv, Tabs, useSubmit, toast, RefLink } from '../components/ui'
import { act, getState } from '../lib/store'
import * as db from '../lib/db'
import { RecordForm } from './Entity'
import { fmtDate, fmtDateTime, fmtDuration, toCsv, downloadFile, ymd, addDays } from '../lib/util'

const stColor = { 'รอดำเนินการ': 'gray', 'กำลังตรวจ': 'blue', 'เสร็จ': 'green' }

function TemplateModal({ tpl, onClose }) {
  const { s } = useApp()
  const f = db.fieldsOf(s, 'pmTemplates')
  const [name, setName] = useState(tpl?.name || '')
  const [category, setCategory] = useState(tpl?.category || '')
  const [items, setItems] = useState(tpl?.items || [{ label: '' }])
  const [err, setErr] = useState('')
  const [busy, run] = useSubmit()
  const reqId = React.useRef(Math.random().toString())
  const save = async () => {
    const clean = items.filter(i => i.label.trim())
    if (!clean.length) return setErr('ต้องมีรายการตรวจอย่างน้อย 1 รายการ')
    const r = await run(() => act(st => tpl ? db.patch(st, 'pmTemplates', tpl.id, { name, category, items: clean }) : db.insert(st, 'pmTemplates', { name, category, items: clean }, { reqId: reqId.current })), 'บันทึกแม่แบบแล้ว')
    if (r.ok) onClose(); else if (r.error !== 'busy') setErr(r.error)
  }
  return (
    <Modal wide title={tpl ? 'แก้ไขแม่แบบรายการตรวจ' : 'สร้างแม่แบบรายการตรวจ'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn primary" disabled={busy} onClick={save}>บันทึก</button></>}>
      <div className="form-grid">
        <div className="field"><label>{f[0].label} *</label><input value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="field"><label>ประเภทอุปกรณ์</label><select value={category} onChange={e => setCategory(e.target.value)}><option value="">–</option>{(f[1].options || []).map(o => <option key={o}>{o}</option>)}</select></div>
      </div>
      <h3 style={{ margin: '12px 0 6px' }}>รายการตรวจ</h3>
      {items.map((it, i) => (
        <div key={i} className="row" style={{ marginBottom: 6 }}>
          <input value={it.label} placeholder={`รายการที่ ${i + 1}`} onChange={e => setItems(items.map((x, j) => (j === i ? { label: e.target.value } : x)))} />
          <button className="btn ghost sm" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="ลบ">ลบ</button>
        </div>
      ))}
      <button className="btn sm" onClick={() => setItems([...items, { label: '' }])}>+ เพิ่มรายการตรวจ</button>
      <p className="muted small">รายการตรวจจริงตามประเภทอุปกรณ์/สัญญา ต้องรอยืนยัน — การแก้แม่แบบไม่กระทบงาน PM ที่สร้างไปแล้ว</p>
      {err && <div className="err">{err}</div>}
    </Modal>
  )
}

function MonthlyReport() {
  const { s, can } = useApp()
  const [month, setMonth] = useState(ymd(new Date()).slice(0, 7))
  const [site, setSite] = useState('')
  const recs = db.rows(s, 'pmRecords').filter(r => r.dueDate.startsWith(month) && (!site || r.site === site))
  const siteIds = [...new Set(recs.map(r => r.site))]
  const open = db.rows(s, 'tickets').filter(t => db.isOpenTicket(s, t) && (site ? t.site === site : true))
  const abn = recs.flatMap(r => (r.results || []).map((x, i) => ({ r, x, i }))).filter(z => z.x.result === 'ผิดปกติ')
  const csv = () => downloadFile(`pm-monthly-${month}.csv`, toCsv(['งาน PM', 'ไซต์', 'กำหนด', 'สถานะ', 'รายการ', 'ผล', 'รายละเอียด', 'วิธีแก้'],
    recs.flatMap(r => (r.results?.length ? r.results : [{}]).map(x => [r.code, db.label(s, 'sites', r.site), r.dueDate, r.status, x.label, x.result, x.note, x.action]))))
  return (
    <div>
      <div className="card row">
        <div className="field"><label>เดือน</label><input type="month" value={month} onChange={e => setMonth(e.target.value)} /></div>
        <div className="field"><label>ไซต์</label><select value={site} onChange={e => setSite(e.target.value)}><option value="">ทั้งหมด</option>{db.rows(s, 'sites').map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <span className="grow" /><button className="btn" onClick={() => window.print()}>พิมพ์</button>{can('pm', 'export') && <button className="btn" onClick={csv} disabled={!recs.length}>CSV</button>}
      </div>
      <div className="card">
        <h2>รายงานบริการประจำเดือน {month}</h2>
        <div className="muted small">ไซต์ที่เกี่ยวข้อง: {siteIds.map(i => db.label(s, 'sites', i)).join(', ') || '–'} · งาน PM {recs.length} งาน (เสร็จ {recs.filter(r => r.status === 'เสร็จ').length}) · พบสิ่งผิดปกติ {abn.length} รายการ</div>
        {recs.length === 0 ? <Empty text="ไม่มีงาน PM ในเดือนนี้" /> : (
          <table className="mini" style={{ marginTop: 8 }}><thead><tr><th>งาน</th><th>ไซต์</th><th>กำหนด</th><th>สถานะ</th><th>ผู้ตรวจ</th><th>ผิดปกติ</th></tr></thead>
            <tbody>{recs.map(r => <tr key={r.id}><td><Link to={'/pm/records/' + r.id}>{r.code}</Link></td><td>{db.label(s, 'sites', r.site)}</td><td>{fmtDate(r.dueDate)}</td><td>{r.status}</td><td>{db.label(s, 'users', r.doneBy)}</td><td>{(r.results || []).filter(x => x.result === 'ผิดปกติ').length}</td></tr>)}</tbody></table>
        )}
        {abn.length > 0 && <><h3 style={{ marginTop: 12 }}>สิ่งผิดปกติและวิธีแก้</h3><ul>{abn.map(({ r, x, i }) => <li key={r.id + i}>{r.code} — {x.label}: {x.note} {x.action && `(แก้: ${x.action})`} {x.ticket && <Link to={'/tickets/' + x.ticket}>Ticket ติดตาม</Link>}</li>)}</ul></>}
        <h3 style={{ marginTop: 12 }}>เคสที่ยังไม่ปิด ({open.length})</h3>
        {open.length === 0 ? <Empty text="ไม่มีเคสค้าง" /> : (
          <table className="mini"><thead><tr><th>เลขที่</th><th>หัวข้อ</th><th>ไซต์</th><th>สถานะ</th><th>อายุเคส</th></tr></thead>
            <tbody>{open.map(t => <tr key={t.id}><td><Link to={'/tickets/' + t.id}>{t.code}</Link></td><td>{t.title}</td><td>{db.label(s, 'sites', t.site)}</td><td>{db.ticketStatusOf(s, t.status)?.label}</td><td>{fmtDuration(db.ticketMetrics(t).ageH)}</td></tr>)}</tbody></table>
        )}
      </div>
    </div>
  )
}

export default function Pm() {
  const { s, can } = useApp()
  const nav = useNavigate()
  const [tab, setTab] = useState('jobs')
  const [plan, setPlan] = useState(null)
  const [tpl, setTpl] = useState(null)
  const [busy, run] = useSubmit()
  const jobs = db.rows(s, 'pmRecords').map(r => ({ ...r, planName: db.label(s, 'pmPlans', r.plan), overdue: r.status !== 'เสร็จ' && r.dueDate < ymd(new Date()) }))
  const jobCols = [
    { key: 'code', label: 'เลขที่', render: r => <span>{r.code}</span> },
    { key: 'planName', label: 'แผน' }, { key: 'site', label: 'ไซต์', value: r => db.label(s, 'sites', r.site) },
    { key: 'dueDate', label: 'กำหนด', render: r => <span>{fmtDate(r.dueDate)} {r.overdue && <Badge color="red">เกินกำหนด</Badge>}</span> },
    { key: 'assignee', label: 'ผู้รับผิดชอบ', value: r => db.label(s, 'users', r.assignee) },
    { key: 'status', label: 'สถานะ', render: r => <Badge color={stColor[r.status]}>{r.status}</Badge> }
  ]
  const plans = db.rows(s, 'pmPlans')
  const planCols = [
    { key: 'code', label: 'รหัส' }, { key: 'name', label: 'แผน' }, { key: 'site', label: 'ไซต์', value: r => db.label(s, 'sites', r.site) },
    { key: 'frequency', label: 'รอบ' }, { key: 'template', label: 'แม่แบบ', value: r => db.label(s, 'pmTemplates', r.template) },
    { key: 'active', label: 'ใช้งาน', value: r => (r.active ? 'ใช้งาน' : 'หยุด'), render: r => <Badge color={r.active ? 'green' : 'gray'}>{r.active ? 'ใช้งาน' : 'หยุด'}</Badge> }
  ]
  const gen = async () => {
    const r = await run(() => act(st => db.generatePm(st, ymd(addDays(new Date(), 7)))))
    if (r.ok) toast(r.data ? `สร้างงาน PM ใหม่ ${r.data} งาน` : 'ไม่มีงานครบรอบที่ต้องสร้างเพิ่ม')
  }
  return (
    <Page title="งาน PM และรายงานบริการ" subtitle="รอบตรวจ รายการตรวจ และติดตามสิ่งผิดปกติ"
      actions={<>{can('pm', 'create') && tab === 'jobs' && <button className="btn primary" disabled={busy} onClick={gen}>สร้างงานตามรอบ (ล่วงหน้า 7 วัน)</button>}
        {can('pm', 'create') && tab === 'plans' && <button className="btn primary" onClick={() => setPlan({})}>+ เพิ่มแผน PM</button>}
        {can('pm', 'create') && tab === 'tpl' && <button className="btn primary" onClick={() => setTpl({})}>+ สร้างแม่แบบ</button>}</>}>
      <div className="notice small">รอบ PM และรายการตรวจในระบบเป็นตัวอย่างจำลอง รอผู้ใช้ยืนยัน — ปรับแผน/แม่แบบได้ในหน้านี้</div>
      <Tabs tabs={[['jobs', `งานตามรอบ (${jobs.length})`], ['plans', 'แผน PM'], ['tpl', 'แม่แบบรายการตรวจ'], ['rep', 'รายงานประจำเดือน']]} value={tab} onChange={setTab} />
      {tab === 'jobs' && <DataTable columns={jobCols} data={jobs} onRow={r => nav('/pm/records/' + r.id)} tabs={[{ key: 'todo', label: 'ที่ต้องทำ', test: r => r.status !== 'เสร็จ' }, { key: 'over', label: 'เกินกำหนด', test: r => r.overdue }, { key: 'done', label: 'เสร็จแล้ว', test: r => r.status === 'เสร็จ' }, { key: 'all', label: 'ทั้งหมด' }]} exportName="pm-jobs" canExport={can('pm', 'export')} initialSort={{ key: 'dueDate', dir: -1 }} rowClass={r => (r.overdue ? 'hl-3' : '')}
        filters={[{ key: 'status', label: 'สถานะ', options: Object.keys(stColor), get: r => r.status }]} emptyText="ยังไม่มีงาน PM — เพิ่มแผนแล้วกด “สร้างงานตามรอบ”" />}
      {tab === 'plans' && <DataTable columns={planCols} data={plans} onRow={r => can('pm', 'edit') && setPlan(r)} filters={[{ key: 'frequency', label: 'รอบ', options: ['รายวัน', 'รายสัปดาห์', 'รายเดือน', 'รายไตรมาส'], get: r => r.frequency }]} />}
      {tab === 'tpl' && (
        <div className="grid c2">{db.rows(s, 'pmTemplates').map(t => (
          <div key={t.id} className="card"><h3>{t.name}</h3><div className="muted small">{t.category}</div>
            <ol>{(t.items || []).map((i, k) => <li key={k}>{i.label}</li>)}</ol>
            {can('pm', 'edit') && <button className="btn sm" onClick={() => setTpl(t)}>แก้ไข</button>}</div>
        ))}</div>
      )}
      {tab === 'rep' && <MonthlyReport />}
      {plan && <RecordForm entity="pmPlans" record={plan.id ? plan : null} defaults={{ active: true, frequency: 'รายเดือน' }} onClose={() => setPlan(null)} />}
      {tpl && <TemplateModal tpl={tpl.id ? tpl : null} onClose={() => setTpl(null)} />}
    </Page>
  )
}

export function PmRecordPage() {
  const { id } = useParams()
  const { s, can } = useApp()
  const nav = useNavigate()
  const r = db.getRec(s, 'pmRecords', id)
  const [results, setResults] = useState(r?.results || [])
  const [summary, setSummary] = useState(r?.summary || '')
  const [busy, run] = useSubmit()
  if (!can('pm', 'view')) return <Page title="งาน PM"><ErrorBox error="ไม่มีสิทธิ์ดูข้อมูลนี้" /></Page>
  if (!r || !db.inScope(s, 'pmRecords', r)) return <Page title="งาน PM"><ErrorBox error="ไม่พบงาน PM หรือไม่มีสิทธิ์เข้าถึง" /></Page>
  const locked = r.status === 'เสร็จ' || !can('pm', 'edit')
  const set = (i, k, v) => setResults(results.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const save = finish => run(() => act(st => db.savePm(st, id, { results, summary, finish })), finish ? 'ปิดงาน PM แล้ว' : 'บันทึกแล้ว')
  const mkTicket = async i => {
    const sv = act(st => db.savePm(st, id, { results, summary, finish: false }))
    if (!sv.ok) return toast(sv.error, 'err')
    const x = await run(() => act(st => db.pmToTicket(st, id, i)), 'สร้าง Ticket ติดตามแล้ว')
    if (x.ok) setResults(db.getRec(getState(), 'pmRecords', id)?.results || results)
  }
  const live = r.status === 'เสร็จ' ? r.results : results
  return (
    <Page title={<span>{r.code}</span>} subtitle={`${db.label(s, 'pmPlans', r.plan)} · ${db.label(s, 'sites', r.site)} · กำหนด ${fmtDate(r.dueDate)}`} actions={<button className="btn" onClick={() => nav('/pm')}>‹ งาน PM</button>}>
      <div className="card"><Badge color={stColor[r.status]}>{r.status}</Badge> แม่แบบ: {r.templateName}
        {r.doneAt && <span className="muted small"> · ปิดงานโดย {db.label(s, 'users', r.doneBy)} {fmtDateTime(r.doneAt)}</span>}</div>
      <div className="card">
        <h3>ผลการตรวจ</h3>
        {live.length === 0 ? <Empty text="แม่แบบนี้ไม่มีรายการตรวจ" /> : (
          <div className="table-wrap"><table className="mini"><thead><tr><th>รายการ</th><th>ผล</th><th>รายละเอียด/สิ่งผิดปกติ</th><th>วิธีแก้/งานติดตาม</th><th /></tr></thead>
            <tbody>{live.map((x, i) => (
              <tr key={i}><td>{x.label}</td>
                <td><select disabled={locked} value={x.result} onChange={e => set(i, 'result', e.target.value)}><option value="">–</option><option>ปกติ</option><option>ผิดปกติ</option><option>ไม่เกี่ยวข้อง</option></select></td>
                <td><input disabled={locked} value={x.note || ''} onChange={e => set(i, 'note', e.target.value)} /></td>
                <td><input disabled={locked} value={x.action || ''} onChange={e => set(i, 'action', e.target.value)} /></td>
                <td>{x.ticket ? <Link to={'/tickets/' + x.ticket}>Ticket</Link> : x.result === 'ผิดปกติ' && can('tickets', 'create') && <button className="btn sm" disabled={busy} onClick={() => mkTicket(i)}>สร้าง Ticket ติดตาม</button>}</td></tr>
            ))}</tbody></table></div>
        )}
        <div className="field" style={{ marginTop: 10 }}><label>สรุปผล</label><textarea rows={3} disabled={locked} value={summary} onChange={e => setSummary(e.target.value)} /></div>
        {!locked && <div className="row" style={{ marginTop: 10 }}><button className="btn" disabled={busy} onClick={() => save(false)}>บันทึกร่าง</button><button className="btn primary" disabled={busy} onClick={() => save(true)}>ปิดงาน PM</button></div>}
      </div>
      <div className="card"><History entity="pmRecords" id={id} /></div>
    </Page>
  )
}
void Kv
