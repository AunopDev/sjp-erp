// Module lifecycle: catalog, dependency checks, install / enable / disable / uninstall / upgrade (with data migration).
import { BUILTIN_MODULES } from './modules/index.js'
import { validateManifest } from './manifest.js'
import { computeFormulas, defaultValue, expandFields } from './parts.js'
import { activeSet, installedOf, open, registry, requireAdmin, restore, snapshot, systemCtx, writeAudit } from './core.js'
import { createRecord, publish } from './records.js'
import { PlatformError, clone, cmpVer, fail, nowIso, satisfies, sameVal, tr } from './util.js'

// ============================================================ catalog (built-in + packages imported into a company)
export function catalogFor(P, cid) {
  const cat = {}
  for (const m of [...BUILTIN_MODULES, ...Object.values(P.library[cid] || {}).flat()]) (cat[m.name] = cat[m.name] || []).push(m)
  for (const n of Object.keys(cat)) cat[n].sort((a, b) => cmpVer(b.version, a.version))
  return cat
}
export function registerPackage(P, ctx, manifest) {
  open(P, ctx); requireAdmin(P, ctx)
  const errs = validateManifest(manifest, { lookup: n => P.installed[ctx.company]?.[n]?.manifest || null })
  if (errs.length) fail('INVALID_MODULE', `คำนิยามโมดูลไม่ถูกต้อง:\n- ${errs.join('\n- ')}`, { errors: errs }, 422)
  const lib = (P.library[ctx.company] = P.library[ctx.company] || {})
  const list = (lib[manifest.name] = lib[manifest.name] || [])
  const same = list.find(x => x.version === manifest.version) || BUILTIN_MODULES.find(x => x.name === manifest.name && x.version === manifest.version)
  if (same) {
    if (!sameVal(same, manifest)) fail('CONFLICT', `มีโมดูล ${manifest.name} เวอร์ชัน ${manifest.version} อยู่แล้วแต่เนื้อหาไม่เหมือนกัน — กรุณาเปลี่ยนเลขเวอร์ชัน`, {}, 409)
    return same
  }
  list.push(clone(manifest))
  return manifest
}

function titleOfModule(P, cid, name) {
  const inst = P.installed[cid]?.[name]
  if (inst) return tr(inst.manifest.title)
  const c = catalogFor(P, cid)[name]
  return c ? tr(c[0].title) : name
}

// ============================================================ dependency checks
export function dependencyProblems(P, cid, manifest) {
  const inst = installedOf(P, cid)
  const act = activeSet(inst)
  const out = []
  for (const d of manifest.dependsOn || []) {
    const r = inst[d.name]
    if (!r) out.push({ module: d.name, range: d.version || '*', reason: 'missing' })
    else if (!satisfies(r.version, d.version)) out.push({ module: d.name, range: d.version, have: r.version, reason: 'version' })
    else if (!r.enabled) out.push({ module: d.name, range: d.version || '*', reason: 'disabled' })
    else if (!act.has(d.name)) out.push({ module: d.name, range: d.version || '*', reason: 'blocked' })
  }
  return out
}
function describeProblems(P, cid, manifest, verb, problems) {
  const lines = problems.map((p, i) => {
    const t = `“${titleOfModule(P, cid, p.module)}” (${p.module})`
    const rng = p.range && p.range !== '*' ? ` เวอร์ชัน ${p.range}` : ''
    const why = p.reason === 'missing' ? 'ยังไม่ได้ติดตั้ง — กรุณาติดตั้งโมดูลนี้ก่อน'
      : p.reason === 'version' ? `ติดตั้งอยู่เป็นเวอร์ชัน ${p.have} ซึ่งไม่ตรงกับที่ต้องการ`
        : p.reason === 'disabled' ? 'ติดตั้งแล้วแต่ถูกปิดใช้งานอยู่ — กรุณาเปิดใช้งานก่อน'
          : 'ยังใช้งานไม่ได้เพราะขาดโมดูลที่มันต้องพึ่งพาอีกชั้นหนึ่ง'
    return `${i + 1}) ต้องมีโมดูล ${t}${rng}: ${why}`
  })
  return `ไม่สามารถ${verb}โมดูล “${tr(manifest.title)}” (${manifest.name}) ได้ เพราะขาดโมดูลที่ต้องพึ่งพา\n${lines.join('\n')}`
}
const dependentsOf = (inst, name, onlyEnabled) =>
  Object.values(inst).filter(r => r.name !== name && (!onlyEnabled || r.enabled) && (r.manifest.dependsOn || []).some(d => d.name === name))

export function listModules(P, ctx) {
  const reg = open(P, ctx)
  const cat = catalogFor(P, ctx.company)
  const inst = installedOf(P, ctx.company)
  const names = [...new Set([...Object.keys(cat), ...Object.keys(inst)])]
  return names.map(name => {
    const r = inst[name]
    const latest = cat[name]?.[0]
    const m = r?.manifest || latest
    const status = !r ? 'available' : !r.enabled ? 'disabled' : reg.active.has(name) ? 'active' : 'blocked'
    const upgrade = r && latest && cmpVer(latest.version, r.version) > 0 ? latest.version : null
    return {
      name, title: m.title, description: m.description || '', builder: !!m.builder, status,
      installedVersion: r?.version || null, latestVersion: latest?.version || r?.version || null, upgradeTo: upgrade,
      dependsOn: m.dependsOn || [], dependents: dependentsOf(inst, name, false).map(x => x.name),
      blockedBy: reg.blocked[name] || [], entities: (m.entities || []).map(e => ({ key: e.key, label: e.label })),
      installedAt: r?.installedAt || null, history: r?.history || []
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

// ============================================================ install / enable / disable / uninstall
export function installModule(P, ctx, name, opts = {}) {
  open(P, ctx); requireAdmin(P, ctx)
  const inst = installedOf(P, ctx.company)
  if (inst[name]) fail('ALREADY_INSTALLED', `โมดูล “${titleOfModule(P, ctx.company, name)}” (${name}) ติดตั้งอยู่แล้ว (เวอร์ชัน ${inst[name].version})`, {}, 409)
  const list = catalogFor(P, ctx.company)[name]
  if (!list) fail('NOT_FOUND', `ไม่พบแพ็กเกจโมดูล “${name}” ในระบบ — ลองนำเข้าไฟล์แพ็กเกจก่อน`, { name }, 404)
  const manifest = opts.version ? list.find(m => m.version === opts.version) : list[0]
  if (!manifest) fail('NOT_FOUND', `ไม่พบโมดูล ${name} เวอร์ชัน ${opts.version}`, { name }, 404)
  return installManifest(P, ctx, manifest, opts)
}

export function installManifest(P, ctx, manifest, opts = {}) {
  const cid = ctx.company
  const inst = installedOf(P, cid)
  const errs = validateManifest(manifest, { lookup: n => inst[n]?.manifest || null })
  if (errs.length) fail('INVALID_MODULE', `ไม่สามารถติดตั้งโมดูล “${tr(manifest.title) || manifest.name}” เพราะคำนิยามไม่ถูกต้อง:\n- ${errs.join('\n- ')}`, { errors: errs }, 422)
  if (inst[manifest.name]) fail('ALREADY_INSTALLED', `โมดูล “${tr(manifest.title)}” (${manifest.name}) ติดตั้งอยู่แล้ว (เวอร์ชัน ${inst[manifest.name].version})`, {}, 409)
  const problems = dependencyProblems(P, cid, manifest)
  if (problems.length) fail('DEPENDENCY', describeProblems(P, cid, manifest, 'ติดตั้ง', problems), { problems }, 409)
  const snap = snapshot(P, cid)
  try {
    inst[manifest.name] = {
      name: manifest.name, version: manifest.version, enabled: true, installedAt: nowIso(), updatedAt: nowIso(),
      manifest: clone(manifest), history: [{ version: manifest.version, at: nowIso(), by: ctx.user?.name || 'ระบบ', action: 'install' }]
    }
    const arch = P.archive[cid]?.[manifest.name]
    let restored = 0
    if (arch) {
      for (const [id, rows] of Object.entries(arch.data)) { P.data[cid] = P.data[cid] || {}; P.data[cid][id] = rows; restored += rows.length }
      delete P.archive[cid][manifest.name]
      migrateData(P, cid, arch.manifest, manifest)
    } else if (opts.seed !== false) {
      const sys = systemCtx(cid, `ระบบ (${manifest.name})`)
      const reg = registry(P, cid)
      for (const [ek, rows] of Object.entries(manifest.seed || {})) for (const v of rows) createRecord(P, sys, `${manifest.name}.${ek}`, v, { reg })
    }
    writeAudit(P, ctx, { action: 'module-install', entity: 'platform.module', rec: { id: manifest.name, code: manifest.name }, summary: { th: `ติดตั้งโมดูล ${tr(manifest.title)} เวอร์ชัน ${manifest.version}${restored ? ` (กู้คืนข้อมูลเดิม ${restored} รายการ)` : ''}`, en: `Installed module ${tr(manifest.title, 'en')} ${manifest.version}` } })
    publish(P, systemCtx(cid), 'platform.module.installed', { module: manifest.name, version: manifest.version })
    return { name: manifest.name, version: manifest.version, restored }
  } catch (e) {
    restore(P, cid, snap)
    throw e
  }
}

export function setEnabled(P, ctx, name, enabled) {
  open(P, ctx); requireAdmin(P, ctx)
  const inst = installedOf(P, ctx.company)
  const r = inst[name]
  if (!r) fail('NOT_FOUND', `ยังไม่ได้ติดตั้งโมดูล “${name}”`, {}, 404)
  if (r.enabled === enabled) fail('CONFLICT', `โมดูล “${tr(r.manifest.title)}” ${enabled ? 'เปิดใช้งานอยู่แล้ว' : 'ปิดใช้งานอยู่แล้ว'}`, {}, 409)
  if (enabled) {
    const problems = dependencyProblems(P, ctx.company, r.manifest)
    if (problems.length) fail('DEPENDENCY', describeProblems(P, ctx.company, r.manifest, 'เปิดใช้งาน', problems), { problems }, 409)
  } else {
    const deps = dependentsOf(inst, name, true)
    if (deps.length) fail('HAS_DEPENDENTS', `ไม่สามารถปิดโมดูล “${tr(r.manifest.title)}” (${name}) ได้ เพราะโมดูลที่ยังเปิดใช้งานอยู่ต้องพึ่งพา: ${deps.map(d => `“${tr(d.manifest.title)}” (${d.name})`).join(', ')} — กรุณาปิดโมดูลเหล่านั้นก่อน`, { dependents: deps.map(d => d.name) }, 409)
  }
  r.enabled = enabled; r.updatedAt = nowIso()
  r.history.push({ version: r.version, at: nowIso(), by: ctx.user?.name || 'ระบบ', action: enabled ? 'enable' : 'disable' })
  writeAudit(P, ctx, { action: enabled ? 'module-enable' : 'module-disable', entity: 'platform.module', rec: { id: name, code: name }, summary: { th: `${enabled ? 'เปิด' : 'ปิด'}ใช้งานโมดูล ${tr(r.manifest.title)}`, en: `${enabled ? 'Enabled' : 'Disabled'} module ${tr(r.manifest.title, 'en')}` } })
  return { name, enabled }
}

export function uninstallModule(P, ctx, name, opts = {}) {
  open(P, ctx); requireAdmin(P, ctx)
  const cid = ctx.company
  const inst = installedOf(P, cid)
  const r = inst[name]
  if (!r) fail('NOT_FOUND', `ยังไม่ได้ติดตั้งโมดูล “${name}”`, {}, 404)
  const deps = dependentsOf(inst, name, false)
  if (deps.length) fail('HAS_DEPENDENTS', `ไม่สามารถถอดโมดูล “${tr(r.manifest.title)}” (${name}) ได้ เพราะโมดูลต่อไปนี้ยังต้องพึ่งพา: ${deps.map(d => `“${tr(d.manifest.title)}” (${d.name})`).join(', ')} — กรุณาถอดโมดูลเหล่านั้นก่อน`, { dependents: deps.map(d => d.name) }, 409)
  const ids = r.manifest.entities.map(e => `${name}.${e.key}`)
  const d = P.data[cid] || {}
  if (!opts.purgeData) {
    P.archive[cid] = P.archive[cid] || {}
    P.archive[cid][name] = { version: r.version, manifest: clone(r.manifest), at: nowIso(), data: Object.fromEntries(ids.map(id => [id, d[id] || []])) }
  } else if (P.archive[cid]) delete P.archive[cid][name]
  for (const id of ids) { delete d[id]; if (opts.purgeData && P.counters[cid]) delete P.counters[cid][id] }
  delete inst[name]
  for (const m of P.members) if (m.company === cid) m.roles = m.roles.filter(x => !x.startsWith(name + '.'))
  writeAudit(P, ctx, { action: 'module-uninstall', entity: 'platform.module', rec: { id: name, code: name }, summary: { th: `ถอดโมดูล ${tr(r.manifest.title)}${opts.purgeData ? ' (ลบข้อมูล)' : ' (เก็บข้อมูลไว้กู้คืน)'}`, en: `Uninstalled module ${tr(r.manifest.title, 'en')}` } })
  publish(P, systemCtx(cid), 'platform.module.uninstalled', { module: name })
  return { name, dataKept: !opts.purgeData }
}

// ============================================================ upgrade & migrations
function migrationChain(manifest, from, to) {
  const chain = []
  let cur = from
  while (cmpVer(cur, to) < 0) {
    const options = (manifest.migrations || []).filter(m => m.from === cur && cmpVer(m.to, to) <= 0 && cmpVer(m.to, cur) > 0).sort((a, b) => cmpVer(b.to, a.to))
    if (!options.length) break
    chain.push(options[0]); cur = options[0].to
  }
  return chain
}
function applyStep(P, cid, mod, st, stats) {
  const id = st.entity.includes('.') ? st.entity : `${mod}.${st.entity}`
  const rows = P.data[cid]?.[id] || []
  const bump = () => { stats[id] = rows.length }
  switch (st.op) {
    case 'addField': for (const r of rows) if (r[st.field.key] === undefined) { const d = defaultValue(st.field); if (d !== undefined) { r[st.field.key] = d; bump() } } break
    case 'renameField': for (const r of rows) if (r[st.from] !== undefined) { r[st.to] = r[st.from]; delete r[st.from]; bump() } break
    case 'copyField': for (const r of rows) if (r[st.from] !== undefined && r[st.to] === undefined) { r[st.to] = clone(r[st.from]); bump() } break
    case 'removeField': for (const r of rows) if (r[st.field] !== undefined) { r._removed = { ...(r._removed || {}), [st.field]: r[st.field] }; delete r[st.field]; bump() } break
    case 'setValue': for (const r of rows) if (!st.where || Object.entries(st.where).every(([k, v]) => r[k] === v)) { r[st.field] = st.value; bump() } break
    default: fail('MIGRATION_FAILED', `migration ใช้คำสั่ง "${st.op}" ที่ระบบไม่รู้จัก`, {})
  }
}
export function migrateData(P, cid, oldM, newM) {
  const stats = {}
  for (const mg of migrationChain(newM, oldM.version, newM.version)) for (const st of mg.steps || []) applyStep(P, cid, newM.name, st, stats)
  // always: give existing records the default of every field they do not have yet, and refresh formulas
  const comps = Object.fromEntries((newM.components || []).map(c => [c.key, c]))
  for (const en of newM.entities || []) {
    const fields = expandFields(en.fields, comps)
    for (const r of P.data[cid]?.[`${newM.name}.${en.key}`] || []) {
      for (const f of fields) if (r[f.key] === undefined && f.type !== 'formula') { const d = defaultValue(f); if (d !== undefined) r[f.key] = d }
      // a workflow added (or changed) later: rows without a valid status start at the initial one
      const wf = en.workflow
      if (wf) {
        const k = wf.field || 'status'
        if (!wf.states.some(st => st.key === r[k])) r[k] = wf.initial
      }
      computeFormulas(fields, r)
    }
  }
  return stats
}

export function upgradeModule(P, ctx, name, opts = {}) {
  open(P, ctx); requireAdmin(P, ctx)
  const cid = ctx.company
  const r = installedOf(P, cid)[name]
  if (!r) fail('NOT_FOUND', `ยังไม่ได้ติดตั้งโมดูล “${name}”`, {}, 404)
  const list = (catalogFor(P, cid)[name] || []).filter(m => cmpVer(m.version, r.version) > 0 && (!opts.version || cmpVer(m.version, opts.version) <= 0))
  if (!list.length) fail('NO_UPGRADE', `โมดูล “${tr(r.manifest.title)}” เป็นเวอร์ชันล่าสุดแล้ว (${r.version}) — ไม่มีเวอร์ชันใหม่ให้อัปเดต`, {}, 409)
  return applyUpgrade(P, ctx, list[0])
}

export function applyUpgrade(P, ctx, target) {
  const cid = ctx.company
  const inst = installedOf(P, cid)
  const r = inst[target.name]
  const errs = validateManifest(target, { lookup: n => inst[n]?.manifest || null })
  if (errs.length) fail('INVALID_MODULE', `ไม่สามารถอัปเวอร์ชันได้ เพราะคำนิยามเวอร์ชัน ${target.version} ไม่ถูกต้อง:\n- ${errs.join('\n- ')}`, { errors: errs }, 422)
  const problems = dependencyProblems(P, cid, target)
  if (problems.length) fail('DEPENDENCY', describeProblems(P, cid, target, 'อัปเวอร์ชัน', problems), { problems }, 409)
  for (const d of dependentsOf(inst, target.name, false)) {
    const need = (d.manifest.dependsOn || []).find(x => x.name === target.name)
    if (!satisfies(target.version, need.version)) fail('HAS_DEPENDENTS', `ไม่สามารถอัปเวอร์ชัน “${tr(target.title)}” เป็น ${target.version} ได้ เพราะโมดูล “${tr(d.manifest.title)}” (${d.name}) ต้องการเวอร์ชัน ${need.version}`, {}, 409)
  }
  const snap = snapshot(P, cid)
  try {
    const from = r.version
    const stats = migrateData(P, cid, r.manifest, target)
    r.manifest = clone(target); r.version = target.version; r.updatedAt = nowIso()
    r.history.push({ version: target.version, at: nowIso(), by: ctx.user?.name || 'ระบบ', action: 'upgrade', from })
    writeAudit(P, ctx, { action: 'module-upgrade', entity: 'platform.module', rec: { id: target.name, code: target.name }, summary: { th: `อัปเวอร์ชันโมดูล ${tr(target.title)} ${from} → ${target.version}`, en: `Upgraded module ${tr(target.title, 'en')} ${from} → ${target.version}` } })
    publish(P, systemCtx(cid), 'platform.module.upgraded', { module: target.name, from, to: target.version })
    return { name: target.name, from, to: target.version, migrated: stats }
  } catch (e) {
    restore(P, cid, snap)
    if (e instanceof PlatformError && e.code === 'MIGRATION_FAILED') throw e
    fail('MIGRATION_FAILED', `อัปเวอร์ชันไม่สำเร็จ ระบบยกเลิกการเปลี่ยนแปลงและข้อมูลเดิมยังอยู่ครบ: ${e.message}`, {}, 500)
  }
}

// first start: one company with the three sample modules installed
export function bootstrapPlatform(P) {
  if (P.companies.length) return P
  const cid = 'co-main'
  P.companies.push({ id: cid, name: 'บริษัทหลัก', createdAt: nowIso() })
  const sys = systemCtx(cid)
  for (const m of BUILTIN_MODULES) installManifest(P, sys, m)
  return P
}
