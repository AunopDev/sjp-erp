import React, { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useApp, Page, DataTable, Badge, Empty, Tabs, useSubmit, toast, RefLink, FieldInput } from '../components/ui'
import { act } from '../lib/store'
import * as db from '../lib/db'
import { RecordForm } from './Entity'
import { fmtDateTime, uid } from '../lib/util'

const TYPES = [['receive', 'รับเข้า (ไม่มี PO)'], ['issue', 'เบิกออก'], ['transfer', 'โอนย้ายระหว่างคลัง'], ['return', 'รับคืน'], ['adjust', 'ปรับยอด']]

function MoveForm({ initType, initProject, onDone }) {
  const { s } = useApp()
  const [type, setType] = useState(initType)
  const base = { item: '', qty: 1, from: '', to: '', project: initProject || '', site: '', ticket: '', recipient: '', note: '', evidence: [], serials: [], serialText: '', dir: 'เพิ่ม' }
  const [v, setV] = useState(base)
  const [err, setErr] = useState('')
  const reqId = React.useRef(uid())
  const [busy, run] = useSubmit()
  const whs = db.rows(s, 'warehouses')
  const bal = db.balances(s)
  const item = db.getRec(s, 'items', v.item)
  const set = (k, x) => setV(p => ({ ...p, [k]: x }))
  const pool = (s.data.serials || []).filter(x => !x._deleted && x.item === v.item && (type === 'return' ? !x.warehouse : x.warehouse === v.from))
  const toggle = id => set('serials', v.serials.includes(id) ? v.serials.filter(x => x !== id) : [...v.serials, id])
  const go = async () => {
    setErr('')
    const r = await run(() => act(st => {
      if (type === 'receive') return db.receiveManual(st, { item: v.item, qty: v.qty, to: v.to, serialNos: v.serialText.split(/[\n,]+/), note: v.note, recipient: v.recipient, evidence: v.evidence }, reqId.current)
      const adj = type === 'adjust'
      return db.createMove(st, {
        type, item: v.item, qty: item?.trackSerial ? v.serials.length : v.qty, serials: v.serials,
        from: adj ? (v.dir === 'ลด' ? v.from : null) : v.from || null, to: adj ? (v.dir === 'เพิ่ม' ? v.to : null) : v.to || null,
        project: v.project || null, site: v.site || null, ticket: v.ticket || null, recipient: v.recipient, evidence: v.evidence, note: v.note
      }, { reqId: reqId.current })
    }))
    if (r.ok) { toast('บันทึกรายการแล้ว'); reqId.current = uid(); setV(base); onDone?.() } else if (r.error !== 'busy') setErr(r.error)
  }
  const needFrom = ['issue', 'transfer'].includes(type) || (type === 'adjust' && v.dir === 'ลด')
  const needTo = ['transfer', 'return'].includes(type) || type === 'receive' || (type === 'adjust' && v.dir === 'เพิ่ม')
  const wsel = (k, label) => (
    <div className="field"><label>{label}</label>
      <select value={v[k]} onChange={e => set(k, e.target.value)}><option value="">– เลือก –</option>{whs.map(w => <option key={w.id} value={w.id}>{w.name}{v.item && k === 'from' ? ` (คงเหลือ ${bal[w.id]?.[v.item] || 0})` : ''}</option>)}</select></div>
  )
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 10 }}>{TYPES.map(([k, l]) => <button key={k} className={'btn ' + (type === k ? 'primary' : '')} onClick={() => { setType(k); setV(p => ({ ...p, serials: [] })) }}>{l}</button>)}</div>
      <div className="form-grid">
        <div className="field"><label>สินค้า/อะไหล่ *</label><select value={v.item} onChange={e => setV(p => ({ ...p, item: e.target.value, serials: [] }))}><option value="">– เลือก –</option>{db.rows(s, 'items').map(x => <option key={x.id} value={x.id}>{x.name}{x.trackSerial ? ' [Serial]' : ''}</option>)}</select></div>
        {type === 'adjust' && <div className="field"><label>ทิศทาง</label><select value={v.dir} onChange={e => set('dir', e.target.value)}><option>เพิ่ม</option><option>ลด</option></select></div>}
        {needFrom && wsel('from', 'คลังต้นทาง *')}
        {needTo && wsel('to', 'คลังปลายทาง *')}
        {type === 'receive' && item?.trackSerial ? (
          <div className="field wide"><label>Serial Number ที่รับ (คั่นด้วยขึ้นบรรทัดใหม่หรือ ,) *</label><textarea rows={3} value={v.serialText} onChange={e => set('serialText', e.target.value)} /></div>
        ) : item?.trackSerial && type !== 'adjust' ? (
          <div className="field wide"><label>เลือก Serial *</label>{pool.length === 0 ? <span className="muted">{type === 'return' || v.from ? 'ไม่มี Serial ที่เลือกได้' : 'เลือกคลังต้นทางก่อน'}</span> : <div>{pool.map(x => <label key={x.id} className="check"><input type="checkbox" checked={v.serials.includes(x.id)} onChange={() => toggle(x.id)} /> {x.serialNo} ({x.status})</label>)}</div>}</div>
        ) : <div className="field"><label>จำนวน *</label><input type="number" min="0" step="any" value={v.qty} onChange={e => set('qty', e.target.value)} /></div>}
        {type === 'adjust' && item?.trackSerial && <div className="notice warn wide">ปรับยอดสินค้าที่ติดตาม Serial ทำไม่ได้ — ใช้รับเข้า/เบิก/รับคืนแทน</div>}
        {type === 'issue' && <>
          <div className="field"><label>โครงการ</label><select value={v.project} onChange={e => set('project', e.target.value)}><option value="">–</option>{db.rows(s, 'projects').map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}</select></div>
          <div className="field"><label>ไซต์</label><select value={v.site} onChange={e => set('site', e.target.value)}><option value="">–</option>{db.rows(s, 'sites').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div className="field"><label>Ticket</label><select value={v.ticket} onChange={e => set('ticket', e.target.value)}><option value="">–</option>{db.rows(s, 'tickets').filter(t => db.isOpenTicket(s, t)).map(p => <option key={p.id} value={p.id}>{p.code} {p.title}</option>)}</select></div>
          <div className="field"><label>ผู้รับ</label><input value={v.recipient} onChange={e => set('recipient', e.target.value)} /></div>
          <FieldInput f={{ key: 'evidence', label: 'หลักฐานการส่งมอบ', type: 'file' }} value={v.evidence} onChange={x => set('evidence', x)} />
        </>}
        <div className="field wide"><label>หมายเหตุ{type === 'adjust' ? ' / เหตุผล *' : ''}</label><textarea rows={2} value={v.note} onChange={e => set('note', e.target.value)} /></div>
      </div>
      {err && <div className="err" role="alert" style={{ marginTop: 8 }}>{err}</div>}
      <div className="row" style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} onClick={go}>{busy ? 'กำลังบันทึก…' : 'บันทึกรายการ'}</button></div>
      <p className="muted small">การรับจากใบสั่งซื้อทำที่หน้า <Link to="/purchaseOrders">ใบสั่งซื้อ</Link> เพื่อให้เชื่อมกับ PO</p>
    </div>
  )
}

export default function Warehouse() {
  const { s, can } = useApp()
  const [sp] = useSearchParams()
  const [tab, setTab] = useState(sp.get('tab') === 'issue' ? 'do' : 'bal')
  const [whForm, setWhForm] = useState(false)
  const whs = db.rows(s, 'warehouses')
  const bal = db.balances(s)
  const items = db.rows(s, 'items')
  const balRows = items.map(it => {
    const per = {}
    let tot = 0
    whs.forEach(w => { per[w.id] = bal[w.id]?.[it.id] || 0; tot += per[w.id] })
    return { id: it.id, name: it.name, sku: it.sku, unit: it.unit, min: Number(it.minStock || 0), per, tot, low: it.minStock && tot < Number(it.minStock) }
  })
  const balCols = [
    { key: 'sku', label: 'SKU' }, { key: 'name', label: 'สินค้า', render: r => <RefLink entity="items" id={r.id} /> },
    ...whs.map(w => ({ key: 'w' + w.id, label: w.name, value: r => r.per[w.id] })),
    { key: 'tot', label: 'รวม', render: r => <b>{r.tot}</b> }, { key: 'min', label: 'ขั้นต่ำ' },
    { key: 'low', label: 'สถานะ', value: r => (r.low ? 'ต่ำกว่าขั้นต่ำ' : 'ปกติ'), render: r => (r.low ? <Badge color="red">ต่ำกว่าขั้นต่ำ</Badge> : <Badge color="green">ปกติ</Badge>) }
  ]
  const moves = (s.data.stockMoves || []).filter(m => !m._deleted).map(m => ({ ...m, typeLabel: db.MOVE_TYPES[m.type] })).reverse()
  const moveCols = [
    { key: 'code', label: 'เลขที่', render: r => <span>{r.code}</span> },
    { key: 'date', label: 'วันที่', value: r => r.date, render: r => fmtDateTime(r.date) },
    { key: 'typeLabel', label: 'ประเภท' },
    { key: 'item', label: 'สินค้า', value: r => db.label(s, 'items', r.item) }, { key: 'qty', label: 'จำนวน' },
    { key: 'from', label: 'จาก', value: r => db.label(s, 'warehouses', r.from) }, { key: 'to', label: 'ไป', value: r => db.label(s, 'warehouses', r.to) },
    { key: 'ref', label: 'อ้างอิง', value: r => [r.po && db.label(s, 'purchaseOrders', r.po), r.project && db.label(s, 'projects', r.project), r.ticket && db.label(s, 'tickets', r.ticket)].filter(Boolean).join(' / '),
      render: r => <span>{r.po && <RefLink entity="purchaseOrders" id={r.po} />} {r.project && <RefLink entity="projects" id={r.project} />} {r.ticket && <RefLink entity="tickets" id={r.ticket} />}</span> },
    { key: 'sn', label: 'Serial', value: r => r.serials.map(i => db.getRec(s, 'serials', i)?.serialNo).join(', ') },
    { key: 'recipient', label: 'ผู้รับ' }
  ]
  return (
    <Page title="คลังสินค้า" subtitle="ยอดคงเหลือ รับเข้า เบิก โอน" actions={can('warehouse', 'create') && <button className="btn primary" onClick={() => setTab('do')}>+ ทำรายการ</button>}>
      <Tabs tabs={[['bal', 'ยอดคงเหลือ'], ['do', 'รับเข้า/เบิก/โอน'], ['moves', 'ความเคลื่อนไหว'], ['wh', 'รายชื่อคลัง']]} value={tab} onChange={setTab} />
      {tab === 'bal' && <DataTable columns={balCols} data={balRows} exportName="stock-balance" canExport={can('warehouse', 'export')} filters={[{ key: 'low', label: 'สถานะ', options: ['ต่ำกว่าขั้นต่ำ', 'ปกติ'], get: r => (r.low ? 'ต่ำกว่าขั้นต่ำ' : 'ปกติ') }]} />}
      {tab === 'do' && (can('warehouse', 'create') ? <MoveForm initType={sp.get('tab') === 'issue' ? 'issue' : 'receive'} initProject={sp.get('project')} /> : <Empty text="ไม่มีสิทธิ์ทำรายการคลัง" />)}
      {tab === 'moves' && <DataTable columns={moveCols} data={moves} exportName="stock-moves" canExport={can('warehouse', 'export')} filters={[{ key: 'type', label: 'ประเภท', options: Object.entries(db.MOVE_TYPES), get: r => r.type }]} />}
      {tab === 'wh' && (
        <div className="card">
          {can('warehouse', 'create') && <button className="btn sm" onClick={() => setWhForm(true)}>+ เพิ่มคลัง</button>}
          {whs.map(w => <div key={w.id} style={{ padding: '6px 0' }}>{w.code} · <b>{w.name}</b> · {w.kind}</div>)}
        </div>
      )}
      {whForm && <RecordForm entity="warehouses" onClose={() => setWhForm(false)} />}
    </Page>
  )
}
