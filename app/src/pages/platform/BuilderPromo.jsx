import React from 'react'
import { Link } from 'react-router-dom'
import { usePlatform } from '../../platform/session'
import { tr } from '../../platform/util'

// Banner that puts "build your own module" in front of people (home page and module page).
export default function BuilderPromo() {
  const { s, company, lang, isAdmin } = usePlatform()
  const th = lang !== 'en'
  const mine = Object.values(s.platform?.installed?.[company] || {}).filter(m => m.manifest.builder && m.enabled)
  return (
    <div className="promo" data-testid="builder-promo">
      <div className="promo-main">
        <h3>{th ? 'สร้างโมดูลของคุณเอง ไม่ต้องเขียนโค้ด' : 'Build your own module, no code'}</h3>
        <div className="muted">
          {th ? 'ลากชิ้นส่วนมาวางเป็นฟอร์ม ตั้งสถานะ แล้วกดบันทึก ระบบจะสร้างหน้ากรอกข้อมูล หน้ารายการ ประวัติแก้ไข และเมนูให้' : 'Drag parts into a form, add statuses, then save. The form, list, history and menu are created for you.'}
        </div>
        {mine.length > 0 && (
          <div className="row" style={{ marginTop: 8 }}>
            <span className="muted small">{th ? 'โมดูลที่คุณสร้าง:' : 'Your modules:'}</span>
            {mine.map(m => <Link key={m.name} className="btn sm" to={m.manifest.entities[0] ? `/p/${m.name}/${m.manifest.entities[0].key}` : '/platform/builder'}>{tr(m.manifest.title, lang)}</Link>)}
          </div>
        )}
      </div>
      <div className="promo-actions">
        {isAdmin
          ? <>
            <Link className="btn primary" to="/platform/builder">{th ? 'สร้างโมดูลใหม่' : 'New module'}</Link>
            <Link className="btn" to="/platform/builder?template=request">{th ? 'ใบขออนุมัติ' : 'Request form'}</Link>
            <Link className="btn" to="/platform/builder?template=asset">{th ? 'ทะเบียนทรัพย์สิน' : 'Asset register'}</Link>
            <Link className="btn" to="/platform/builder?template=job">{th ? 'ติดตามงาน' : 'Job tracker'}</Link>
          </>
          : <span className="muted small">{th ? 'ขอให้ผู้ดูแลระบบสร้างโมดูลให้ได้ที่เมนู Module Builder' : 'Ask an administrator to build modules.'}</span>}
      </div>
    </div>
  )
}
