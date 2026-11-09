// Opens the production bundle in jsdom and drives the metadata-driven screens like a user.
// Run `npm run build` first.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const appDir = path.dirname(fileURLToPath(import.meta.url))
const bundleName = fs.readdirSync(path.join(appDir, 'dist', 'assets')).find(n => n.endsWith('.js') && n.startsWith('index-'))
assert.ok(bundleName, 'production bundle is required; run npm run build first')
const bundle = fs.readFileSync(path.join(appDir, 'dist', 'assets', bundleName), 'utf8')
const wait = (ms = 60) => new Promise(r => setTimeout(r, ms))

function createDom(url) {
  const dom = new JSDOM('<!doctype html><html lang="th"><body><div id="root"></div></body></html>', { url, runScripts: 'dangerously', pretendToBeVisual: true })
  dom.window.structuredClone = structuredClone
  dom.window.scrollTo = () => {}
  dom.window.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0)
  dom.window.cancelAnimationFrame = id => clearTimeout(id)
  dom.window.eval(bundle)
  return dom
}
function setValue(dom, el, value) {
  const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
  el.dispatchEvent(new dom.window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
}
const byId = (dom, id) => { const el = dom.window.document.getElementById(id); assert.ok(el, `#${id} should exist`); return el }
const button = (dom, text) => [...dom.window.document.querySelectorAll('button, a.btn')].find(b => b.textContent.trim() === text || b.textContent.trim().includes(text))
async function click(dom, text) {
  const b = button(dom, text)
  assert.ok(b, `button "${text}" should exist`)
  b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
  await wait()
}
async function go(dom, hash) { dom.window.location.hash = hash; await wait(220) }
const text = dom => dom.window.document.body.textContent

async function loggedIn() {
  const dom = createDom('http://sjp-platform-ui.test/')
  await wait(40)
  setValue(dom, byId(dom, 'ln'), 'ผู้ดูแลระบบ')
  setValue(dom, byId(dom, 'lu'), 'owner')
  setValue(dom, byId(dom, 'lp'), 'secure-pass-123')
  setValue(dom, byId(dom, 'lcp'), 'secure-pass-123')
  dom.window.document.querySelector('form.login-card').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
  await wait(80)
  return dom
}

test('module screens render from definitions without errors', async () => {
  const dom = await loggedIn()
  await go(dom, '#/platform')
  for (const t of ['สินค้า/คลัง', 'จัดซื้อ', 'บัญชีเบื้องต้น', 'ถอด']) assert.match(text(dom), new RegExp(t))
  assert.doesNotMatch(text(dom), /เกิดข้อผิดพลาด:/)
  // menus generated from module definitions appear in the full menu
  await click(dom, 'เมนู')
  for (const t of ['ใบสั่งซื้อ', 'ยอดคงเหลือ', 'งบทดลอง', 'Module Builder']) assert.match(text(dom), new RegExp(t))
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  for (const route of ['#/p/inventory/product', '#/p/purchasing/order', '#/p/accounting/journal', '#/p/accounting/r/trialBalance', '#/p/inventory/r/balance', '#/p/inventory/pendingReceipt', '#/platform/builder']) {
    await go(dom, route)
    assert.doesNotMatch(text(dom), /เกิดข้อผิดพลาด:/, route)
  }
  dom.window.close()
})

test('a generated form saves a record and the list shows it', async () => {
  const dom = await loggedIn()
  await go(dom, '#/p/inventory/product/new')
  assert.match(text(dom), /รหัสสินค้า/)
  await click(dom, 'บันทึก')
  assert.match(text(dom), /กรุณากรอก/) // required fields are enforced by the definition
  setValue(dom, byId(dom, 'pf-sku'), 'CAB-9')
  setValue(dom, byId(dom, 'pf-name'), 'สายไฟ')
  await click(dom, 'บันทึก')
  await wait(200)
  assert.match(dom.window.location.hash, /#\/p\/inventory\/product\/[0-9a-f-]+/)
  assert.match(text(dom), /PRD-0001/)
  await go(dom, '#/p/inventory/product')
  assert.match(text(dom), /สายไฟ/)
  dom.window.close()
})

test('the Module Builder creates an entity by parts and the new list page works at once', async () => {
  const dom = await loggedIn()
  await go(dom, '#/platform/builder')
  setValue(dom, dom.window.document.querySelector('input[aria-label="new module title"]'), 'ทะเบียนเครื่องมือ')
  await click(dom, 'สร้างโมดูล')
  await wait(100)
  // the editor for the first document opens by itself after the module is created
  setValue(dom, byId(dom, 'en-th'), 'เครื่องมือ')
  setValue(dom, byId(dom, 'en-px'), 'TL')
  dom.window.document.querySelector('[data-testid="part-text"]').click(); await wait()
  dom.window.document.querySelector('[data-testid="part-money"]').click(); await wait()
  assert.equal(dom.window.document.querySelectorAll('[data-testid="canvas"] .bf').length, 2)
  setValue(dom, byId(dom, 'p-th'), 'ราคา')
  await click(dom, 'บันทึกและใช้งานทันที')
  await wait(100)
  assert.match(text(dom), /เผยแพร่แล้ว/)
  const link = [...dom.window.document.querySelectorAll('a')].find(a => a.textContent.includes('เปิดหน้ารายการ'))
  assert.ok(link, 'link to the generated list page')
  await go(dom, link.getAttribute('href'))
  assert.doesNotMatch(text(dom), /เกิดข้อผิดพลาด:/)
  assert.match(text(dom), /เครื่องมือ/)
  assert.match(text(dom), /สร้างใหม่/)
  dom.window.close()
})

test('a template gives a ready module with statuses, and the approval button works on the generated page', async () => {
  const dom = await loggedIn()
  // the home page promotes the builder
  assert.match(text(dom), /สร้างโมดูลของคุณเอง/)
  await go(dom, '#/platform/builder?template=request')
  await wait(150)
  assert.match(dom.window.document.getElementById('st-text').value, /รออนุมัติ/)
  assert.match(text(dom), /ร่าง/)
  await click(dom, 'บันทึกและใช้งานทันที')
  await wait(100)
  assert.match(text(dom), /เผยแพร่แล้ว/)
  const add = [...dom.window.document.querySelectorAll('a')].find(a => a.textContent.includes('เพิ่มข้อมูลชิ้นแรก'))
  await go(dom, add.getAttribute('href'))
  setValue(dom, byId(dom, 'pf-title'), 'ซื้อโน้ตบุ๊ก')
  await click(dom, 'บันทึก')
  await wait(200)
  assert.match(text(dom), /REQ-0001/)
  assert.match(text(dom), /ส่งต่อ → รออนุมัติ/)
  await click(dom, 'ส่งต่อ → รออนุมัติ')
  await wait(150)
  assert.match(text(dom), /อนุมัติ → อนุมัติแล้ว/) // the admin may approve
  await click(dom, 'อนุมัติ → อนุมัติแล้ว')
  await wait(150)
  assert.match(text(dom), /ถูกล็อก/)
  dom.window.close()
})
