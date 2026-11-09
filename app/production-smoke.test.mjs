import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const appDir = path.dirname(fileURLToPath(import.meta.url))
const bundleName = fs.readdirSync(path.join(appDir, 'dist', 'assets')).find(name => name.endsWith('.js') && name.startsWith('index-'))
assert.ok(bundleName, 'production bundle is required; run npm run build first')
const bundle = fs.readFileSync(path.join(appDir, 'dist', 'assets', bundleName), 'utf8')

function createDom(url, run = true) {
  const dom = new JSDOM('<!doctype html><html lang="th"><body><div id="root"></div></body></html>', {
    url,
    runScripts: 'dangerously',
    pretendToBeVisual: true
  })
  dom.window.structuredClone = structuredClone
  dom.window.scrollTo = () => {}
  dom.window.requestAnimationFrame = callback => setTimeout(() => callback(Date.now()), 0)
  dom.window.cancelAnimationFrame = id => clearTimeout(id)
  if (run) dom.window.eval(bundle)
  return dom
}

function setInput(dom, id, value) {
  const input = dom.window.document.getElementById(id)
  assert.ok(input, `input #${id} should exist`)
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
}

async function submitLogin(dom) {
  const form = dom.window.document.querySelector('form.login-card')
  assert.ok(form, 'login form should exist')
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
  await new Promise(resolve => setTimeout(resolve, 40))
}

test('first-run UI rejects weak passwords and creates a real admin account', async () => {
  const dom = createDom('http://sjp-first-run.test/')
  await new Promise(resolve => setTimeout(resolve, 40))
  assert.match(dom.window.document.body.textContent, /เริ่มต้นด้วยฐานข้อมูลว่าง/)
  assert.doesNotMatch(dom.window.document.body.textContent, /ข้อมูลจำลอง|บัญชีสำหรับทดลอง/)

  setInput(dom, 'ln', 'ผู้ดูแลระบบ')
  setInput(dom, 'lu', 'owner')
  setInput(dom, 'lp', 'short')
  setInput(dom, 'lcp', 'short')
  await submitLogin(dom)
  assert.match(dom.window.document.body.textContent, /รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร/)

  setInput(dom, 'lp', 'secure-pass-123')
  setInput(dom, 'lcp', 'secure-pass-123')
  await submitLogin(dom)
  assert.match(dom.window.document.body.textContent, /สวัสดี/)

  const stored = JSON.parse(dom.window.localStorage.getItem('sjp-erp-state-v1'))
  assert.equal(stored.schema, 5)
  assert.equal(stored.users.length, 1)
  assert.equal(Object.values(stored.data).reduce((total, rows) => total + rows.length, 0), 0)
  dom.window.close()
})

test('persisted accounts show login mode and reject a wrong password', async () => {
  const source = createDom('http://sjp-persist-source.test/')
  await new Promise(resolve => setTimeout(resolve, 20))
  setInput(source, 'ln', 'ผู้ดูแลระบบ')
  setInput(source, 'lu', 'owner')
  setInput(source, 'lp', 'secure-pass-123')
  setInput(source, 'lcp', 'secure-pass-123')
  await submitLogin(source)
  const payload = source.window.localStorage.getItem('sjp-erp-state-v1')
  const loggedOutPayload = { ...JSON.parse(payload), session: null }

  const dom = createDom('http://sjp-persisted.test/', false)
  dom.window.localStorage.setItem('sjp-erp-state-v1', JSON.stringify(loggedOutPayload))
  dom.window.eval(bundle)
  await new Promise(resolve => setTimeout(resolve, 40))
  assert.match(dom.window.document.body.textContent, /เข้าสู่ระบบเพื่อจัดการข้อมูลของบริษัท/)
  assert.doesNotMatch(dom.window.document.body.textContent, /เริ่มต้นด้วยฐานข้อมูลว่าง/)

  setInput(dom, 'lu', 'owner')
  setInput(dom, 'lp', 'wrong-password')
  await submitLogin(dom)
  assert.match(dom.window.document.body.textContent, /ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง/)
  source.window.close()
  dom.window.close()
})
