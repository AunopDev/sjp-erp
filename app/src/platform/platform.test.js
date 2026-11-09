import test from 'node:test'
import assert from 'node:assert/strict'
import { newPlatform, createCompany, handle, bootstrapPlatform, registerPackage, registry, validateManifest, tr } from './index.js'
import { satisfies, cmpVer } from './util.js'
import inventory from './modules/inventory.js'

const owner = { id: 'u-owner', name: 'เจ้าของระบบ' }
const SUPER = { isSuper: true, user: owner }

// A platform with two companies (A, B). `modules` are installed in company A only.
function world(modules = []) {
  const P = newPlatform()
  const A = createCompany(P, SUPER, 'บริษัท เอ').id
  const B = createCompany(P, SUPER, 'บริษัท บี').id
  const ca = { company: A, ...SUPER }
  for (const m of modules) ok(handle(P, ca, 'POST', `/api/modules/${m}/install`))
  return { P, A, B, ca, cb: { company: B, ...SUPER } }
}
const ok = r => { assert.ok(r.status < 400, `expected success but got ${r.status}: ${JSON.stringify(r.body)}`); return r.body }
const bad = (r, status, text) => {
  assert.equal(r.status, status, `expected ${status} got ${r.status}: ${JSON.stringify(r.body)}`)
  if (text) assert.match(r.body.error.message, text instanceof RegExp ? text : new RegExp(text))
  return r.body.error
}
const person = (P, company, id, name, roles) => {
  P.members.push({ company, user: id, name, roles })
  return { company, user: { id, name } }
}
const post = (P, c, path, body) => handle(P, c, 'POST', path, body)

function makePo(P, ca, lines) {
  const vendor = ok(post(P, ca, '/api/data/purchasing/vendor', { name: 'บริษัท ผู้ขาย จำกัด' }))
  return ok(post(P, ca, '/api/data/purchasing/order', { vendor: vendor.id, lines }))
}

// ------------------------------------------------------------------ definitions
test('every definition carries a format version, and bad ones are explained in plain language', () => {
  assert.deepEqual(validateManifest(inventory), [])
  const noVersion = { ...inventory }; delete noVersion.formatVersion
  assert.match(validateManifest(noVersion).join('\n'), /formatVersion/)
  const future = { ...inventory, formatVersion: 99 }
  assert.match(validateManifest(future).join('\n'), /ใหม่กว่าที่ระบบรองรับ/)
  const badType = { ...inventory, entities: [{ ...inventory.entities[0], fields: [{ key: 'x', type: 'hologram', label: 'x' }] }] }
  assert.match(validateManifest(badType).join('\n'), /hologram/)
})

test('version ranges', () => {
  assert.ok(satisfies('1.2.0', '>=1.0.0'))
  assert.ok(!satisfies('0.9.0', '>=1.0.0'))
  assert.ok(satisfies('1.5.2', '^1.2.0'))
  assert.ok(!satisfies('2.0.0', '^1.2.0'))
  assert.ok(satisfies('1.2.9', '~1.2.0') && !satisfies('1.3.0', '~1.2.0'))
  assert.equal(cmpVer('1.10.0', '1.9.0'), 1)
})

test('first start installs the three sample modules in the default company', () => {
  const P = bootstrapPlatform(newPlatform())
  const reg = registry(P, P.companies[0].id)
  assert.deepEqual([...reg.active].sort(), ['accounting', 'inventory', 'purchasing'])
  assert.ok(P.data[P.companies[0].id]['accounting.account'].length >= 5, 'chart of accounts is seeded')
})

// ------------------------------------------------------------------ 1. builder
test('1. an entity made in the Builder immediately has a form, a list page and an API', () => {
  const { P, ca } = world()
  const { name } = ok(post(P, ca, '/api/builder/modules', { title: 'ทะเบียนเครื่องมือ' }))
  ok(handle(P, ca, 'PUT', `/api/builder/modules/${name}/entities`, {
    key: 'tool', label: { th: 'เครื่องมือ', en: 'Tool' }, prefix: 'TL',
    fields: [
      { key: 'title', type: 'text', label: { th: 'ชื่อเครื่องมือ', en: 'Tool name' }, required: true },
      { key: 'price', type: 'money', label: 'ราคา' },
      { key: 'kind', type: 'select', label: 'ประเภท', options: ['ไฟฟ้า', 'มือ'] },
      { key: 'bought', type: 'date', label: 'วันที่ซื้อ' }
    ]
  }))
  const id = `${name}.tool`
  // form: generated field list
  const screen = ok(handle(P, ca, 'GET', `/api/meta/screen/${name}/tool`))
  assert.deepEqual(screen.fields.map(f => f.key), ['title', 'price', 'kind', 'bought'])
  assert.ok(screen.can.create && screen.can.edit && screen.can.view)
  // menu / list page
  const menu = ok(handle(P, ca, 'GET', '/api/meta/menu'))
  assert.ok(menu.some(g => g.module === name && g.items.some(i => i.id === id)))
  // API: validation, create, list, read, update
  bad(post(P, ca, `/api/data/${name}/tool`, { price: 5 }), 422, 'ชื่อเครื่องมือ')
  const rec = ok(post(P, ca, `/api/data/${name}/tool`, { title: 'สว่านไฟฟ้า', price: '1,250.5', kind: 'ไฟฟ้า' }))
  assert.equal(rec.code, 'TL-0001')
  assert.equal(rec.price, 1250.5)
  bad(post(P, ca, `/api/data/${name}/tool`, { title: 'x', kind: 'ไม่มีในรายการ' }), 422)
  assert.equal(ok(handle(P, ca, 'GET', `/api/data/${name}/tool`)).total, 1)
  ok(handle(P, ca, 'PATCH', `/api/data/${name}/tool/${rec.id}`, { title: 'สว่านไร้สาย' }))
  assert.equal(ok(handle(P, ca, 'GET', `/api/data/${name}/tool/${rec.id}`)).title, 'สว่านไร้สาย')
})

test('1b. adding a field in the Builder keeps existing rows and bumps the module version', () => {
  const { P, ca } = world()
  const { name } = ok(post(P, ca, '/api/builder/modules', { title: 'งานซ่อม' }))
  const def = { key: 'job', label: 'งานซ่อม', prefix: 'JB', fields: [{ key: 'title', type: 'text', label: 'เรื่อง', required: true }] }
  ok(handle(P, ca, 'PUT', `/api/builder/modules/${name}/entities`, def))
  const rec = ok(post(P, ca, `/api/data/${name}/job`, { title: 'แอร์เสีย' }))
  def.fields.push({ key: 'level', type: 'select', label: 'ความเร่งด่วน', options: ['ปกติ', 'ด่วน'], default: 'ปกติ' })
  const saved = ok(handle(P, ca, 'PUT', `/api/builder/modules/${name}/entities`, def))
  assert.equal(saved.version, '1.2.0') // 1.0.0 → 1.1.0 (entity added) → 1.2.0 (field added)
  const again = ok(handle(P, ca, 'GET', `/api/data/${name}/job/${rec.id}`))
  assert.equal(again.title, 'แอร์เสีย')
  assert.equal(again.level, 'ปกติ')
  def.fields[0].type = 'number'
  bad(handle(P, ca, 'PUT', `/api/builder/modules/${name}/entities`, def), 422, 'ไม่อนุญาตให้เปลี่ยนชนิดฟิลด์')
})

test('1c. a Builder entity can get statuses and an approval step, and old rows join the workflow', () => {
  const { P, A, ca } = world()
  const { name } = ok(post(P, ca, '/api/builder/modules', { title: 'ใบขอใช้รถ' }))
  const def = { key: 'trip', label: 'ขอใช้รถ', prefix: 'TR', fields: [{ key: 'title', type: 'text', label: 'เรื่อง', required: true }] }
  ok(handle(P, ca, 'PUT', `/api/builder/modules/${name}/entities`, def))
  const old = ok(post(P, ca, `/api/data/${name}/trip`, { title: 'เรื่องเก่า' }))
  assert.equal(old.status, undefined)
  def.workflow = {
    initial: 's1',
    states: [{ key: 's1', label: 'ร่าง' }, { key: 's2', label: 'รออนุมัติ' }, { key: 's3', label: 'อนุมัติแล้ว', locked: true, final: true }],
    transitions: [
      { key: 'go2', label: 'ส่งขออนุมัติ', from: ['s1'], to: 's2' },
      { key: 'go3', label: 'อนุมัติ', from: ['s2'], to: 's3', approvers: { roles: ['approver'] } }
    ]
  }
  ok(handle(P, ca, 'PUT', `/api/builder/modules/${name}/entities`, def))
  const nowOld = ok(handle(P, ca, 'GET', `/api/data/${name}/trip/${old.id}`))
  assert.equal(nowOld.status, 's1')
  const user = person(P, A, 'u-user', 'ผู้ใช้', [`${name}.user`])
  const boss = person(P, A, 'u-boss', 'หัวหน้า', [`${name}.approver`])
  const mine = ok(post(P, user, `/api/data/${name}/trip`, { title: 'ไปต่างจังหวัด' }))
  ok(post(P, user, `/api/data/${name}/trip/${mine.id}/transition/go2`))
  bad(post(P, user, `/api/data/${name}/trip/${mine.id}/transition/go3`), 403, 'ผู้อนุมัติ')
  assert.equal(ok(post(P, boss, `/api/data/${name}/trip/${mine.id}/transition/go3`)).status, 's3')
  bad(handle(P, user, 'PATCH', `/api/data/${name}/trip/${mine.id}`, { title: 'x' }), 409)
})

// ------------------------------------------------------------------ 2. approval → event → inventory
test('2. approving a purchase order makes Inventory receive the event and create pending receipts', () => {
  const { P, A, ca } = world(['inventory', 'purchasing'])
  const buyer = person(P, A, 'u-buy', 'ผู้ซื้อ', ['purchasing.buyer'])
  const approver = person(P, A, 'u-app', 'ผู้อนุมัติ', ['purchasing.approver'])
  const p1 = ok(post(P, ca, '/api/data/inventory/product', { sku: 'CAB-01', name: 'สายแลน' }))
  const p2 = ok(post(P, ca, '/api/data/inventory/product', { sku: 'SW-08', name: 'สวิตช์ 8 พอร์ต' }))
  const po = makePo(P, buyer, [{ product: p1.id, qty: 10, unitPrice: 25 }, { product: p2.id, qty: 2, unitPrice: 900 }])
  assert.equal(po.total, 2050)
  assert.equal(po.status, 'draft')
  ok(post(P, buyer, `/api/data/purchasing/order/${po.id}/transition/submit`))
  // nothing in inventory yet, buyers cannot approve
  assert.equal(ok(handle(P, ca, 'GET', '/api/data/inventory/pendingReceipt')).total, 0)
  bad(post(P, buyer, `/api/data/purchasing/order/${po.id}/transition/approve`), 403, 'ผู้อนุมัติ')
  const approved = ok(post(P, approver, `/api/data/purchasing/order/${po.id}/transition/approve`, { comment: 'ตกลง' }))
  assert.equal(approved.status, 'approved')
  assert.equal(approved.approval_approvedBy, 'ผู้อนุมัติ')
  const pending = ok(handle(P, ca, 'GET', '/api/data/inventory/pendingReceipt', null, { sort: 'qty' })).items
  assert.equal(pending.length, 2)
  assert.deepEqual(pending.map(r => r.qty), [2, 10])
  assert.ok(pending.every(r => r.po === po.code && r.status === 'waiting'))
  const ev = ok(handle(P, ca, 'GET', '/api/events')).find(e => e.event === 'purchasing.order.approved')
  assert.ok(ev.deliveries.some(d => d.module === 'inventory' && d.ok))
  // approved orders are locked
  bad(handle(P, buyer, 'PATCH', `/api/data/purchasing/order/${po.id}`, { note: 'แก้' }), 409, 'ล็อก')
  // receiving a pending line creates a goods receipt and updates the balance
  ok(post(P, ca, `/api/data/inventory/pendingReceipt/${pending[1].id}/transition/receive`))
  const bal = ok(handle(P, ca, 'GET', '/api/reports/inventory/balance')).rows.find(r => r.key === p1.id)
  assert.equal(bal.value, 10)
})

test('2b. a rejected order needs a reason and creates nothing in inventory', () => {
  const { P, A, ca } = world(['inventory', 'purchasing'])
  const approver = person(P, A, 'u-app', 'ผู้อนุมัติ', ['purchasing.approver'])
  const p = ok(post(P, ca, '/api/data/inventory/product', { sku: 'A', name: 'A' }))
  const po = makePo(P, ca, [{ product: p.id, qty: 1, unitPrice: 10 }])
  ok(post(P, ca, `/api/data/purchasing/order/${po.id}/transition/submit`))
  bad(post(P, approver, `/api/data/purchasing/order/${po.id}/transition/reject`), 422, 'เหตุผล')
  ok(post(P, approver, `/api/data/purchasing/order/${po.id}/transition/reject`, { comment: 'แพงไป' }))
  assert.equal(ok(handle(P, ca, 'GET', '/api/data/inventory/pendingReceipt')).total, 0)
})

test('2c. issuing more than the balance is refused', () => {
  const { P, ca } = world(['inventory'])
  const p = ok(post(P, ca, '/api/data/inventory/product', { sku: 'A', name: 'A' }))
  ok(post(P, ca, '/api/data/inventory/receipt', { product: p.id, qty: 5 }))
  bad(post(P, ca, '/api/data/inventory/issue', { product: p.id, qty: 6 }), 422, 'ยอดคงเหลือไม่พอ')
  ok(post(P, ca, '/api/data/inventory/issue', { product: p.id, qty: 5 }))
  assert.equal(ok(handle(P, ca, 'GET', '/api/reports/inventory/balance')).rows[0].value, 0)
})

// ------------------------------------------------------------------ 3. uninstall
test('3. removing Purchasing leaves Inventory and Accounting fully working', () => {
  const { P, ca } = world(['inventory', 'purchasing', 'accounting'])
  const p = ok(post(P, ca, '/api/data/inventory/product', { sku: 'A', name: 'A' }))
  makePo(P, ca, [{ product: p.id, qty: 1, unitPrice: 10 }])
  // inventory cannot go while purchasing needs it
  bad(post(P, ca, '/api/modules/inventory/uninstall'), 409, /ยังต้องพึ่งพา.*จัดซื้อ/s)
  bad(post(P, ca, '/api/modules/inventory/disable'), 409, 'จัดซื้อ')
  ok(post(P, ca, '/api/modules/purchasing/uninstall'))
  bad(handle(P, ca, 'GET', '/api/data/purchasing/order'), 404, 'ไม่ได้ติดตั้ง')
  // inventory still works (and keeps its event subscription harmlessly)
  ok(post(P, ca, '/api/data/inventory/receipt', { product: p.id, qty: 3 }))
  assert.equal(ok(handle(P, ca, 'GET', '/api/reports/inventory/balance')).rows[0].value, 3)
  // accounting still works
  const [cash, sales] = ok(handle(P, ca, 'GET', '/api/data/accounting/account', null, { sort: 'code' })).items
  ok(post(P, ca, '/api/data/accounting/journal', { memo: 'ขายสด', lines: [{ account: cash.id, debit: 100 }, { account: sales.id, credit: 100 }] }))
  assert.equal(ok(handle(P, ca, 'GET', '/api/data/accounting/journal')).total, 1)
  // the menu no longer offers purchasing
  assert.ok(!ok(handle(P, ca, 'GET', '/api/meta/menu')).some(g => g.module === 'purchasing'))
  // reinstalling brings the old purchase orders back
  const back = ok(post(P, ca, '/api/modules/purchasing/install'))
  assert.equal(back.restored, 2)
  assert.equal(ok(handle(P, ca, 'GET', '/api/data/purchasing/order')).total, 1)
})

test('3b. disabling and re-enabling a module', () => {
  const { P, ca } = world(['inventory', 'purchasing'])
  ok(post(P, ca, '/api/modules/purchasing/disable'))
  bad(handle(P, ca, 'GET', '/api/data/purchasing/order'), 404)
  ok(post(P, ca, '/api/modules/inventory/disable'))
  bad(post(P, ca, '/api/modules/purchasing/enable'), 409, 'ปิดใช้งานอยู่')
  ok(post(P, ca, '/api/modules/inventory/enable'))
  ok(post(P, ca, '/api/modules/purchasing/enable'))
  assert.equal(ok(handle(P, ca, 'GET', '/api/data/purchasing/order')).total, 0)
})

// ------------------------------------------------------------------ 4. missing dependency
test('4. installing a module with a missing dependency is refused with a readable reason, and the system keeps running', () => {
  const { P, A, ca } = world(['accounting'])
  const err = bad(post(P, ca, '/api/modules/purchasing/install'), 409)
  assert.match(err.message, /ไม่สามารถติดตั้งโมดูล “จัดซื้อ” \(purchasing\)/)
  assert.match(err.message, /“สินค้า\/คลัง” \(inventory\) เวอร์ชัน >=1\.0\.0/)
  assert.match(err.message, /ยังไม่ได้ติดตั้ง/)
  assert.equal(err.code, 'DEPENDENCY')
  assert.ok(!registry(P, A).modules.purchasing, 'nothing was half-installed')
  // other modules still fine
  assert.equal(ok(handle(P, ca, 'GET', '/api/data/accounting/account')).total, 8)
  // once the dependency is there it works
  ok(post(P, ca, '/api/modules/inventory/install'))
  ok(post(P, ca, '/api/modules/purchasing/install'))
  // a disabled dependency is explained too
  ok(post(P, ca, '/api/modules/purchasing/disable'))
  ok(post(P, ca, '/api/modules/inventory/disable'))
  bad(post(P, ca, '/api/modules/purchasing/enable'), 409, 'ปิดใช้งานอยู่')
  // unknown module / broken input never crash
  bad(post(P, ca, '/api/modules/ghost/install'), 404, 'ไม่พบแพ็กเกจ')
  assert.equal(handle(P, ca, 'GET', '/api/nope').status, 404)
})

test('4b. a corrupted installed state degrades instead of crashing', () => {
  const { P, A, ca } = world(['inventory', 'purchasing'])
  delete P.installed[A].inventory // e.g. a hand-edited backup
  const reg = registry(P, A)
  assert.deepEqual(reg.blocked.purchasing, ['inventory'])
  const mods = ok(handle(P, ca, 'GET', '/api/modules'))
  assert.equal(mods.find(m => m.name === 'purchasing').status, 'blocked')
  bad(handle(P, ca, 'GET', '/api/data/purchasing/order'), 404)
})

// ------------------------------------------------------------------ 5. upgrade
test('5. upgrading a module that adds a field keeps all old data', () => {
  const { P, ca } = world(['inventory'])
  const a = ok(post(P, ca, '/api/data/inventory/product', { sku: 'A-1', name: 'สินค้า เอ', category: 'ทั่วไป' }))
  const b = ok(post(P, ca, '/api/data/inventory/product', { sku: 'B-2', name: 'สินค้า บี' }))
  ok(post(P, ca, '/api/data/inventory/receipt', { product: a.id, qty: 7 }))
  const v11 = JSON.parse(JSON.stringify(inventory))
  v11.version = '1.1.0'
  v11.entities[0].fields.push({ key: 'barcode', type: 'text', label: { th: 'บาร์โค้ด', en: 'Barcode' }, default: 'ไม่มี' })
  v11.migrations = [{ from: '1.0.0', to: '1.1.0', steps: [{ op: 'addField', entity: 'product', field: { key: 'barcode', type: 'text', default: 'ไม่มี' } }] }]
  registerPackage(P, ca, v11)
  const mod = ok(handle(P, ca, 'GET', '/api/modules')).find(m => m.name === 'inventory')
  assert.equal(mod.upgradeTo, '1.1.0')
  const res = ok(post(P, ca, '/api/modules/inventory/upgrade'))
  assert.deepEqual([res.from, res.to], ['1.0.0', '1.1.0'])
  const list = ok(handle(P, ca, 'GET', '/api/data/inventory/product', null, { sort: 'sku' })).items
  assert.deepEqual(list.map(r => [r.sku, r.name, r.category]), [['A-1', 'สินค้า เอ', 'ทั่วไป'], ['B-2', 'สินค้า บี', undefined]])
  assert.deepEqual(list.map(r => r.barcode), ['ไม่มี', 'ไม่มี'])
  assert.equal(list[0].id, a.id)
  assert.equal(ok(handle(P, ca, 'GET', '/api/reports/inventory/balance')).rows.find(r => r.key === a.id).value, 7)
  assert.ok(ok(handle(P, ca, 'GET', '/api/meta/screen/inventory/product')).fields.some(f => f.key === 'barcode'))
  ok(handle(P, ca, 'PATCH', `/api/data/inventory/product/${b.id}`, { barcode: '885' }))
  bad(post(P, ca, '/api/modules/inventory/upgrade'), 409, 'เวอร์ชันล่าสุดแล้ว')
})

test('5b. a failing migration changes nothing', () => {
  const { P, ca } = world(['inventory'])
  const a = ok(post(P, ca, '/api/data/inventory/product', { sku: 'A-1', name: 'A' }))
  const v12 = JSON.parse(JSON.stringify(inventory))
  v12.version = '1.2.0'
  v12.migrations = [{ from: '1.0.0', to: '1.2.0', steps: [{ op: 'explode', entity: 'product' }] }]
  registerPackage(P, ca, v12)
  bad(post(P, ca, '/api/modules/inventory/upgrade'), 400, 'ไม่รู้จัก')
  assert.equal(ok(handle(P, ca, 'GET', '/api/modules')).find(m => m.name === 'inventory').installedVersion, '1.0.0')
  assert.equal(ok(handle(P, ca, 'GET', `/api/data/inventory/product/${a.id}`)).name, 'A')
})

test('5c. upgrading is refused when another module needs the old version', () => {
  const { P, ca } = world(['inventory', 'purchasing'])
  const v2 = JSON.parse(JSON.stringify(inventory))
  v2.version = '2.0.0'
  const pur = JSON.parse(JSON.stringify(registry(P, ca.company).modules.purchasing.manifest))
  pur.dependsOn = [{ name: 'inventory', version: '^1.0.0' }]
  registry(P, ca.company).modules.purchasing.manifest = pur
  registerPackage(P, ca, v2)
  bad(post(P, ca, '/api/modules/inventory/upgrade'), 409, /จัดซื้อ.*ต้องการเวอร์ชัน/s)
})

// ------------------------------------------------------------------ 6. export / import
test('6. a module exported from one company imports into another and works like the original', () => {
  const { P, A, B, ca, cb } = world(['accounting'])
  const accts = ok(handle(P, ca, 'GET', '/api/data/accounting/account', null, { sort: 'code' })).items
  ok(post(P, ca, '/api/data/accounting/journal', { memo: 'ต้นฉบับ', lines: [{ account: accts[0].id, debit: 50 }, { account: accts[5].id, credit: 50 }] }))
  const pkg = ok(handle(P, ca, 'GET', '/api/modules/accounting/export', null, { includeData: 'true' }))
  assert.equal(pkg.kind, 'sjp-erp-module')
  assert.equal(pkg.formatVersion, 1)
  const text = JSON.stringify(pkg) // a single file
  // company B is untouched until the import
  bad(handle(P, cb, 'GET', '/api/data/accounting/journal'), 404)
  const res = ok(post(P, cb, '/api/modules/import', { package: text }))
  assert.deepEqual([res.name, res.action], ['accounting', 'installed'])
  // same screens, same rules
  assert.deepEqual(ok(handle(P, cb, 'GET', '/api/meta/screen/accounting/journal')).fields.map(f => f.key), ok(handle(P, ca, 'GET', '/api/meta/screen/accounting/journal')).fields.map(f => f.key))
  const bAccts = ok(handle(P, cb, 'GET', '/api/data/accounting/account', null, { sort: 'code' })).items
  assert.equal(bAccts.length, 8, 'data came along')
  bad(post(P, cb, '/api/data/accounting/journal', { memo: 'ไม่สมดุล', lines: [{ account: bAccts[0].id, debit: 50 }, { account: bAccts[5].id, credit: 40 }] }), 422, 'เดบิตรวม')
  const j = ok(post(P, cb, '/api/data/accounting/journal', { memo: 'ใน B', lines: [{ account: bAccts[0].id, debit: 70 }, { account: bAccts[5].id, credit: 70 }] }))
  ok(post(P, cb, `/api/data/accounting/journal/${j.id}/transition/post`))
  assert.equal(ok(handle(P, cb, 'GET', '/api/reports/accounting/trialBalance')).totals.debit, 70)
  // companies stay separate
  assert.equal(ok(handle(P, ca, 'GET', '/api/data/accounting/journal')).total, 1)
  assert.equal(ok(handle(P, cb, 'GET', '/api/data/accounting/journal')).total, 2) // 1 imported + 1 created in B
  bad(handle(P, ca, 'GET', `/api/data/accounting/journal/${j.id}`), 404) // B's own record is invisible from A
  void A; void B
})

test('6b. packages are checked: tampering, newer format, missing dependencies, builder modules', () => {
  const { P, ca, cb } = world(['inventory', 'purchasing'])
  const pkg = ok(handle(P, ca, 'GET', '/api/modules/purchasing/export'))
  bad(post(P, cb, '/api/modules/import', { package: { ...pkg, manifest: { ...pkg.manifest, version: '9.9.9' } } }), 422, 'checksum')
  bad(post(P, cb, '/api/modules/import', { package: { ...pkg, formatVersion: 7 } }), 422, 'ใหม่กว่า')
  bad(post(P, cb, '/api/modules/import', { package: 'not json' }), 422, 'JSON')
  bad(post(P, cb, '/api/modules/import', { package: pkg }), 409, 'สินค้า/คลัง')
  // a Builder module (with data) moves too
  const { name } = ok(post(P, ca, '/api/builder/modules', { title: 'งานทั่วไป' }))
  ok(handle(P, ca, 'PUT', `/api/builder/modules/${name}/entities`, { key: 'task', label: 'งาน', prefix: 'TS', fields: [{ key: 'title', type: 'text', label: 'เรื่อง', required: true }] }))
  ok(post(P, ca, `/api/data/${name}/task`, { title: 'งานแรก' }))
  const bp = ok(handle(P, ca, 'GET', `/api/modules/${name}/export`, null, { includeData: 'true' }))
  ok(post(P, cb, '/api/modules/import', { package: bp }))
  assert.equal(ok(handle(P, cb, 'GET', `/api/data/${name}/task`)).items[0].title, 'งานแรก')
  assert.equal(ok(post(P, cb, `/api/data/${name}/task`, { title: 'งานสอง' })).code, 'TS-0002')
})

// ------------------------------------------------------------------ 7. permissions
test('7. users without permission cannot see or change data — on screen metadata and through the API', () => {
  const { P, A, B, ca } = world(['inventory', 'purchasing', 'accounting'])
  const p = ok(post(P, ca, '/api/data/inventory/product', { sku: 'A', name: 'A' }))
  const nobody = person(P, A, 'u-none', 'ไม่มีสิทธิ์', [])
  const viewer = person(P, A, 'u-view', 'ผู้ดูคลัง', ['inventory.viewer'])
  const outsider = { company: A, user: { id: 'u-out', name: 'คนนอก' } }
  // screen: no menu, no screen metadata
  assert.deepEqual(ok(handle(P, nobody, 'GET', '/api/meta/menu')), [])
  bad(handle(P, nobody, 'GET', '/api/meta/screen/inventory/product'), 403)
  // API: read and write all refused
  bad(handle(P, nobody, 'GET', '/api/data/inventory/product'), 403)
  bad(handle(P, nobody, 'GET', `/api/data/inventory/product/${p.id}`), 403)
  bad(post(P, nobody, '/api/data/inventory/product', { sku: 'X', name: 'X' }), 403)
  bad(handle(P, nobody, 'PATCH', `/api/data/inventory/product/${p.id}`, { name: 'hack' }), 403)
  bad(handle(P, nobody, 'DELETE', `/api/data/inventory/product/${p.id}`), 403)
  bad(handle(P, nobody, 'GET', '/api/reports/inventory/balance'), 403)
  bad(handle(P, nobody, 'GET', '/api/audit'), 403)
  bad(post(P, nobody, '/api/modules/accounting/uninstall'), 403)
  // read-only role: sees, cannot write; screen says so
  const sc = ok(handle(P, viewer, 'GET', '/api/meta/screen/inventory/product'))
  assert.deepEqual(sc.can, { view: true, create: false, edit: false, delete: false })
  assert.equal(ok(handle(P, viewer, 'GET', '/api/data/inventory/product')).total, 1)
  bad(post(P, viewer, '/api/data/inventory/product', { sku: 'X', name: 'X' }), 403)
  bad(handle(P, viewer, 'PATCH', `/api/data/inventory/product/${p.id}`, { name: 'hack' }), 403)
  assert.ok(!ok(handle(P, viewer, 'GET', '/api/meta/menu')).some(g => g.module === 'accounting'))
  bad(handle(P, viewer, 'GET', '/api/data/accounting/account'), 403)
  assert.equal(ok(handle(P, ca, 'GET', `/api/data/inventory/product/${p.id}`)).name, 'A')
  // not a member of the company at all / not logged in / other company
  bad(handle(P, outsider, 'GET', '/api/data/inventory/product'), 403, 'ไม่ได้เป็นสมาชิก')
  bad(handle(P, { company: A }, 'GET', '/api/data/inventory/product'), 401)
  bad(handle(P, { company: B, user: viewer.user }, 'GET', '/api/data/inventory/product'), 403)
})

test('7b. record-level access: "own" scope and per-record access lists', () => {
  const { P, A, ca } = world(['inventory', 'purchasing'])
  const p = ok(post(P, ca, '/api/data/inventory/product', { sku: 'A', name: 'A' }))
  const r1 = person(P, A, 'u-r1', 'ผู้ขอ 1', ['purchasing.requester'])
  const r2 = person(P, A, 'u-r2', 'ผู้ขอ 2', ['purchasing.requester'])
  const buyer = person(P, A, 'u-b', 'ผู้ซื้อ', ['purchasing.buyer'])
  const vendor = ok(post(P, ca, '/api/data/purchasing/vendor', { name: 'V' }))
  const mine = ok(post(P, r1, '/api/data/purchasing/order', { vendor: vendor.id, lines: [{ product: p.id, qty: 1 }] }))
  const theirs = ok(post(P, r2, '/api/data/purchasing/order', { vendor: vendor.id, lines: [{ product: p.id, qty: 2 }] }))
  assert.deepEqual(ok(handle(P, r1, 'GET', '/api/data/purchasing/order')).items.map(r => r.id), [mine.id])
  bad(handle(P, r1, 'GET', `/api/data/purchasing/order/${theirs.id}`), 403, 'ระดับรายการข้อมูล')
  bad(handle(P, r1, 'PATCH', `/api/data/purchasing/order/${theirs.id}`, { note: 'x' }), 403)
  assert.equal(ok(handle(P, buyer, 'GET', '/api/data/purchasing/order')).total, 2)
  // owner shares one record with a specific user
  ok(handle(P, ca, 'PUT', `/api/data/purchasing/order/${theirs.id}/access`, { users: ['u-r1'] }))
  assert.equal(ok(handle(P, r1, 'GET', `/api/data/purchasing/order/${theirs.id}`)).id, theirs.id)
  // a restricted record hides from buyers who are not on the list
  ok(handle(P, ca, 'PUT', `/api/data/purchasing/order/${mine.id}/access`, { users: ['u-r1'] }))
  bad(handle(P, buyer, 'GET', `/api/data/purchasing/order/${mine.id}`), 403)
  assert.equal(ok(handle(P, buyer, 'GET', '/api/data/purchasing/order')).total, 0)
})

// ------------------------------------------------------------------ 8. accounting
test('8. a journal entry whose debit does not equal credit is rejected', () => {
  const { P, ca } = world(['accounting'])
  const [cash, , , , , sales] = ok(handle(P, ca, 'GET', '/api/data/accounting/account', null, { sort: 'code' })).items
  const err = bad(post(P, ca, '/api/data/accounting/journal', { memo: 'ผิด', lines: [{ account: cash.id, debit: 1000 }, { account: sales.id, credit: 900 }] }), 422)
  assert.equal(err.code, 'RULE_VIOLATION')
  assert.match(err.message, /เดบิตรวม 1,000\.00 ไม่เท่ากับเครดิตรวม 900\.00/)
  bad(post(P, ca, '/api/data/accounting/journal', { memo: 'บรรทัดเดียว', lines: [{ account: cash.id, debit: 5 }] }), 422)
  bad(post(P, ca, '/api/data/accounting/journal', { memo: 'ทั้งคู่', lines: [{ account: cash.id, debit: 5, credit: 5 }, { account: sales.id, credit: 0 }] }), 422)
  bad(post(P, ca, '/api/data/accounting/journal', { memo: 'ศูนย์', lines: [{ account: cash.id }, { account: sales.id }] }), 422)
  assert.equal(ok(handle(P, ca, 'GET', '/api/data/accounting/journal')).total, 0, 'nothing was stored')
  const good = ok(post(P, ca, '/api/data/accounting/journal', { memo: 'ถูกต้อง', lines: [{ account: cash.id, debit: 1000.5 }, { account: sales.id, credit: 1000.5 }] }))
  assert.equal(good.totalDebit, 1000.5)
  // editing cannot break the balance either
  bad(handle(P, ca, 'PATCH', `/api/data/accounting/journal/${good.id}`, { lines: [{ account: cash.id, debit: 10 }, { account: sales.id, credit: 9 }] }), 422)
  assert.equal(ok(handle(P, ca, 'GET', `/api/data/accounting/journal/${good.id}`)).totalDebit, 1000.5)
  // posting locks it; the trial balance only counts posted entries
  assert.equal(ok(handle(P, ca, 'GET', '/api/reports/accounting/trialBalance')).totals.debit, 0)
  ok(post(P, ca, `/api/data/accounting/journal/${good.id}/transition/post`))
  bad(handle(P, ca, 'PATCH', `/api/data/accounting/journal/${good.id}`, { memo: 'x' }), 409)
  bad(handle(P, ca, 'DELETE', `/api/data/accounting/journal/${good.id}`), 409)
  const tb = ok(handle(P, ca, 'GET', '/api/reports/accounting/trialBalance'))
  assert.deepEqual([tb.totals.debit, tb.totals.credit], [1000.5, 1000.5])
})

// ------------------------------------------------------------------ audit, events, companies
test('audit log records who changed what and when', () => {
  const { P, A, ca } = world(['inventory'])
  const keeper = person(P, A, 'u-k', 'สมชาย คลัง', ['inventory.keeper'])
  const rec = ok(post(P, keeper, '/api/data/inventory/product', { sku: 'A', name: 'ชื่อเดิม' }))
  ok(handle(P, keeper, 'PATCH', `/api/data/inventory/product/${rec.id}`, { name: 'ชื่อใหม่' }))
  const log = ok(handle(P, ca, 'GET', '/api/audit', null, { entity: 'inventory.product', recordId: rec.id }))
  assert.deepEqual(log.map(l => l.action), ['update', 'create'])
  assert.equal(log[0].userName, 'สมชาย คลัง')
  assert.equal(log[0].userId, 'u-k')
  assert.ok(!isNaN(new Date(log[0].at)))
  assert.deepEqual(log[0].changes.map(c => [c.field, c.from, c.to]), [['name', 'ชื่อเดิม', 'ชื่อใหม่']])
  bad(handle(P, keeper, 'GET', '/api/audit'), 403) // only admins read the whole log
  assert.equal(ok(handle(P, keeper, 'GET', '/api/audit', null, { entity: 'inventory.product' })).length, 2)
  assert.ok(ok(handle(P, ca, 'GET', '/api/audit')).some(l => l.action === 'module-install'))
})

test('a failing subscriber is isolated: the publisher still succeeds', () => {
  const { P, ca } = world(['inventory', 'purchasing'])
  const listener = JSON.parse(JSON.stringify({
    formatVersion: 1, name: 'listener', version: '1.0.0', title: 'ผู้ฟัง', dependsOn: [],
    entities: [{ formatVersion: 1, key: 'note', label: 'โน้ต', prefix: 'N', fields: [{ key: 'text', type: 'text', label: 'ข้อความ', required: true }] }],
    subscriptions: [{ event: 'purchasing.order.approved', action: { type: 'createRecord', entity: 'note', map: { text: '$nothing.here' } } }]
  }))
  registerPackage(P, ca, listener)
  ok(post(P, ca, '/api/modules/listener/install'))
  const p = ok(post(P, ca, '/api/data/inventory/product', { sku: 'A', name: 'A' }))
  const po = makePo(P, ca, [{ product: p.id, qty: 4, unitPrice: 1 }])
  ok(post(P, ca, `/api/data/purchasing/order/${po.id}/transition/submit`))
  ok(post(P, ca, `/api/data/purchasing/order/${po.id}/transition/approve`))
  const ev = ok(handle(P, ca, 'GET', '/api/events')).find(e => e.event === 'purchasing.order.approved')
  assert.ok(ev.deliveries.find(d => d.module === 'listener' && !d.ok), 'broken subscriber is reported')
  assert.ok(ev.deliveries.find(d => d.module === 'inventory' && d.ok), 'healthy subscriber still ran')
  assert.equal(ok(handle(P, ca, 'GET', '/api/data/inventory/pendingReceipt')).total, 1)
  assert.equal(ok(handle(P, ca, 'GET', '/api/data/listener/note')).total, 0)
})

test('companies are isolated and labels are bilingual', () => {
  const { P, ca, cb } = world(['inventory'])
  ok(post(P, cb, '/api/modules/inventory/install'))
  ok(post(P, ca, '/api/data/inventory/product', { sku: 'SAME', name: 'ของ A' }))
  ok(post(P, cb, '/api/data/inventory/product', { sku: 'SAME', name: 'ของ B' })) // unique per company
  assert.deepEqual(ok(handle(P, ca, 'GET', '/api/data/inventory/product')).items.map(r => r.name), ['ของ A'])
  assert.deepEqual(ok(handle(P, cb, 'GET', '/api/data/inventory/product')).items.map(r => r.name), ['ของ B'])
  bad(post(P, ca, '/api/data/inventory/product', { sku: 'same', name: 'ซ้ำ' }), 422, 'ซ้ำ')
  const f = ok(handle(P, ca, 'GET', '/api/meta/screen/inventory/product')).fields.find(x => x.key === 'sku')
  assert.equal(tr(f.label, 'th'), 'รหัสสินค้า (SKU)')
  assert.equal(tr(f.label, 'en'), 'SKU')
  const menu = ok(handle(P, ca, 'GET', '/api/meta/menu'))
  assert.equal(tr(menu[0].title, 'en'), 'Inventory')
  assert.equal(tr(menu[0].items[0].label, 'en'), 'Product')
})

test('line tables compute formulas and components expand into fields', () => {
  const { P, ca } = world(['inventory', 'purchasing'])
  const p = ok(post(P, ca, '/api/data/inventory/product', { sku: 'A', name: 'A' }))
  const v = ok(post(P, ca, '/api/data/purchasing/vendor', { name: 'V', addr_province: 'เชียงใหม่', addr_postcode: '50000' }))
  assert.equal(v.addr_province, 'เชียงใหม่')
  const po = ok(post(P, ca, '/api/data/purchasing/order', { vendor: v.id, lines: [{ product: p.id, qty: 3, unitPrice: '10.25' }, { product: p.id, qty: 2, unitPrice: 5 }] }))
  assert.deepEqual(po.lines.map(l => l.amount), [30.75, 10])
  assert.equal(po.total, 40.75)
  bad(post(P, ca, '/api/data/purchasing/order', { vendor: 'nope', lines: [{ product: p.id, qty: 1 }] }), 422)
  bad(post(P, ca, '/api/data/purchasing/order', { vendor: v.id, lines: [{ product: 'nope', qty: 1 }] }), 422)
  // submit needs lines with a value
  const empty = ok(post(P, ca, '/api/data/purchasing/order', { vendor: v.id, lines: [{ product: p.id, qty: 1 }] }))
  bad(post(P, ca, `/api/data/purchasing/order/${empty.id}/transition/submit`), 422, 'มากกว่า 0')
})
