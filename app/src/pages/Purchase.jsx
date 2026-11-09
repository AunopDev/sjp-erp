import React, { useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { useApp, Page, DataTable, Modal, Badge, Val, Empty, ErrorBox, History, Kv, Tabs, useSubmit, toast, RefLink } from '../components/ui'
import { act } from '../lib/store'
import * as db from '../lib/db'
import { RecordForm } from './Entity'
import { fmtDate, fmtNum, uid } from '../lib/util'

const poSt = (s, k) => s.config.workflows.po.statuses.find(x => x.key === k)

export default function Purchase() {
  const { s, can } = useApp()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const [form, setForm] = useState(!!sp.get('newProject') || sp.get('new') === '1')
  const data = db.rows(s, 'purchaseOrders').map(o => {
    const got = db.poReceived(s, o)
    const tot = (o.lines || []).reduce((a, l) => a + Number(l.qty || 0), 0)
    const rec = (o.lines || []).reduce((a, l) => a + Math.min(Number(l.qty || 0), got[l.item] || 0), 0)
    return { ...o, amount: db.poAmount(o), pct: tot ? Math.round((rec / tot) * 100) : 0 }
  })
  const cols = [
    { key: 'code', label: 'เลขที่ PO', render: r => <span>{r.code}</span> },
    { key: 'vendor', label: 'ผู้ขาย', value: r => db.label(s, 'vendors', r.vendor) },
    { key: 'project', label: 'โครงการ', value: r => db.label(s, 'projects', r.project) },
    { key: 'orderDate', label: 'วันที่สั่ง', render: r => fmtDate(r.orderDate) },
    { key: 'dueDate', label: 'กำหนดส่ง', render: r => fmtDate(r.dueDate) },
    { key: 'amount', label: 'มูลค่า (บาท)', render: r => fmtNum(r.amount) },
    { key: 'pct', label: 'รับแล้ว', render: r => r.pct + '%' },
    { key: 'status', label: 'สถานะ', value: r => poSt(s, r.status)?.label, render: r => <Badge color={poSt(s, r.status)?.color}>{poSt(s, r.status)?.label}</Badge> }
  ]
  return (
    <Page title="ใบสั่งซื้อและรับสินค้า" subtitle="จัดซื้อ → รับสินค้า → เข้าคลัง" actions={can('purchase', 'create') && <button className="btn primary" onClick={() => setForm(true)}>+ สร้างใบสั่งซื้อ</button>}>
      <DataTable columns={cols} data={data} onRow={r => nav('/purchaseOrders/' + r.id)} tabs={[{ key: 'wait', label: 'รอรับสินค้า', test: r => ['ordered', 'partial'].includes(r.status) }, { key: 'draft', label: 'ร่าง', test: r => r.status === 'draft' }, { key: 'done', label: 'รับครบ/ปิด', test: r => ['received', 'closed'].includes(r.status) }, { key: 'all', label: 'ทั้งหมด' }]} exportName="purchase-orders" canExport={can('purchase', 'export')}
        filters={[{ key: 'status', label: 'สถานะ', options: s.config.workflows.po.statuses.map(x => [x.key, x.label]), get: r => r.status }]} />
      {form && <RecordForm entity="purchaseOrders" title="สร้างใบสั่งซื้อ" extra={{ status: 'draft' }} defaults={{ project: sp.get('newProject') || '', orderDate: new Date().toISOString().slice(0, 10), lines: [{}] }}
        onClose={() => { setForm(false); if (sp.get('newProject') || sp.get('new')) setSp({}) }} onSaved={r => r?.id && nav('/purchaseOrders/' + r.id)} />}
    </Page>
  )
}

function ReceiveModal({ po, onClose }) {
  const { s } = useApp()
  const got = db.poReceived(s, po)
  const whs = db.rows(s, 'warehouses')
  const reqId = React.useRef(uid())
  const [wh, setWh] = useState(whs[0]?.id || '')
  const items = [...new Set(po.lines.map(l => l.item))]
  const [lines, setLines] = useState(() => items.map(it => ({ item: it, qty: '', serialNos: '' })))
  const [err, setErr] = useState('')
  const [busy, run] = useSubmit()
  const ordered = it => po.lines.filter(l => l.item === it).reduce((a, l) => a + Number(l.qty || 0), 0)
  const go = async () => {
    const payload = lines.map(l => ({ item: l.item, qty: Number(l.qty || 0), serialNos: String(l.serialNos).split(/[\n,]+/).map(x => x.trim()).filter(Boolean) }))
    const r = await run(() => act(st => db.receivePO(st, po.id, wh, payload, reqId.current)))
    if (r.ok) { toast('รับสินค้าเข้าคลังแล้ว'); onClose() } else if (r.error !== 'busy') setErr(r.error)
  }
  return (
    <Modal wide title={'รับสินค้า / ตรวจรับ ' + po.code} onClose={onClose} footer={<><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn primary" disabled={busy} onClick={go}>บันทึกการรับ</button></>}>
      <div className="field"><label>รับเข้าคลัง</label><select value={wh} onChange={e => setWh(e.target.value)}>{whs.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
      {lines.map((l, i) => {
        const it = db.getRec(s, 'items', l.item)
        const remain = ordered(l.item) - (got[l.item] || 0)
        return (
          <div key={l.item} className="card" style={{ marginTop: 10 }}>
            <b>{it?.name}</b> <span className="muted small">สั่ง {ordered(l.item)} · รับแล้ว {got[l.item] || 0} · คงเหลือ {remain}</span>
            <div className="form-grid" style={{ marginTop: 6 }}>
              <div className="field"><label>จำนวนที่รับครั้งนี้</label><input type="number" min="0" max={remain} value={l.qty} onChange={e => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} /></div>
              {it?.trackSerial && <div className="field wide"><label>Serial Number (คั่นด้วยขึ้นบรรทัดใหม่หรือ ,)</label><textarea rows={3} value={l.serialNos} onChange={e => setLines(lines.map((x, j) => (j === i ? { ...x, serialNos: e.target.value } : x)))} /></div>}
            </div>
          </div>
        )
      })}
      {err && <div className="err" role="alert" style={{ marginTop: 8 }}>{err}</div>}
    </Modal>
  )
}

export function PoDetail() {
  const { id } = useParams()
  const { s, can } = useApp()
  const nav = useNavigate()
  const [tab, setTab] = useState('info')
  const [recv, setRecv] = useState(false)
  const [edit, setEdit] = useState(false)
  const [busy, run] = useSubmit()
  const po = db.getRec(s, 'purchaseOrders', id)
  if (!can('purchase', 'view')) return <Page title="ใบสั่งซื้อ"><ErrorBox error="ไม่มีสิทธิ์ดูข้อมูลนี้" /></Page>
  if (!po) return <Page title="ใบสั่งซื้อ"><ErrorBox error="ไม่พบใบสั่งซื้อ" /></Page>
  const cur = poSt(s, po.status)
  const got = db.poReceived(s, po)
  const moves = (s.data.stockMoves || []).filter(m => m.po === id)
  const pend = s.approvals.filter(a => a.entity === 'purchaseOrders' && a.recId === id && a.status === 'pending')
  const fields = db.fieldsOf(s, 'purchaseOrders').filter(f => !f.hidden)
  const move = to => run(() => act(st => db.changePoStatus(st, id, to)), 'เปลี่ยนสถานะแล้ว').then(r => r.ok && r.data.pending && toast('ส่งคำขออนุมัติแล้ว'))
  return (
    <Page title={<span>{po.code}</span>} subtitle={`ผู้ขาย: ${db.label(s, 'vendors', po.vendor)}`}
      actions={<>
        <button className="btn" onClick={() => nav('/purchaseOrders')}>‹ รายการ</button>
        {can('purchase', 'edit') && po.status === 'draft' && <button className="btn" onClick={() => setEdit(true)}>แก้ไข</button>}
        {can('warehouse', 'create') && ['ordered', 'partial'].includes(po.status) && <button className="btn primary" onClick={() => setRecv(true)}>รับสินค้า</button>}
        {(cur?.next || []).map(k => { const n = poSt(s, k); return n && n.enabled !== false && !(k === 'partial' || k === 'received') ? <button key={k} className="btn" disabled={busy} onClick={() => move(k)}>→ {n.label}</button> : null })}
      </>}>
      {pend.map(a => <div key={a.id} className="notice warn">รออนุมัติ: {a.title}</div>)}
      <div className="card"><Badge color={cur?.color}>{cur?.label}</Badge> <span className="muted small">สถานะ “รับบางส่วน/รับครบ” เปลี่ยนอัตโนมัติเมื่อบันทึกการรับสินค้า</span></div>
      <Tabs tabs={[['info', 'รายละเอียด'], ['recv', `การรับสินค้า (${moves.length})`], ['audit', 'ประวัติ']]} value={tab} onChange={setTab} />
      {tab === 'info' && (
        <>
          <div className="card">{fields.filter(f => f.key !== 'lines').map(f => <Kv key={f.key} label={f.label}><Val f={f} v={po[f.key]} /></Kv>)}<Kv label="มูลค่ารวม">{fmtNum(db.poAmount(po))} บาท</Kv></div>
          <div className="card"><h3>รายการ</h3>
            <table className="mini"><thead><tr><th>สินค้า</th><th>สั่ง</th><th>ราคา/หน่วย</th><th>รับแล้ว (รวมสินค้าเดียวกัน)</th></tr></thead>
              <tbody>{(po.lines || []).map((l, i) => <tr key={i}><td><RefLink entity="items" id={l.item} /></td><td>{l.qty}</td><td>{fmtNum(l.unitPrice)}</td><td>{got[l.item] || 0}</td></tr>)}</tbody></table></div>
          {po.project && <div className="card">โครงการ: <RefLink entity="projects" id={po.project} /></div>}
        </>
      )}
      {tab === 'recv' && <div className="card">{moves.length === 0 ? <Empty text="ยังไม่มีการรับสินค้า" /> : moves.map(m => <div key={m.id}>{m.code} · {fmtDate(m.date)} · {db.label(s, 'items', m.item)} x{m.qty} → {db.label(s, 'warehouses', m.to)}{m.serials.length > 0 && ' · SN: ' + m.serials.map(i => db.getRec(s, 'serials', i)?.serialNo).join(', ')}</div>)}</div>}
      {tab === 'audit' && <div className="card"><History entity="purchaseOrders" id={id} /></div>}
      {recv && <ReceiveModal po={po} onClose={() => setRecv(false)} />}
      {edit && <RecordForm entity="purchaseOrders" record={po} onClose={() => setEdit(false)} />}
    </Page>
  )
}
void Link
