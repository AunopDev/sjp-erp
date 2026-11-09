import { useSyncExternalStore } from 'react'
import { buildSeed, SCHEMA_VERSION } from './seed.js'
import { syncModules } from './schema.js'
import { newPlatform } from '../platform/core.js'
import { bootstrapPlatform } from '../platform/lifecycle.js'

const KEY = 'sjp-erp-state-v1'
const subs = new Set()
let state
let persistError = ''

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function migrateLegacyState(value) {
  if (!isRecord(value) || value.schema !== 4) return null

  const next = structuredClone(value)
  const seededUserIds = new Set((Array.isArray(next.users) ? next.users : []).filter(user => user?._demo).map(user => user.id))
  next.users = (Array.isArray(next.users) ? next.users : []).filter(user => !user?._demo)
  next.data = Object.fromEntries(Object.entries(isRecord(next.data) ? next.data : {}).map(([entity, rows]) => [
    entity,
    Array.isArray(rows) ? rows.filter(row => !row?._demo) : []
  ]))
  next.audit = (Array.isArray(next.audit) ? next.audit : []).filter(entry => entry.action !== 'seed' && !String(entry.summary || '').includes('ข้อมูลจำลอง'))
  next.session = seededUserIds.has(next.session) ? null : next.session
  next.schema = SCHEMA_VERSION
  delete next.seededAt
  return next
}

// states saved before the module platform existed get a fresh platform (one company, three sample modules)
function withPlatform(st) {
  if (!st.platform || !Array.isArray(st.platform.companies)) st.platform = bootstrapPlatform(newPlatform())
  return st
}

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw)
      if (p && p.schema === SCHEMA_VERSION) return withPlatform(p)
      const migrated = migrateLegacyState(p)
      if (migrated) return withPlatform(migrated)
    }
  } catch (e) { /* fall through to seed */ }
  return buildSeed()
}
state = load()
syncModules(state.config)

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    persistError = ''
  } catch (e) {
    persistError = 'บันทึกลงเบราว์เซอร์ไม่สำเร็จ (พื้นที่เต็ม?)'
  }
}
persist()

export const getState = () => state
export const getPersistError = () => persistError
const subscribe = fn => { subs.add(fn); return () => subs.delete(fn) }
export const useStore = () => useSyncExternalStore(subscribe, getState)

// Runs fn on a copy of the state; if it throws nothing is changed.
export function mutate(fn) {
  const draft = structuredClone(state)
  const out = fn(draft)
  state = draft
  syncModules(state.config)
  persist()
  subs.forEach(f => f())
  return out
}

// UI-friendly wrapper: never throws
export function act(fn) {
  try {
    return { ok: true, data: mutate(fn) }
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e), fieldErrors: e && e.fieldErrors }
  }
}

export function resetApplicationData() {
  state = buildSeed()
  syncModules(state.config)
  persist()
  subs.forEach(f => f())
}

export function exportBackup() {
  return JSON.stringify(state, null, 1)
}
