import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp, Page, DataTable, Badge, RefLink, ErrorBox, Tabs } from '../components/ui'
import * as db from '../lib/db'
import { warranty } from './Entity'
import { boqTrack } from './Projects'
import { fmtDate, fmtDuration } from '../lib/util'

export default function Reports() {
  const { s, can } = useApp()
  const nav = useNavigate()
  const [tab, setTab] = useState('open')
  if (!can('reports', 'view')) return <Page title="รายงาน"><ErrorBox error="ไม่มีสิทธิ์ดูรายงาน" /></Page>
  const exp = can('reports', 'export')
  const edges = s.config.escalation.buckets
  void edges
  const tickets = db.rows(s, 'tickets').map(t => { const m = db.ticketMetrics(t); return { ...t, ...m, st: db.ticketStatusOf(s, t.status)?.label, open: db.isOpenTicket(s, t) } })
  const tcols = [
    { key: 'code', label: 'เลขที่ (ลิงก์ต้นทาง)', render: r => <RefLink entity="tickets" id={r.id} /> },
    { key: 'title', label: 'หัวข้อ' }, { key: 'customer', label: 'ลูกค้า', value: r => db.label(s, 'customers', r.customer) },
    { key: 'site', label: 'ไซต์', value: r => db.label(s, 'sites', r.site) }, { key: 'category', label: 'หมวดงาน' },
    { key: 'st', label: 'สถานะ' }, { key: 'team', label: 'ทีม' }, { key: 'assignee', label: 'ผู้รับผิดชอบ', value: r => db.label(s, 'users', r.assignee) },
    { key: 'receivedAt', label: 'รับเรื่อง', value: r => r.receivedAt.slice(0, 16).replace('T', ' ') },
    { key: 'responseH', label: 'ตอบสนอง', value: r => (r.responseH == null ? '' : Math.round(r.responseH * 10) / 10), render: r => fmtDuration(r.responseH) },
    { key: 'ageH', label: 'อายุเคส/ใช้เวลา', value: r => Math.round(r.ageH * 10) / 10, render: r => fmtDuration(r.ageH) }
  ]
  const projects = db.rows(s, 'projects').map(p => ({ ...p, stepLabel: db.projectStatus(s, p), done: db.stepsOf(s, p).filter(x => ['done', 'skipped'].includes(x.st.status)).length }))
  const pcols = [
    { key: 'code', label: 'รหัส', render: r => <RefLink entity="projects" id={r.id} /> }, { key: 'name', label: 'โครงการ' },
    { key: 'customer', label: 'ลูกค้า', value: r => db.label(s, 'customers', r.customer) }, { key: 'manager', label: 'ผู้จัดการ', value: r => db.label(s, 'users', r.manager) },
    { key: 'stepLabel', label: 'ขั้นตอนปัจจุบัน/สถานะ' }, { key: 'done', label: 'ขั้นตอนที่เสร็จ' }, { key: 'value', label: 'มูลค่า' }
  ]
  const boq = db.rows(s, 'projects').flatMap(p => boqTrack(s, p).map((l, i) => ({ id: p.id + i, p, ...l })))
  const bcols = [
    { key: 'p', label: 'โครงการ', value: r => r.p.code, render: r => <RefLink entity="projects" id={r.p.id} /> },
    { key: 'item', label: 'สินค้า', value: r => db.label(s, 'items', r.item), render: r => <RefLink entity="items" id={r.item} /> },
    { key: 'qty', label: 'ต้องใช้' }, { key: 'ordered', label: 'สั่งซื้อ' }, { key: 'received', label: 'รับเข้า' }, { key: 'issued', label: 'เบิกไปหน้างาน' }, { key: 'installed', label: 'ติดตั้งแล้ว' }
  ]
  const sers = db.rows(s, 'serials').map(x => ({ ...x, w: warranty(x).text }))
  const scols = [
    { key: 'serialNo', label: 'Serial', render: r => <RefLink entity="serials" id={r.id} /> }, { key: 'item', label: 'สินค้า', value: r => db.label(s, 'items', r.item) },
    { key: 'status', label: 'สถานะ' }, { key: 'site', label: 'ไซต์', value: r => db.label(s, 'sites', r.site) }, { key: 'location', label: 'จุดติดตั้ง' },
    { key: 'installedDate', label: 'ติดตั้ง', render: r => fmtDate(r.installedDate) }, { key: 'warrantyEnd', label: 'รับประกันถึง', render: r => fmtDate(r.warrantyEnd) },
    { key: 'w', label: 'สถานะประกัน', render: r => <Badge color={warranty(r).color}>{r.w}</Badge> },
    { key: 'hist', label: 'จำนวนเหตุการณ์', value: r => (r.history || []).length }
  ]
  const bal = db.balances(s)
  const stock = db.rows(s, 'items').map(it => ({ id: it.id, it, tot: Object.values(bal).reduce((a, w) => a + (w[it.id] || 0), 0) }))
  const kcols = [
    { key: 'sku', label: 'SKU', value: r => r.it.sku }, { key: 'name', label: 'สินค้า', value: r => r.it.name, render: r => <RefLink entity="items" id={r.id} /> },
    ...db.rows(s, 'warehouses').map(w => ({ key: w.id, label: w.name, value: r => bal[w.id]?.[r.id] || 0 })),
    { key: 'tot', label: 'รวม' }, { key: 'min', label: 'ขั้นต่ำ', value: r => r.it.minStock || 0 }
  ]
  const tabs = [['open', 'เคสค้าง'], ['tickets', 'Ticket ทั้งหมด'], ['projects', 'โครงการ'], ['boq', 'BOQ เทียบจริง'], ['serials', 'Serial/รับประกัน'], ['stock', 'ยอดสต็อก']]
  return (
    <Page title="รายงานและส่งออกข้อมูล" subtitle="ทุกแถวเปิดย้อนไปยังเอกสารต้นทางได้ · ส่งออกเป็น CSV (เปิดใน Excel ได้) · รายงานบริการประจำเดือนอยู่ที่หน้า งาน PM">
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'open' && <DataTable columns={tcols} data={tickets.filter(t => t.open)} exportName="open-tickets" canExport={exp} initialSort={{ key: 'ageH', dir: -1 }} onRow={r => nav('/tickets/' + r.id)} filters={[{ key: 'team', label: 'ทีม', options: s.config.lists.teams, get: r => r.team }]} />}
      {tab === 'tickets' && <DataTable columns={tcols} data={tickets} exportName="tickets" canExport={exp} onRow={r => nav('/tickets/' + r.id)} filters={[{ key: 'st', label: 'สถานะ', options: s.config.workflows.ticket.statuses.map(x => x.label), get: r => r.st }]} />}
      {tab === 'projects' && <DataTable columns={pcols} data={projects} exportName="projects" canExport={exp} onRow={r => nav('/projects/' + r.id)} />}
      {tab === 'boq' && <DataTable columns={bcols} data={boq} exportName="boq-tracking" canExport={exp} />}
      {tab === 'serials' && <DataTable columns={scols} data={sers} exportName="serials" canExport={exp} onRow={r => nav('/serials/' + r.id)} filters={[{ key: 'w', label: 'ประกัน', options: ['อยู่ในประกัน', 'ใกล้หมด', 'หมดประกัน', 'ไม่ระบุ'], get: r => (r.w.startsWith('ใกล้') ? 'ใกล้หมด' : r.w) }]} />}
      {tab === 'stock' && <DataTable columns={kcols} data={stock} exportName="stock" canExport={exp} />}
    </Page>
  )
}
