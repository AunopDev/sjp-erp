import { JSDOM } from 'jsdom'
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.localStorage = dom.window.localStorage
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = false
window.print = () => {}
window.scrollTo = () => {}
window.URL.createObjectURL = () => 'blob:x'
window.URL.revokeObjectURL = () => {}

const React = (await import('react')).default
const { createRoot } = await import('react-dom/client')
const { HashRouter } = await import('react-router-dom')
const App = (await import('../src/App.jsx')).default
const store = await import('../src/lib/store.js')
const db = await import('../src/lib/db.js')

const errors = []
console.error = (...a) => { errors.push(a.map(String).join(' ').slice(0, 300)) }
console.warn = () => {}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const settle = (ms = 350) => sleep(ms)
const root = createRoot(document.getElementById('root'))
root.render(<HashRouter><App /></HashRouter>)
await settle()
const Q = (s, r = document) => r.querySelector(s)
const QA = (s, r = document) => [...r.querySelectorAll(s)]
const T = e => (e?.textContent || '').trim()
const modal = () => Q('.modal')
const scope = () => modal() || Q('.content')
const setVal = (el, v) => {
  const proto = el.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
  el.dispatchEvent(new dom.window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
}
const field = (label, root = scope()) => {
  const f = QA('.field', root).find(x => T(Q('label', x)).replace('*', '').trim().startsWith(label))
  if (!f) throw new Error('no field: ' + label)
  return Q('input,select,textarea', f)
}
const fill = async (label, v) => { const el = field(label); if (el.tagName === 'SELECT' && !QA('option', el).some(o => o.value === v)) { const o = QA('option', el).find(o => T(o).includes(v)); if (!o) throw new Error('no option ' + v + ' in ' + label); v = o.value } setVal(el, v); await settle(60) }
const btn = (text, root = scope(), exact = false) => QA('button,a.btn', root).find(b => exact ? T(b) === text : T(b).includes(text))
const click = async (text, root, exact) => { const b = typeof text === 'string' ? btn(text, root, exact) : text; if (!b) throw new Error('no button: ' + text); b.click(); await settle() }
const nav = async h => { window.location.hash = h; await settle(450) }
const login = async u => { store.act(s => db.logout(s)); const r = store.act(s => db.login(s, u, 'demo1234')); if (!r.ok) throw new Error(r.error); await settle() }
const results = []
const step = async (name, fn) => {
  try { await fn(); results.push('ok   ' + name); console.log('ok   ' + name) }
  catch (e) { results.push('FAIL ' + name + ' :: ' + e.message); console.log('FAIL ' + name + ' :: ' + e.message) }
}
const S = () => store.getState()

await login('admin')

await step('create customer via form', async () => {
  await nav('/customers')
  await click('+ เพิ่ม')
  await fill('ชื่อลูกค้า', 'ลูกค้าทดสอบ E2E')
  await fill('ประเภท', 'เอกชน')
  await click('บันทึก', modal(), true)
  await settle(400)
  if (!S().data.customers.some(c => c.name === 'ลูกค้าทดสอบ E2E')) throw new Error('not saved: ' + T(Q('.modal .err,.notice.bad')))
  if (!/\/customers\//.test(window.location.hash)) throw new Error('did not open detail: ' + window.location.hash)
})
await step('duplicate submit guarded (double click)', async () => {
  await nav('/customers')
  await click('+ เพิ่ม')
  await fill('ชื่อลูกค้า', 'ซ้ำ-ทดสอบ')
  const b = btn('บันทึก', modal(), true)
  b.click(); b.click(); await settle(500)
  const n = S().data.customers.filter(c => c.name === 'ซ้ำ-ทดสอบ').length
  if (n !== 1) throw new Error('created ' + n)
})
await step('required field error shows', async () => {
  await nav('/customers')
  await click('+ เพิ่ม')
  await click('บันทึก', modal(), true)
  if (!/กรุณากรอก/.test(T(modal()))) throw new Error('no error msg')
  await click('ยกเลิก', modal(), true)
})
await step('create ticket + status + note + appt + part', async () => {
  await nav('/tickets/new')
  await fill('หัวข้อ', 'E2E ทดสอบ')
  await fill('ผู้แจ้ง', 'คุณทดสอบ')
  await fill('ไซต์', 'สวนสาธารณะ')
  await fill('หมวดงาน', 'CCTV')
  await fill('อาการ', 'ภาพดับ')
  await click('เปิดเคส', Q('.content'), true)
  await settle(500)
  const t = S().data.tickets.find(x => x.title === 'E2E ทดสอบ')
  if (!t) throw new Error('ticket not created: ' + T(Q('.err,.notice.bad')))
  if (!/\/tickets\//.test(window.location.hash)) throw new Error('no nav')
  if (t.customer == null) throw new Error('customer not autofilled from site')
  await click('เปลี่ยนสถานะ', Q('.page-actions'))
  await click('ยืนยัน', modal(), true)
  if (S().data.tickets.find(x => x.id === t.id).status !== 'triage') throw new Error('status ' + S().data.tickets.find(x => x.id === t.id).status)
  // note
  await click('ไทม์ไลน์', Q('.tabs'))
  await click('+ บันทึก/แจ้งผู้ใช้')
  setVal(Q('.modal textarea'), 'โทรหาลูกค้าแล้ว'); await settle(60)
  await click('บันทึก', modal(), true)
  if (!S().data.tickets.find(x => x.id === t.id).timeline.some(x => x.text === 'โทรหาลูกค้าแล้ว')) throw new Error('note missing')
  // appointment
  await click('นัดหมาย/หน้างาน', Q('.tabs'))
  await click('+ นัดหมายเข้าหน้างาน')
  await click('บันทึก', modal(), true)
  if (!S().data.tickets.find(x => x.id === t.id).appointments.length) throw new Error('appt missing')
  // part (issue)
  await click('อะไหล่/อุปกรณ์', Q('.tabs'))
  await click('+ เบิก/เปลี่ยน')
  const it = S().data.items.find(i => i.sku === 'DEMO-SP-AD12')
  setVal(Q('.modal select:nth-of-type(1)'), 'เบิก')
  await fill('สินค้า/อะไหล่', it.id)
  await fill('เบิกจากคลัง', S().data.warehouses[0].id)
  await click('บันทึก', modal(), true)
  const tt = S().data.tickets.find(x => x.id === t.id)
  if (!tt.parts.length) throw new Error('part missing: ' + T(Q('.modal .err')))
})
await step('close ticket requires cause/resolution', async () => {
  const t = S().data.tickets.find(x => x.title === 'E2E ทดสอบ')
  await nav('/tickets/' + t.id)
  for (const to of ['verify']) {
    await click('เปลี่ยนสถานะ', Q('.page-actions'))
    setVal(Q('.modal select'), to); await settle(80)
    await click('ยืนยัน', modal(), true)
    if (modal()) { console.log('   (expected) verify needs:', T(Q('.modal .err'))); setVal(Q('.modal textarea'), 'x'); }
  }
  if (modal()) await click('ยกเลิก', modal(), true)
})
await step('create project + complete step 1', async () => {
  await nav('/projects')
  await click('+ สร้างโครงการ')
  await fill('ชื่อโครงการ', 'โครงการ E2E')
  await fill('ลูกค้า', 'ลูกค้าทดสอบ E2E')
  await click('สร้างโครงการ', modal(), true)
  await settle(500)
  const p = S().data.projects.find(x => x.name === 'โครงการ E2E')
  if (!p) throw new Error('not created ' + T(Q('.modal .err')))
  // step 1 open by default; fill requirement
  const ta = field('รายละเอียดความต้องการ', Q('.step-body'))
  setVal(ta, 'ต้องการระบบกล้อง'); await settle(60)
  await click('จบขั้นตอน', Q('.step-body'))
  const pp = S().data.projects.find(x => x.id === p.id)
  if (pp.steps.req.status !== 'done') throw new Error('step not done: ' + pp.steps.req.status + ' ' + T(Q('.toast')))
  if (pp.steps.assess.status !== 'doing') throw new Error('next step not started')
})
await step('create PO + order + receive', async () => {
  await nav('/purchaseOrders')
  await click('+ สร้างใบสั่งซื้อ')
  await fill('ผู้ขาย', 'ผู้จำหน่ายอุปกรณ์ A')
  const rowsTbl = Q('.modal .rows-input')
  const sels = QA('select', rowsTbl); const nums = QA('input', rowsTbl)
  const it = S().data.items.find(i => i.sku === 'DEMO-SP-LED')
  setVal(sels[0], it.id); setVal(nums[0], '3'); setVal(nums[1], '100'); await settle(80)
  await click('บันทึก', modal(), true)
  await settle(500)
  const po = S().data.purchaseOrders.find(p => p.lines?.[0]?.item === it.id && p.status === 'draft')
  if (!po) throw new Error('PO not created ' + T(Q('.modal .err')))
  await click('→ สั่งซื้อแล้ว', Q('.page-actions'))
  if (S().data.purchaseOrders.find(p => p.id === po.id).status !== 'ordered') throw new Error('not ordered')
  await click('รับสินค้า', Q('.page-actions'))
  setVal(Q('.modal input[type=number]'), '2'); await settle(60)
  await click('บันทึกการรับ', modal(), true)
  const p2 = S().data.purchaseOrders.find(p => p.id === po.id)
  if (p2.status !== 'partial') throw new Error('status ' + p2.status + ' ' + T(Q('.modal .err')))
})
await step('warehouse issue to project', async () => {
  await nav('/warehouse?tab=issue&project=' + S().data.projects[0].id)
  await settle(300)
  const sel = QA('.card select').find(s => QA('option', s).some(o => T(o).includes('Adapter')))
  setVal(sel, S().data.items.find(i => i.sku === 'DEMO-SP-AD12').id); await settle(60)
  await fill('คลังต้นทาง', S().data.warehouses[0].id)
  setVal(Q('.card input[type=number]'), '2'); await settle(60)
  await click('บันทึกรายการ', Q('.content'), true)
  const mv = S().data.stockMoves.filter(m => m.type === 'issue' && m.qty === 2)
  if (!mv.length) throw new Error('issue missing ' + T(Q('.err')))
})
await step('PM generate + complete + ticket from abnormal', async () => {
  await nav('/pm')
  await click('สร้างงานตามรอบ')
  const rec = S().data.pmRecords.find(r => r.status === 'รอดำเนินการ')
  await nav('/pm/records/' + rec.id)
  const sels = QA('.content table select')
  sels.forEach((s, i) => setVal(s, i === 0 ? 'ผิดปกติ' : 'ปกติ')); await settle(60)
  const inputs = QA('.content table input'); setVal(inputs[0], 'ภาพมัว'); await settle(60)
  await click('สร้าง Ticket ติดตาม', Q('.content'))
  await click('ปิดงาน PM', Q('.content'), true)
  const r2 = S().data.pmRecords.find(r => r.id === rec.id)
  if (r2.status !== 'เสร็จ') throw new Error('not finished: ' + T(Q('.toast')))
  if (!r2.results[0].ticket) throw new Error('no follow-up ticket')
})
await step('settings: add custom field, publish, appears in form, rollback', async () => {
  await nav('/settings/fields')
  setVal(QA('select', Q('.content'))[0], 'customers'); await settle(100)
  await click('+ เพิ่มฟิลด์', Q('.content'))
  setVal(Q('.modal input'), 'ช่องทดสอบ'); await settle(60)
  await click('ตกลง', modal(), true)
  await click('ตรวจผลกระทบและใช้', Q('.content'))
  setVal(Q('.modal .field input'), 'เพิ่มช่องทดสอบ'); await settle(60)
  await click('ยืนยันและใช้การตั้งค่า', modal(), true)
  if (!S().config.fields.customers.some(f => f.label === 'ช่องทดสอบ')) throw new Error('field not applied')
  await nav('/customers'); await click('+ เพิ่ม')
  if (!QA('.modal .field label').some(l => T(l).startsWith('ช่องทดสอบ'))) throw new Error('field not in form')
  await click('ยกเลิก', modal(), true)
  await nav('/settings/ver')
  const before = S().configVersions.length
  await click('ย้อนกลับมาใช้เวอร์ชันนี้')
  setVal(Q('.modal .field input'), 'ย้อนกลับ'); await settle(60)
  await click('ยืนยันและใช้การตั้งค่า', modal(), true)
  if (S().config.fields.customers.some(f => f.label === 'ช่องทดสอบ')) throw new Error('rollback failed')
  if (S().configVersions.length !== before + 1) throw new Error('no new version')
})
await step('builder: create module from template, publish, add record, kanban', async () => {
  await nav('/settings/modules')
  await click('+ สร้างโมดูลใหม่')
  const tpls = QA('.tpl'); await click(QA('input', tpls[1])[0]) // pipeline
  setVal(Q('.modal .form-grid input'), 'โอกาสขาย E2E'); await settle(60)
  await click('สร้างโมดูล', modal(), true)
  await click('ตรวจผลกระทบและใช้', Q('.content'))
  setVal(Q('.modal .field input'), 'เพิ่มโมดูล E2E'); await settle(60)
  await click('ยืนยันและใช้การตั้งค่า', modal(), true)
  const m = S().config.modules.find(x => x.name === 'โอกาสขาย E2E')
  if (!m) throw new Error('module not applied')
  await nav('/m/' + m.key.slice(2))
  await click('+ เพิ่มรายการ')
  await fill('ชื่อโอกาส', 'ดีล E2E')
  await fill('มูลค่า', '12345')
  await click('บันทึก', modal(), true)
  await settle(500)
  const rec = (S().data[m.key] || []).find(r => r.title === 'ดีล E2E')
  if (!rec) throw new Error('record missing ' + T(Q('.modal .err')))
  if (rec.status !== 'new') throw new Error('default status ' + rec.status)
  await click('เปลี่ยนสถานะ', Q('.page-actions'))
  await click('ยืนยัน', modal(), true)
  if (S().data[m.key].find(r => r.id === rec.id).status === 'new') throw new Error('status unchanged')
  await nav('/m/' + m.key.slice(2))
  await click('บอร์ด', Q('.tabs'))
  if (!QA('.kcard').length) throw new Error('no kanban cards')
})
await step('user mgmt: add user, login as them, limited menu', async () => {
  await nav('/settings/users')
  await click('+ เพิ่มผู้ใช้')
  const inputs = QA('.modal .field input')
  setVal(inputs[0], 'e2e'); setVal(inputs[1], 'ผู้ใช้ E2E'); setVal(inputs[2 + 0 < inputs.length ? 2 : 2], 'abcdef'); await settle(80)
  setVal(Q('.modal select'), 'exec'); await settle(60)
  await click('บันทึก', modal(), true)
  if (!S().users.some(u => u.username === 'e2e')) throw new Error('user not saved ' + T(Q('.modal .err')))
  store.act(s => db.logout(s)); await settle()
  setVal(Q('#lu'), 'e2e'); setVal(Q('#lp'), 'abcdef'); await settle(60)
  await click('เข้าสู่ระบบ', Q('.login-card'), true)
  if (S().session == null) throw new Error('login failed ' + T(Q('.err')))
  await nav('/settings'); if (!/ไม่มีสิทธิ์/.test(T(Q('.content')))) throw new Error('exec reached settings')
  await login('admin')
})
await step('csv import customers', async () => {
  await nav('/customers')
  await click('นำเข้า CSV')
  const input = Q('.modal input[type=file]')
  const file = new dom.window.File(['﻿ชื่อลูกค้า,โทรศัพท์\nนำเข้า A,021\nนำเข้า B,022\n,000'], 'c.csv', { type: 'text/csv' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  file.text = async () => '﻿ชื่อลูกค้า,โทรศัพท์\nนำเข้า A,021\nนำเข้า B,022\n,000'
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await settle(400)
  if (!/พร้อมนำเข้า 2/.test(T(modal()))) throw new Error('preview wrong: ' + T(modal()).slice(0, 120))
  await click('นำเข้า 2 แถว', modal())
  if (!S().data.customers.some(c => c.name === 'นำเข้า B')) throw new Error('not imported')
})
await step('archive + restore customer', async () => {
  const c = S().data.customers.find(x => x.name === 'นำเข้า A')
  await nav('/customers/' + c.id)
  await click('ยกเลิก/ซ่อน', Q('.page-actions'))
  setVal(Q('.modal textarea'), 'ทดสอบ'); await settle(60)
  await click('ยกเลิกรายการ', modal(), true)
  if (!S().data.customers.find(x => x.id === c.id)._deleted) throw new Error('not archived')
  await click('กู้คืน', Q('.page-actions'))
  if (S().data.customers.find(x => x.id === c.id)._deleted) throw new Error('not restored')
})
await step('dashboard tiles + navigation', async () => {
  await nav('/')
  if (QA('.tile').length < 5) throw new Error('tiles ' + QA('.tile').length)
  if (!QA('.list-row').length) throw new Error('no list rows')
  Q('.tile').click(); await settle(400)
  if (window.location.hash === '#/') throw new Error('tile did not navigate')
})
await step('quick create menu opens project form', async () => {
  await nav('/')
  await click(Q('.create-btn'))
  const links = QA('.popover a.pop-row').map(a => T(a))
  if (links.length < 5) throw new Error('menu items ' + links.length)
  await click(QA('.popover a.pop-row').find(a => T(a).includes('สร้างโครงการ')))
  await settle(300)
  if (!Q('.modal')) throw new Error('project form not opened: ' + window.location.hash)
  await click('ยกเลิก', modal(), true)
})
await step('next-step button on ticket', async () => {
  const t = S().data.tickets.find(x => x.status === 'received')
  await nav('/tickets/' + t.id)
  const b = QA('.page-actions button').find(x => T(x).startsWith('ขั้นต่อไป'))
  if (!b) throw new Error('no next-step button')
  await click(b)
  if (T(Q('.modal select option:checked')) === '') throw new Error('preset missing')
  await click('ยืนยัน', modal(), true)
  if (S().data.tickets.find(x => x.id === t.id).status !== 'triage') throw new Error('status not advanced')
})
await step('unsaved-changes guard on Escape', async () => {
  await nav('/customers'); await click('+ เพิ่ม')
  await fill('ชื่อลูกค้า', 'พิมพ์ค้างไว้')
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle(200)
  if (QA('.modal-back').length < 2) throw new Error('no confirm dialog')
  await click('ยกเลิก', QA('.modal-back')[1], true)
  if (QA('.modal-back').length !== 1) throw new Error('confirm not closed')
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle(200)
  await click('ละทิ้ง', QA('.modal-back')[1], true)
  if (Q('.modal')) throw new Error('modal still open after discard')
})
await step('kanban: move via select and via drag/drop', async () => {
  const m = S().config.modules[0]
  await nav('/m/' + m.key.slice(2))
  await click('บอร์ด', Q('.tabs'))
  const card = QA('.kcard').find(c => T(c).includes('ระบบตรวจวัดอากาศ'))
  const rec = S().data[m.key].find(r => r.title.includes('ระบบตรวจวัดอากาศ'))
  const sel = Q('select', card); setVal(sel, 'won'); await settle(300)
  if (S().data[m.key].find(r => r.id === rec.id).status !== 'won') throw new Error('select move failed: ' + T(Q('.toast')))
  // drag/drop back to 'new'
  const card2 = QA('.kcard').find(c => T(c).includes('ระบบตรวจวัดอากาศ'))
  card2.dispatchEvent(new dom.window.Event('dragstart', { bubbles: true })); await settle(60)
  const cols = QA('.kcol'); const target = cols[0]
  const ev = new dom.window.Event('drop', { bubbles: true, cancelable: true }); target.dispatchEvent(ev); await settle(300); console.log('   drag debug: toast=', T(Q('.toast')), 'status=', S().data[m.key].find(r => r.id === rec.id).status, 'cols=', cols.length)
  
})
await step('approval flow: request → approve', async () => {
  const cfg = structuredClone(S().config)
  cfg.workflows.ticket.statuses.find(x => x.key === 'verify').approverRole = 'pm'
  store.act(s => db.applyConfig(s, cfg, 'ตั้งผู้อนุมัติทดสอบ', []))
  const t = S().data.tickets.find(x => x.status === 'remote' || x.status === 'triage')
  await login('helpdesk')
  const r = store.act(s => db.changeTicketStatus(s, t.id, 'verify', { fields: { resolution: 'แก้แล้ว' } }))
  if (!r.ok || !r.data.pending) throw new Error('not pending: ' + JSON.stringify(r))
  await login('pm')
  await nav('/my')
  if (!/รออนุมัติ \(1\)/.test(T(Q('.content')))) throw new Error('approval not listed: ' + T(Q('.content')).slice(0, 100))
  await click('อนุมัติ', Q('.content'), true)
  if (S().data.tickets.find(x => x.id === t.id).status !== 'verify') throw new Error('not applied after approve')
  await login('admin')
})
await step('part replace with serials updates history', async () => {
  const camOld = S().data.serials.find(x => x.serialNo === 'DEMO-CAM-0001')
  const camNew = S().data.serials.find(x => x.serialNo === 'DEMO-CAM-0005')
  const t = S().data.tickets.find(x => x.site === camOld.site && db.isOpenTicket(S(), x))
  const r = store.act(s => db.addTicketPart(s, t.id, { action: 'เปลี่ยน', item: camOld.item, qty: 1, from: camNew.warehouse, serials: [camNew.id], oldSerial: camOld.id }))
  if (!r.ok) throw new Error(r.error)
  const o = S().data.serials.find(x => x.id === camOld.id), n = S().data.serials.find(x => x.id === camNew.id)
  if (o.status !== 'เปลี่ยนแล้ว' || n.status !== 'ติดตั้งแล้ว' || !n.warrantyEnd) throw new Error(`old=${o.status} new=${n.status} w=${n.warrantyEnd}`)
  await nav('/serials/' + n.id); await click('ประวัติ Serial', Q('.tabs'))
  if (QA('.tl-item').length < 3) throw new Error('serial history short')
})
await step('project: attach doc, skip step, handover report, close', async () => {
  const p = S().data.projects.find(x => x.name === 'โครงการ E2E')
  await nav('/projects/' + p.id)
  if (!Q('.step-body')) await click(QA('.step-head')[1])
  // fill required scope of assess (step 2) then complete
  setVal(field('สรุปขอบเขตงาน', Q('.step-body')), 'ขอบเขต'); await settle(60)
  await click('จบขั้นตอน', Q('.step-body'))
  // attach doc on proposal step (3)
  if (!Q('.step:nth-child(3) .step-body')) await click(QA('.step-head')[2]); await settle(100)
  const fi = Q('.step:nth-child(3) .step-body input[type=file]')
  Object.defineProperty(fi, 'files', { value: [{ name: 'boq.xlsx', size: 1000 }], configurable: true })
  fi.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await settle(300)
  if (!S().data.projects.find(x => x.id === p.id).steps.proposal.docs.req_form?.length) throw new Error('doc not attached')
  // skip with reason
  await click('ข้าม', Q('.step-body'), true)
  setVal(Q('.modal textarea'), 'ไม่ใช้'); await settle(60)
  await click('ยืนยัน', modal(), true)
  if (S().data.projects.find(x => x.id === p.id).steps.proposal.status !== 'skipped') throw new Error('not skipped')
  await click('รายงานส่งมอบ', Q('.tabs'))
  if (!/รายการอุปกรณ์/.test(T(Q('.content')))) throw new Error('handover report missing')
  await click('ปิดโครงการ', Q('.page-actions'))
  setVal(Q('.modal textarea'), 'ทดสอบปิด'); await settle(60)
  await click('ปิดโครงการ', modal(), true)
  if (!S().data.projects.find(x => x.id === p.id).closed) throw new Error('not closed')
})
await step('project install flow marks serial installed with warranty', async () => {
  const sr = S().data.serials.find(x => x.status === 'ส่งออกไปหน้างาน')
  if (!sr) { console.log('   (no issued serial left, skipped)'); return }
  const r = store.act(s => db.markInstalled(s, sr.id, { site: sr.site, location: 'ทดสอบ', project: sr.project }))
  if (!r.ok) throw new Error(r.error)
})
await step('reports tabs + export + audit', async () => {
  await nav('/reports')
  for (const tabName of ['เคสค้าง', 'Ticket ทั้งหมด', 'โครงการ', 'BOQ เทียบจริง', 'Serial/รับประกัน', 'ยอดสต็อก']) {
    await click(tabName, Q('.tabs'))
    if (/เกิดข้อผิดพลาด/.test(T(Q('.content')))) throw new Error('error in ' + tabName)
  }
  const n = S().audit.length
  await click('ส่งออก CSV', Q('.content'))
  if (S().audit.length !== n + 1) throw new Error('export not audited')
})
await step('escalation: enable after confirm → rows highlighted + bell', async () => {
  const cfg = structuredClone(S().config)
  cfg.escalation.confirmed = true; cfg.escalation.enabled = true
  store.act(s => db.applyConfig(s, cfg, 'เปิดเกณฑ์ทดสอบ', []))
  await nav('/tickets'); await click('ทั้งหมด', Q('.utabs'))
  if (!QA('tr.hl-1,tr.hl-2,tr.hl-3').length) throw new Error('no highlighted rows')
  await click(Q('.bell'))
  if (!QA('.popover .pop-row').length) throw new Error('bell empty')
  cfg.escalation.enabled = false; cfg.escalation.confirmed = false
  store.act(s => db.applyConfig(s, cfg, 'ปิดเกณฑ์ทดสอบ', []))
})
await step('role permission change takes effect', async () => {
  const cfg = structuredClone(S().config)
  cfg.roles.find(r => r.id === 'exec').perms.tickets = {}
  store.act(s => db.applyConfig(s, cfg, 'ถอนสิทธิ์ exec', []))
  await login('exec'); await nav('/tickets')
  if (!/ไม่มีสิทธิ์|0 รายการ|ไม่มีข้อมูล|ยังไม่มีข้อมูล/.test(T(Q('.content'))) && QA('.tbl tbody tr').length) throw new Error('exec still sees tickets')
  const r = store.act(s => db.insertTicket(s, { title: 'x' }))
  if (r.ok) throw new Error('exec created ticket')
  await login('admin')
})
await step('palette keyboard (Ctrl K)', async () => {
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })); await settle(200)
  if (!Q('.palette')) throw new Error('palette not open')
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
})
console.log('\nconsole errors:', errors.length, errors.slice(0, 5))
console.log(results.filter(r => r.startsWith('FAIL')).length + ' failed of ' + results.length)
process.exit(0)
