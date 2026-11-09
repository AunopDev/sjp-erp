// Export / import a module as one self-contained package file (JSON) that can be installed in another company or system.
import { validateManifest } from './manifest.js'
import { installManifest, applyUpgrade, registerPackage, catalogFor } from './lifecycle.js'
import { installedOf, open, requireAdmin, systemCtx, writeAudit } from './core.js'
import { FORMAT_VERSION, checksum, clone, cmpVer, fail, nowIso, tr } from './util.js'

export const PACKAGE_KIND = 'sjp-erp-module'

export function exportModule(P, ctx, name, { includeData = false } = {}) {
  open(P, ctx); requireAdmin(P, ctx)
  const rec = installedOf(P, ctx.company)[name]
  if (!rec) fail('NOT_FOUND', `ยังไม่ได้ติดตั้งโมดูล “${name}” จึงส่งออกไม่ได้`, {}, 404)
  const manifest = clone(rec.manifest)
  const ownIds = new Set(manifest.entities.map(e => e.key))
  let data
  if (includeData) {
    data = {}
    for (const e of manifest.entities) {
      const refs = e.fields.filter(f => f.type === 'ref' && f.ref.includes('.') && !f.ref.startsWith(name + '.')).map(f => f.key)
      data[e.key] = (P.data[ctx.company]?.[`${name}.${e.key}`] || []).filter(r => !r._deleted).map(r => {
        const c = clone(r)
        for (const k of refs) delete c[k] // links into other modules point at this company's data only
        delete c._acl
        return c
      })
    }
  }
  const body = { kind: PACKAGE_KIND, formatVersion: FORMAT_VERSION, exportedAt: nowIso(), exportedFrom: P.companies.find(c => c.id === ctx.company)?.name || '', module: manifest.name, version: manifest.version, requires: manifest.dependsOn || [], manifest, data }
  const pkg = { ...body, checksum: checksum(JSON.stringify({ manifest, data: data || null })) }
  writeAudit(P, ctx, { action: 'module-export', entity: 'platform.module', rec: { id: name, code: name }, summary: { th: `ส่งออกโมดูล ${tr(manifest.title)} ${manifest.version}${includeData ? ' พร้อมข้อมูล' : ''}`, en: `Exported module ${tr(manifest.title, 'en')} ${manifest.version}` } })
  void ownIds
  return pkg
}

export function parsePackage(input) {
  let pkg = input
  if (typeof input === 'string') {
    try { pkg = JSON.parse(input) } catch (e) { fail('INVALID_PACKAGE', 'อ่านไฟล์แพ็กเกจไม่ได้ — ไฟล์ไม่ใช่ JSON ที่ถูกต้อง', {}, 422) }
  }
  if (!pkg || pkg.kind !== PACKAGE_KIND) fail('INVALID_PACKAGE', 'ไฟล์นี้ไม่ใช่แพ็กเกจโมดูลของระบบ SJP ERP', {}, 422)
  if (!Number.isInteger(pkg.formatVersion)) fail('INVALID_PACKAGE', 'แพ็กเกจไม่มี formatVersion (เลขเวอร์ชันของรูปแบบไฟล์)', {}, 422)
  if (pkg.formatVersion > FORMAT_VERSION) fail('INVALID_PACKAGE', `แพ็กเกจนี้ใช้รูปแบบไฟล์เวอร์ชัน ${pkg.formatVersion} ซึ่งใหม่กว่าที่ระบบนี้รองรับ (รองรับถึง ${FORMAT_VERSION}) — กรุณาอัปเดตระบบก่อน`, {}, 422)
  if (!pkg.manifest) fail('INVALID_PACKAGE', 'แพ็กเกจไม่มีคำนิยามโมดูล (manifest)', {}, 422)
  if (pkg.checksum !== checksum(JSON.stringify({ manifest: pkg.manifest, data: pkg.data || null }))) fail('INVALID_PACKAGE', 'แพ็กเกจเสียหายหรือถูกแก้ไขหลังส่งออก (checksum ไม่ตรง)', {}, 422)
  return pkg
}

// Installs (or upgrades) the packaged module in the target company, optionally with its data.
export function importModule(P, ctx, input, { includeData = true } = {}) {
  open(P, ctx); requireAdmin(P, ctx)
  const pkg = parsePackage(input)
  const m = pkg.manifest
  const errs = validateManifest(m, { lookup: n => installedOf(P, ctx.company)[n]?.manifest || null })
  if (errs.length) fail('INVALID_MODULE', `แพ็กเกจมีคำนิยามโมดูลที่ไม่ถูกต้อง:\n- ${errs.join('\n- ')}`, { errors: errs }, 422)
  const cur = installedOf(P, ctx.company)[m.name]
  const builtin = (catalogFor(P, ctx.company)[m.name] || []).find(x => x.version === m.version)
  if (!builtin) registerPackage(P, ctx, m)
  if (cur) {
    if (cmpVer(m.version, cur.version) <= 0) fail('CONFLICT', `บริษัทนี้ติดตั้งโมดูล “${tr(m.title)}” เวอร์ชัน ${cur.version} อยู่แล้ว (แพ็กเกจเป็นเวอร์ชัน ${m.version}) — นำเข้าได้เฉพาะเวอร์ชันที่ใหม่กว่า`, {}, 409)
    const r = applyUpgrade(P, ctx, m)
    return { name: m.name, version: m.version, action: 'upgraded', from: r.from }
  }
  installManifest(P, ctx, m, { seed: !(includeData && pkg.data) })
  let imported = 0
  if (includeData && pkg.data) {
    const sys = systemCtx(ctx.company, `นำเข้า (${m.name})`)
    P.data[ctx.company] = P.data[ctx.company] || {}
    for (const e of m.entities) {
      const id = `${m.name}.${e.key}`
      for (const r of pkg.data[e.key] || []) { (P.data[ctx.company][id] = P.data[ctx.company][id] || []).push({ ...clone(r), _importedAt: nowIso() }); imported++ }
      const maxN = Math.max(0, ...(P.data[ctx.company]?.[id] || []).map(r => Number(String(r.code || '').split('-')[1]) || 0))
      P.counters[ctx.company] = P.counters[ctx.company] || {}
      P.counters[ctx.company][id] = Math.max(P.counters[ctx.company][id] || 0, maxN)
    }
    void sys
  }
  writeAudit(P, ctx, { action: 'module-import', entity: 'platform.module', rec: { id: m.name, code: m.name }, summary: { th: `นำเข้าโมดูล ${tr(m.title)} ${m.version}${imported ? ` พร้อมข้อมูล ${imported} รายการ` : ''}`, en: `Imported module ${tr(m.title, 'en')} ${m.version}` } })
  return { name: m.name, version: m.version, action: 'installed', imported }
}
