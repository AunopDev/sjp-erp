// REST-style API over the kernel. The UI and any other client go through handle(), so permissions,
// validation, workflow and audit are enforced in exactly one place.
//
//   handle(P, ctx, 'POST', '/api/data/purchasing/order', { ...values }) → { status, body }
import { PlatformError, fail } from './util.js'
import { companiesFor, createCompany, listAudit, listMembers, open, setMemberRoles, setRecordAccess } from './core.js'
import { createRecord, deleteRecord, listEvents, listRecords, updateRecord } from './records.js'
import { getRecord, menuFor, optionsForRef, runReport, screenFor, transition } from './flow.js'
import { installModule, listModules, setEnabled, uninstallModule, upgradeModule } from './lifecycle.js'
import { createCustomModule, removeEntity, saveEntity } from './builder.js'
import { exportModule, importModule } from './packages.js'

const ROUTES = []
const route = (method, pattern, fn) => {
  const keys = []
  const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)' }) + '/?$')
  ROUTES.push({ method, re, keys, fn })
}

route('GET', '/api/companies', (P, ctx) => companiesFor(P, ctx))
route('POST', '/api/companies', (P, ctx, _p, body) => createCompany(P, ctx, body?.name))

route('GET', '/api/modules', (P, ctx) => listModules(P, ctx))
route('POST', '/api/modules/import', (P, ctx, _p, body) => importModule(P, ctx, body?.package, { includeData: body?.includeData !== false }))
route('POST', '/api/modules/:name/install', (P, ctx, p, body) => installModule(P, ctx, p.name, body || {}))
route('POST', '/api/modules/:name/uninstall', (P, ctx, p, body) => uninstallModule(P, ctx, p.name, body || {}))
route('POST', '/api/modules/:name/enable', (P, ctx, p) => setEnabled(P, ctx, p.name, true))
route('POST', '/api/modules/:name/disable', (P, ctx, p) => setEnabled(P, ctx, p.name, false))
route('POST', '/api/modules/:name/upgrade', (P, ctx, p, body) => upgradeModule(P, ctx, p.name, body || {}))
route('GET', '/api/modules/:name/export', (P, ctx, p, _b, q) => exportModule(P, ctx, p.name, { includeData: q.includeData === 'true' || q.includeData === true }))

route('GET', '/api/meta/menu', (P, ctx) => menuFor(P, ctx))
route('GET', '/api/meta/screen/:module/:entity', (P, ctx, p) => screenFor(P, ctx, `${p.module}.${p.entity}`))
route('GET', '/api/meta/options/:module/:entity', (P, ctx, p) => optionsForRef(P, ctx, `${p.module}.${p.entity}`))

route('GET', '/api/data/:module/:entity', (P, ctx, p, _b, q) => listRecords(P, ctx, `${p.module}.${p.entity}`, { search: q.search, sort: q.sort, page: q.page, pageSize: q.pageSize, filters: q.filters || {} }))
route('POST', '/api/data/:module/:entity', (P, ctx, p, body) => createRecord(P, ctx, `${p.module}.${p.entity}`, body || {}))
route('GET', '/api/data/:module/:entity/:id', (P, ctx, p) => getRecord(P, ctx, `${p.module}.${p.entity}`, p.id))
route('PATCH', '/api/data/:module/:entity/:id', (P, ctx, p, body) => updateRecord(P, ctx, `${p.module}.${p.entity}`, p.id, body || {}))
route('PUT', '/api/data/:module/:entity/:id', (P, ctx, p, body) => updateRecord(P, ctx, `${p.module}.${p.entity}`, p.id, body || {}))
route('DELETE', '/api/data/:module/:entity/:id', (P, ctx, p) => deleteRecord(P, ctx, `${p.module}.${p.entity}`, p.id))
route('POST', '/api/data/:module/:entity/:id/transition/:key', (P, ctx, p, body) => transition(P, ctx, `${p.module}.${p.entity}`, p.id, p.key, body || {}))
route('PUT', '/api/data/:module/:entity/:id/access', (P, ctx, p, body) => setRecordAccess(P, ctx, `${p.module}.${p.entity}`, p.id, body || {}))

route('GET', '/api/reports/:module/:key', (P, ctx, p) => runReport(P, ctx, `${p.module}.${p.key}`))
route('GET', '/api/audit', (P, ctx, _p, _b, q) => listAudit(P, ctx, q))
route('GET', '/api/events', (P, ctx) => listEvents(P, ctx))
route('GET', '/api/members', (P, ctx) => listMembers(P, ctx))
route('PUT', '/api/members/:userId', (P, ctx, p, body) => setMemberRoles(P, ctx, p.userId, body?.roles || [], body?.name || ''))

route('POST', '/api/builder/modules', (P, ctx, _p, body) => ({ name: createCustomModule(P, ctx, body || {}) }))
route('PUT', '/api/builder/modules/:name/entities', (P, ctx, p, body) => saveEntity(P, ctx, p.name, body))
route('DELETE', '/api/builder/modules/:name/entities/:key', (P, ctx, p) => removeEntity(P, ctx, p.name, p.key))

export function handle(P, ctx, method, path, body, query = {}) {
  try {
    const [pathOnly, qs] = String(path).split('?')
    const q = { ...query }
    if (qs) for (const [k, v] of new URLSearchParams(qs)) q[k] = v
    for (const r of ROUTES) {
      if (r.method !== method.toUpperCase()) continue
      const m = r.re.exec(pathOnly)
      if (!m) continue
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]))
      if (!ctx?.user && !ctx?.system) fail('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', {}, 401)
      if (pathOnly !== '/api/companies') open(P, ctx) // every route needs a real company the user belongs to
      const created = r.method === 'POST' && /^\/api\/(data\/[^/]+\/[^/]+|companies|builder\/modules)\/?$/.test(pathOnly)
      return { status: created ? 201 : 200, body: r.fn(P, ctx, params, body, q) }
    }
    return { status: 404, body: { error: { code: 'NOT_FOUND', message: `ไม่พบ API ${method} ${pathOnly}`, details: {} } } }
  } catch (e) {
    if (e instanceof PlatformError) return { status: e.status, body: { error: { code: e.code, message: e.message, details: e.details } } }
    // anything unexpected is reported, never thrown: one bad module must not take the system down
    return { status: 500, body: { error: { code: 'INTERNAL', message: `เกิดข้อผิดพลาดภายในระบบ: ${e && e.message ? e.message : e}`, details: {} } } }
  }
}
