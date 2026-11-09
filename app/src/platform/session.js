// Glue between the app's login session / store and the platform API (used only by the UI).
import { useCallback, useEffect, useState } from 'react'
import { act, getState, useStore } from '../lib/store.js'
import { cur, roleOf } from '../lib/db.js'
import { companiesFor } from './core.js'
import { handle } from './api.js'

const COMPANY_KEY = 'sjp-company', LANG_KEY = 'sjp-lang'
const read = (k, d) => { try { return localStorage.getItem(k) || d } catch (e) { return d } }
const listeners = new Set()
const emit = () => listeners.forEach(f => f())

export function ctxFor(s, company, lang) {
  const u = cur(s)
  if (!u) return null
  return { company, user: { id: u.id, name: u.name }, isSuper: !!roleOf(s)?.isAdmin, lang }
}
export function resolveCompany(s) {
  const base = ctxFor(s, null, 'th')
  if (!base || !s.platform) return null
  const list = companiesFor(s.platform, base)
  const saved = read(COMPANY_KEY, '')
  return (list.find(c => c.id === saved) || list[0] || {}).id || null
}

// Read-only call: runs against the current state without writing anything.
export function apiGet(path, query) {
  const s = getState()
  const company = resolveCompany(s)
  const ctx = ctxFor(s, company, read(LANG_KEY, 'th'))
  if (!ctx || !company) return { ok: false, status: 401, error: 'กรุณาเข้าสู่ระบบ' }
  const r = handle(s.platform, ctx, 'GET', path, null, query)
  return r.status < 400 ? { ok: true, data: r.body } : { ok: false, status: r.status, error: r.body.error.message, code: r.body.error.code }
}
// Write call: all-or-nothing through the store (a refused request leaves the state untouched).
export function apiSend(method, path, body, companyOverride) {
  const res = act(st => {
    const company = companyOverride || resolveCompany(st)
    const ctx = ctxFor(st, company, read(LANG_KEY, 'th'))
    if (!ctx) throw new Error('กรุณาเข้าสู่ระบบ')
    const r = handle(st.platform, ctx, method, path, body)
    if (r.status >= 400) {
      const e = new Error(r.body.error.message)
      e.fieldErrors = r.body.error.details?.fields
      e.code = r.body.error.code
      throw e
    }
    return r.body
  })
  return res
}

export function usePlatform() {
  const s = useStore()
  const [, tick] = useState(0)
  useEffect(() => { const f = () => tick(n => n + 1); listeners.add(f); return () => listeners.delete(f) }, [])
  const company = resolveCompany(s)
  const lang = read(LANG_KEY, 'th')
  const ctx = ctxFor(s, company, lang)
  const base = ctxFor(s, null, lang)
  const companies = base && s.platform ? companiesFor(s.platform, base) : []
  const setCompany = useCallback(id => { try { localStorage.setItem(COMPANY_KEY, id) } catch (e) { /* ignore */ } emit() }, [])
  const setLang = useCallback(l => { try { localStorage.setItem(LANG_KEY, l) } catch (e) { /* ignore */ } emit() }, [])
  return { s, P: s.platform, ctx, company, companies, lang, setCompany, setLang, isAdmin: !!roleOf(s)?.isAdmin, get: apiGet, send: (m, p, b) => apiSend(m, p, b) }
}
