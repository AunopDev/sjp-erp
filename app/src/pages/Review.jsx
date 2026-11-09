import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp, Page, Badge, useSubmit } from '../components/ui'
import { act } from '../lib/store'
import * as db from '../lib/db'
import { fmtDateTime } from '../lib/util'

const SRC = [
  ['จากเอกสาร', 'blue', [
    'ชื่อระบบ SJP ERP และบริษัท เอส เจ พี อินฟอร์เมชั่นซิสเต็ม จำกัด (สำนักงานใหญ่ 18/8 ถนนแสมดำ แขวงแสมดำ เขตบางขุนเทียน กรุงเทพมหานคร)',
    'ขอบเขตผลิตภัณฑ์/บริการ: Smart MS-Box, CCTV, PA, ตรวจวัดอากาศ, จอ LED, เครือข่าย/Fiber, โดรน, Smart City/Monitoring, โครงการภาครัฐ, งานบริการหลังการขาย',
    'Workflow โครงการ 13 ขั้นตอน และเอกสารที่ระบุในแต่ละขั้นตอน (ใช้เป็นค่าตั้งต้นให้ตรวจสอบ)',
    'ข้อมูลที่ Ticket ต้องเก็บ ขั้นตอนทำงาน 7 ข้อ และรายการ PM รายวัน/สัปดาห์/เดือน/ไตรมาส',
    'การเชื่อมโยง Ticket–ลูกค้า–โครงการ–ไซต์–อุปกรณ์ และ Serial–ประวัติ',
    'หน้าจอที่ต้องมี สิทธิ์ 7 ประเภท (ดู สร้าง แก้ไข มอบหมาย อนุมัติ ส่งออก ปิดรายการ)'
  ]],
  ['ข้อเสนอ (ผู้ช่วยเสนอ รอยืนยัน)', 'amber', [
    'ชุดสถานะ Ticket 12 สถานะ (ตามลำดับในเอกสาร) พร้อมเส้นทางเปลี่ยนสถานะและฟิลด์บังคับเมื่อปิดเคส (สาเหตุ/วิธีแก้)',
    'ทีม/แผนก/บทบาท/ชื่อคลัง ตัวเลือกความเร่งด่วน (ต่ำ/ปกติ/สูง/เร่งด่วน) และหมวดฟิลด์ต่าง ๆ',
    'แม่แบบรายการตรวจ PM (ตัวอย่างจำลอง) และแผน PM ตัวอย่าง',
    'การใช้ “คงเหลือ = รับ − เบิก” ต่อคลัง, การติดตามรับประกันจากวันที่ติดตั้ง + ระยะรับประกันของสินค้า',
    'MVP 6 โมดูลแรก (ด้านล่าง) และลำดับโมดูลถัดไป'
  ]],
  ['ยังต้องยืนยัน (ระบบยังไม่ตั้งค่าใด ๆ)', 'red', [
    'ผู้อนุมัติของแต่ละขั้นตอน/สถานะ และวงเงินอนุมัติ PO — ว่างอยู่ทั้งหมด จึงยังไม่มีการขออนุมัติเกิดขึ้น',
    'SLA จริง — ช่วง 6–12, 24, 48, 60 ชม. เป็นเพียงตัวอย่างจากเอกสาร การแจ้งเตือน/ยกระดับอัตโนมัติ “ปิดอยู่”',
    'เอกสารบังคับต่อขั้นตอนโครงการ, รอบ PM จริง, ข้อบังคับภายในอื่น ๆ'
  ]]
]

export default function Review() {
  const { s, can } = useApp()
  const [ans, setAns] = useState({})
  const [busy, run] = useSubmit()
  const canEdit = can('settings', 'edit')
  const save = (c, status) => run(() => act(st => db.saveConfirmation(st, c.id, ans[c.id] ?? c.answer, status)), 'บันทึกแล้ว')
  const open = s.confirmations.filter(c => c.status !== 'ยืนยันแล้ว').length
  return (
    <Page title="ขอบเขต MVP และรายการรอยืนยัน" subtitle={`รอยืนยัน ${open} ข้อ`}>
      <div className="card">
        <h2>สรุปที่เข้าใจ</h2>
        <p>SJP ERP สำหรับ บริษัท เอส เจ พี อินฟอร์เมชั่นซิสเต็ม จำกัด — ธุรกิจ IT โทรคมนาคม Smart City และระบบรักษาความปลอดภัย (พัฒนา ผลิต จำหน่าย จัดซื้อ นำเข้า ซ่อมบำรุง ให้บริการ) ต้องการ ERP บนเว็บที่เชื่อมโครงการ งานบริการ คลัง จัดซื้อ และการบำรุงรักษา โดยผู้ดูแลปรับฟิลด์ workflow สิทธิ์ ได้เองผ่านหน้าเว็บ</p>
      </div>
      <div className="grid c3">
        {SRC.map(([t, c, items]) => (
          <div key={t} className="card"><h3><Badge color={c}>{t}</Badge></h3><ul>{items.map((x, i) => <li key={i} style={{ marginBottom: 4 }}>{x}</li>)}</ul></div>
        ))}
      </div>
      <div className="card">
        <h2>คำถามที่ต้องยืนยัน</h2>
        {s.confirmations.map(c => (
          <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px dashed #e6ecf2' }}>
            <div className="row"><b>{c.topic}</b><Badge color={c.status === 'ยืนยันแล้ว' ? 'green' : c.kind === 'ข้อเสนอ' ? 'amber' : 'red'}>{c.status === 'ยืนยันแล้ว' ? 'ยืนยันแล้ว' : c.kind}</Badge></div>
            <div className="muted small">{c.ask}</div>
            <textarea rows={2} style={{ marginTop: 6 }} disabled={!canEdit} placeholder="คำตอบ/ข้อมูลที่ยืนยัน (บันทึกไว้เป็นหลักฐาน — ต้องไปตั้งค่าจริงที่หน้าตั้งค่าด้วย)" value={ans[c.id] ?? c.answer} onChange={e => setAns({ ...ans, [c.id]: e.target.value })} />
            {canEdit && <div className="row" style={{ marginTop: 4 }}>
              <button className="btn sm primary" disabled={busy || !(ans[c.id] ?? c.answer)} onClick={() => save(c, 'ยืนยันแล้ว')}>บันทึกเป็นยืนยันแล้ว</button>
              {c.status === 'ยืนยันแล้ว' && <button className="btn sm" onClick={() => save(c, 'รอยืนยัน')}>ยกเลิกการยืนยัน</button>}
              {c.at && <span className="muted small">ล่าสุด {db.label(s, 'users', c.by)} · {fmtDateTime(c.at)}</span>}
            </div>}
          </div>
        ))}
      </div>
      <div className="grid c2">
        <div className="card"><h2>MVP ที่ทำแล้วในระบบนี้</h2>
          <ol>
            <li>ลูกค้า ผู้ขาย ผู้ติดต่อ ไซต์งาน</li>
            <li>สินค้า/อุปกรณ์/อะไหล่ รุ่น Serial Number และรับประกัน</li>
            <li>โครงการภาครัฐ/ติดตั้ง (13 ขั้นตอน, BOQ, รายงานส่งมอบ)</li>
            <li>Service Ticket งานซ่อมบำรุง นัดหมาย อะไหล่</li>
            <li>จัดซื้อ รับสินค้า คลัง เบิกไปโครงการ/ไซต์/Ticket</li>
            <li>งาน PM และรายงานประจำเดือน</li>
          </ol>
          <p className="small muted"><b>เพิ่มเติม: ตัวสร้างโมดูล</b> — สร้างโมดูลใหม่เองได้ไม่จำกัด (ฟิลด์ สูตรคำนวณ สถานะ บอร์ด/ปฏิทิน สิทธิ์ เชื่อมกับข้อมูลเดิม) ที่ ตั้งค่า &gt; โมดูลของฉัน</p>
          <p className="small muted">รวมถึง Dashboard, งานของฉัน/อนุมัติ, ปฏิทิน, รายงาน/ส่งออก/นำเข้า CSV, ตั้งค่าฟิลด์/workflow/สิทธิ์ พร้อมประวัติและย้อนกลับ</p>
        </div>
        <div className="card"><h2>ยังไม่รวม (เสนอทำภายหลังเมื่อยืนยันกระบวนการจริง)</h2>
          <ul>
            <li>โมดูลขายและใบเสนอราคา (ตอนนี้เก็บเฉพาะเลขที่/ไฟล์ในขั้นตอนโครงการ)</li>
            <li>บัญชี/การเงิน, การผลิต, Monitoring เชิงเทคนิคและ GIS</li>
            <li>เซิร์ฟเวอร์กลางและฐานข้อมูลถาวร, อัปโหลดเนื้อไฟล์จริง</li>
            <li>แจ้งเตือนทางอีเมล/LINE, นับเวลาทำการ/หยุดนาฬิกา SLA</li>
          </ul>
          <p className="small muted">ดู/แก้ workflow ที่ตั้งต้นไว้ได้ที่ <Link to="/settings">ตั้งค่าระบบ</Link></p>
        </div>
      </div>
    </Page>
  )
}
