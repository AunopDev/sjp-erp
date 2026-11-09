import { ENT } from './schema'
import { isEmpty } from './util'

const J = x => JSON.stringify(x ?? null)

// Compare two configs and describe what the change would do to existing data.
// level: info | warn | block (block = cannot be applied)
export function diffConfig(s, a, b) {
  const out = []
  const add = (level, text) => out.push({ level, text })
  const count = (entity, fn) => (s.data[entity] || []).filter(r => !r._deleted && fn(r)).length

  // fields
  for (const entity of Object.keys(b.fields)) {
    const label = (b.modules || []).find(m => m.key === entity)?.name || ENT[entity]?.label || entity
    if (!a.fields[entity]) continue
    const oa = a.fields[entity] || [], ob = b.fields[entity]
    for (const f of ob) {
      const o = oa.find(x => x.key === f.key)
      if (!o) { add('info', `${label}: เพิ่มฟิลด์ “${f.label}”${f.required ? ' (บังคับ)' : ''}`); if (f.required) { const n = count(entity, () => true); n && add('warn', `${label}: ฟิลด์บังคับใหม่ “${f.label}” — ${n} รายการเดิมยังไม่มีค่า ต้องกรอกเมื่อแก้ไขครั้งถัดไป`) } continue }
      if (o.label !== f.label) add('info', `${label}: เปลี่ยนชื่อฟิลด์ “${o.label}” → “${f.label}”`)
      if (!o.required && f.required) { const n = count(entity, r => isEmpty(r[f.key])); add(n ? 'warn' : 'info', `${label}: ตั้ง “${f.label}” เป็นบังคับ — ${n} รายการเดิมยังไม่มีค่า (ต้องกรอกเมื่อแก้ไขครั้งถัดไป)`) }
      if (o.required && !f.required) add('info', `${label}: เลิกบังคับ “${f.label}”`)
      if (f.hidden && f.required) add('block', `${label}: “${f.label}” เป็นฟิลด์บังคับ ซ่อนไม่ได้ — ยกเลิกการบังคับก่อน`)
      else if (!o.hidden && f.hidden) { const n = count(entity, r => !isEmpty(r[f.key])); add('info', `${label}: ซ่อน “${f.label}” — ข้อมูลเดิม ${n} รายการยังเก็บไว้ แต่ไม่แสดงในแบบฟอร์ม`) }
      if (o.hidden && !f.hidden) add('info', `${label}: แสดง “${f.label}” อีกครั้ง`)
      if (o.type !== f.type) add('block', `${label}: ไม่รองรับการเปลี่ยนชนิดข้อมูลของ “${f.label}” (สร้างฟิลด์ใหม่แทน)`)
      if (J(o.options) !== J(f.options)) {
        const removed = (o.options || []).filter(x => !(f.options || []).includes(x))
        removed.forEach(x => { const n = count(entity, r => r[f.key] === x); add(n ? 'warn' : 'info', `${label}: ลบตัวเลือก “${x}” ของ “${f.label}” — ใช้อยู่ ${n} รายการ (ค่าเดิมยังแสดงเป็น “ค่าเดิม”)`) })
        ;(f.options || []).filter(x => !(o.options || []).includes(x)).forEach(x => add('info', `${label}: เพิ่มตัวเลือก “${x}” ใน “${f.label}”`))
      }
    }
    for (const o of oa) if (!ob.some(x => x.key === o.key)) {
      const n = count(entity, r => !isEmpty(r[o.key]))
      add(n ? 'block' : 'info', `${label}: ลบฟิลด์ “${o.label}”${n ? ` — มีข้อมูล ${n} รายการ ลบไม่ได้ (ใช้ซ่อนแทน)` : ''}`)
    }
    if (J(oa.map(x => x.key)) !== J(ob.map(x => x.key)) && oa.length === ob.length) add('info', `${label}: เปลี่ยนลำดับฟิลด์`)
  }

  // lists
  for (const k of Object.keys(b.lists)) {
    const removed = (a.lists[k] || []).filter(x => !b.lists[k].includes(x))
    removed.forEach(x => {
      const n = k === 'teams' ? count('tickets', r => r.team === x) + count('sites', r => r.team === x) + count('projects', r => r.team === x) + s.users.filter(u => u.team === x).length
        : s.users.filter(u => u.dept === x).length
      add(n ? 'warn' : 'info', `ลบ${k === 'teams' ? 'ทีม' : 'แผนก'} “${x}” — ถูกใช้อยู่ ${n} รายการ`)
    })
    b.lists[k].filter(x => !(a.lists[k] || []).includes(x)).forEach(x => add('info', `เพิ่ม${k === 'teams' ? 'ทีม' : 'แผนก'} “${x}”`))
  }

  // ticket / po status workflows
  const statusWf = (key, entity, name) => {
    const oa = a.workflows[key].statuses, ob = b.workflows[key].statuses
    for (const st of ob) {
      const o = oa.find(x => x.key === st.key)
      if (!o) { add('info', `${name}: เพิ่มสถานะ “${st.label}”`); continue }
      if (o.label !== st.label) add('info', `${name}: เปลี่ยนชื่อสถานะ “${o.label}” → “${st.label}”`)
      if (o.enabled && !st.enabled) { const n = count(entity, r => r.status === st.key); add(n ? 'warn' : 'info', `${name}: ปิดใช้สถานะ “${st.label}” — ${n} รายการอยู่ในสถานะนี้ (ยังแสดงอยู่ แต่เลือกเปลี่ยนมาไม่ได้)`) }
      if (J(o.next) !== J(st.next)) add('info', `${name}: แก้เงื่อนไขสถานะถัดไปของ “${st.label}”`)
      if (J(o.requiredFields) !== J(st.requiredFields)) { const n = count(entity, r => r.status === st.key); add(n ? 'warn' : 'info', `${name}: แก้ฟิลด์บังคับเมื่อเข้าสถานะ “${st.label}” — กระทบเมื่อเปลี่ยนสถานะครั้งถัดไป`) }
      if (o.approverRole !== st.approverRole || o.approverUser !== st.approverUser) add('warn', `${name}: เปลี่ยนผู้อนุมัติของสถานะ “${st.label}” — ต่อไปการเปลี่ยนเป็นสถานะนี้${st.approverRole || st.approverUser ? 'ต้องรออนุมัติ' : 'ไม่ต้องอนุมัติ'}`)
    }
    for (const o of oa) if (!ob.some(x => x.key === o.key)) { const n = count(entity, r => r.status === o.key); add(n ? 'block' : 'info', `${name}: ลบสถานะ “${o.label}”${n ? ` — มี ${n} รายการอยู่ในสถานะนี้ ลบไม่ได้ (ปิดใช้แทน)` : ''}`) }
    if (a.workflows[key].confirmed !== b.workflows[key].confirmed) add('info', `${name}: ${b.workflows[key].confirmed ? 'ยืนยันว่าเป็นชุดสถานะจริง' : 'ยกเลิกการยืนยัน'}`)
  }
  statusWf('ticket', 'tickets', 'Workflow Ticket')
  statusWf('po', 'purchaseOrders', 'Workflow ใบสั่งซื้อ')
  for (const key of Object.keys(b.workflows).filter(k => k.startsWith('m_'))) {
    const mn = (b.modules || []).find(m => m.key === key)?.name || key
    if (!a.workflows[key]) add('info', 'โมดูล “' + mn + '”: เพิ่ม workflow สถานะ')
    else statusWf(key, key, 'โมดูล “' + mn + '”')
  }
  for (const key of Object.keys(a.workflows).filter(k => k.startsWith('m_') && !b.workflows[k])) {
    const n = count(key, r => r.status)
    add(n ? 'warn' : 'info', 'ปิด workflow สถานะของโมดูล “' + ((a.modules || []).find(m => m.key === key)?.name || key) + '”' + (n ? ' — ' + n + ' รายการมีสถานะเดิมเก็บไว้ แต่ไม่แสดง' : ''))
  }
  // user-built modules
  {
    const ma = a.modules || [], mb = b.modules || []
    for (const m of mb) {
      const o = ma.find(x => x.key === m.key)
      if (!o) { add('info', 'เพิ่มโมดูลใหม่ “' + m.name + '” (' + (b.fields[m.key] || []).length + ' ฟิลด์)'); continue }
      if (o.name !== m.name) add('info', 'เปลี่ยนชื่อโมดูล “' + o.name + '” → “' + m.name + '”')
      if (o.active && !m.active) add('warn', 'ซ่อนโมดูล “' + m.name + '” ออกจากเมนู (ข้อมูล ' + count(m.key, () => true) + ' รายการยังเก็บไว้)')
      if (!o.active && m.active) add('info', 'แสดงโมดูล “' + m.name + '” ในเมนู')
      if (J({ ...o, name: 0, active: 0 }) !== J({ ...m, name: 0, active: 0 })) add('info', 'โมดูล “' + m.name + '”: แก้ไขการตั้งค่า/มุมมอง/ตาราง')
    }
    for (const o of ma) if (!mb.some(x => x.key === o.key)) {
      const n = count(o.key, () => true)
      add(n ? 'block' : 'info', 'ลบโมดูล “' + o.name + '”' + (n ? ' — มีข้อมูล ' + n + ' รายการ ลบไม่ได้ (ใช้ซ่อนจากเมนูแทน)' : ''))
    }
    if (J(a.nav) !== J(b.nav)) add('info', 'แก้ไขเมนูที่แสดง/ซ่อน')
  }
  if (J(a.workflows.po.limits) !== J(b.workflows.po.limits)) add('warn', 'ใบสั่งซื้อ: แก้วงเงิน/ผู้อนุมัติ — PO ที่สั่งซื้อหลังจากนี้จะใช้เกณฑ์ใหม่')

  // project steps
  {
    const oa = a.workflows.project.steps, ob = b.workflows.project.steps
    const used = key => count('projects', p => p.steps?.[key] && (p.steps[key].status !== 'pending' || Object.keys(p.steps[key].values || {}).length))
    for (const st of ob) {
      const o = oa.find(x => x.key === st.key)
      if (!o) { add('info', `Workflow โครงการ: เพิ่มขั้นตอน “${st.label}” (โครงการเดิมจะยังไม่มีขั้นตอนนี้จนกว่าจะเปิดดูครั้งถัดไป)`); continue }
      if (o.label !== st.label) add('info', `Workflow โครงการ: เปลี่ยนชื่อ “${o.label}” → “${st.label}”`)
      if (o.enabled && !st.enabled) { const n = used(st.key); add(n ? 'warn' : 'info', `Workflow โครงการ: ปิดขั้นตอน “${st.label}” — ${n} โครงการมีข้อมูลในขั้นตอนนี้ (ข้อมูลยังเก็บอยู่ แต่ไม่แสดง)`) }
      if (!o.requireDocs && st.requireDocs) add('warn', `Workflow โครงการ: บังคับแนบเอกสารใน “${st.label}” — โครงการที่ยังไม่จบขั้นตอนนี้ต้องแนบก่อนจบ`)
      if (J(o.docs) !== J(st.docs)) add('info', `Workflow โครงการ: แก้รายการเอกสารของ “${st.label}”`)
      if (J(o.fields) !== J(st.fields)) {
        const n = used(st.key)
        add(n ? 'warn' : 'info', `Workflow โครงการ: แก้ฟิลด์ของ “${st.label}”${n ? ` — กระทบ ${n} โครงการที่มีข้อมูลแล้ว` : ''}`)
      }
      if (o.approvalRequired !== st.approvalRequired || o.approverRole !== st.approverRole || o.approverUser !== st.approverUser) add('warn', `Workflow โครงการ: แก้การอนุมัติของ “${st.label}”`)
    }
    for (const o of oa) if (!ob.some(x => x.key === o.key)) { const n = used(o.key); add(n ? 'block' : 'info', `Workflow โครงการ: ลบขั้นตอน “${o.label}”${n ? ` — มี ${n} โครงการใช้อยู่ ลบไม่ได้ (ปิดใช้แทน)` : ''}`) }
    if (J(oa.map(x => x.key)) !== J(ob.map(x => x.key)) && oa.length === ob.length) add('info', 'Workflow โครงการ: เปลี่ยนลำดับขั้นตอน')
    if (a.workflows.project.confirmed !== b.workflows.project.confirmed) add('info', `Workflow โครงการ: ${b.workflows.project.confirmed ? 'ยืนยันว่าเป็น workflow จริง' : 'ยกเลิกการยืนยัน'}`)
  }

  // roles
  for (const r of b.roles) {
    const o = a.roles.find(x => x.id === r.id)
    const users = s.users.filter(u => u.roleId === r.id).length
    if (!o) { add('info', `เพิ่มบทบาท “${r.name}”`); continue }
    if (o.name !== r.name) add('info', `เปลี่ยนชื่อบทบาท “${o.name}” → “${r.name}”`)
    if (o.scope !== r.scope) add('warn', `บทบาท “${r.name}”: เปลี่ยนขอบเขตข้อมูล ${o.scope} → ${r.scope} — กระทบผู้ใช้ ${users} คน`)
    if (J(o.perms) !== J(r.perms)) add(users ? 'warn' : 'info', `บทบาท “${r.name}”: แก้สิทธิ์ — กระทบผู้ใช้ ${users} คน (มีผลทันที)`)
  }
  for (const o of a.roles) if (!b.roles.some(x => x.id === o.id)) {
    const users = s.users.filter(u => u.roleId === o.id).length
    add(users ? 'block' : 'info', `ลบบทบาท “${o.name}”${users ? ` — มีผู้ใช้ ${users} คน ลบไม่ได้` : ''}`)
  }
  if (!b.roles.some(r => r.isAdmin)) add('block', 'ต้องมีบทบาทผู้ดูแลระบบอย่างน้อย 1 บทบาท')

  // escalation
  const ea = a.escalation, eb = b.escalation
  if (ea.enabled !== eb.enabled) add('warn', `การแจ้งเตือน/ยกระดับเคสค้าง: ${eb.enabled ? 'เปิดใช้ — เคสค้างจะถูกไฮไลต์และแจ้งเตือนตามเกณฑ์ทันที' : 'ปิดใช้'}`)
  if (eb.enabled && !eb.confirmed) add('block', 'ต้องยืนยันว่าเกณฑ์เป็นค่าจริง (ไม่ใช่ตัวอย่าง) ก่อนเปิดการแจ้งเตือน')
  if (J(ea.rules) !== J(eb.rules) || J(ea.buckets) !== J(eb.buckets)) add('info', 'แก้เกณฑ์/ช่วงอายุเคส')
  if (ea.confirmed !== eb.confirmed) add('info', `เกณฑ์เวลา: ${eb.confirmed ? 'ยืนยันว่าเป็นค่าจริง' : 'ยกเลิกการยืนยัน'}`)

  if (!out.length && J(a) !== J(b)) add('info', 'แก้ไขค่าตั้งค่าอื่น')
  return out
}
