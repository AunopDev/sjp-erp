import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSeed } from './seed.js'
import { login, setupAdmin } from './db.js'

test('starts with an empty production state', () => {
  const state = buildSeed()
  const recordCount = Object.values(state.data).reduce((total, rows) => total + rows.length, 0)

  assert.equal(state.users.length, 0)
  assert.equal(state.session, null)
  assert.equal(recordCount, 0)
})

test('creates the first administrator without demo credentials', () => {
  const state = buildSeed()
  const user = setupAdmin(state, { username: 'owner', name: 'ผู้ดูแลระบบ', password: 'secure-pass-123' })

  assert.equal(user.username, 'owner')
  assert.equal(user.roleId, 'admin')
  assert.equal(state.session, user.id)
  assert.doesNotThrow(() => login(state, 'owner', 'secure-pass-123'))
  assert.throws(() => login(state, 'owner', 'wrong-password'), /ไม่ถูกต้อง/)
})

test('migrates legacy demo rows without removing user-created rows', async () => {
  const legacy = buildSeed()
  legacy.schema = 4
  legacy.users.push({ id: 'u-demo', _demo: true }, { id: 'u-real', name: 'ผู้ใช้จริง' })
  legacy.session = 'u-demo'
  legacy.data.customers.push({ id: 'demo-customer', _demo: true }, { id: 'real-customer', name: 'ลูกค้าจริง' })
  legacy.audit.push({ action: 'seed', summary: 'สร้างข้อมูลตัวอย่าง (ข้อมูลจำลอง)' }, { action: 'create', summary: 'สร้างลูกค้าจริง' })

  const storage = new Map([['sjp-erp-state-v1', JSON.stringify(legacy)]])
  globalThis.localStorage = {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value)
  }
  const { getState } = await import(`./store.js?legacy-test-${Date.now()}`)
  const migrated = getState()

  assert.equal(migrated.schema, 5)
  assert.deepEqual(migrated.users.map(user => user.id), ['u-real'])
  assert.deepEqual(migrated.data.customers.map(customer => customer.id), ['real-customer'])
  assert.equal(migrated.session, null)
  assert.deepEqual(migrated.audit.map(entry => entry.action), ['create'])
  delete globalThis.localStorage
})
