# SJP ERP

ระบบ ERP สำหรับงานโครงการ / บริการ / คลัง / จัดซื้อ / PM — ออกแบบให้เป็น **metadata-driven ERP** ที่ปรับฟิลด์ workflow สิทธิ์ และโมดูลเพิ่มเติมได้

## โครงสร้าง

| โฟลเดอร์ | รายละเอียด |
| --- | --- |
| `web/` | Angular 22 frontend (standalone components, signals) |
| `server/` | NestJS 12 API + SQLite (Drizzle ORM) + JWT auth |
| `app/` | React + Vite เวอร์ชันเดิม เก็บไว้เป็น reference ระหว่าง migration |

## การรัน

```bash
npm run install:all

# คัดลอกค่าตั้งต้น (แก้ JWT_SECRET ก่อนใช้งานจริง)
copy server\.env.example server\.env

# terminal 1 — API (http://localhost:3000/api)
npm run dev:server

# terminal 2 — Angular (http://localhost:4200)
npm run dev:web
```

ครั้งแรกเปิด `http://localhost:4200` ระบบจะให้สร้างผู้ดูแลระบบคนแรก

- ฐานข้อมูล SQLite: `server/data/sjp.sqlite` (สร้างอัตโนมัติ)
- API prefix: `/api` · Health: `GET /api/health`
- Angular dev server proxy `/api` → `localhost:3000` (ดู `web/proxy.conf.json`)
- PDF ฝั่งเซิร์ฟเวอร์ใช้ Chrome/Edge/Chromium แบบ headless — ตั้ง `PDF_BROWSER_PATH` หากไม่ได้อยู่ path มาตรฐาน
- **production ต้องตั้ง `JWT_SECRET` ยาว ≥ 32 ตัวอักษร** — ถ้าไม่มี/เป็น placeholder เซิร์ฟเวอร์จะไม่ start; โหมด dev จะสร้าง secret ชั่วคราวและ session จะหลุดเมื่อ restart
- Login/Setup ถูกจำกัด 5 ครั้ง/นาที (Throttler) และสิทธิ์จัดการผู้ใช้/บทบาทแยกจาก `settings` แล้ว (`users.*`, `roles.*`)
- Webhook ภายนอกบล็อก localhost/private IP โดยค่าเริ่มต้น — ตั้ง `WEBHOOK_ALLOW_PRIVATE=true` เฉพาะกรณีเชื่อมระบบภายในที่เชื่อถือได้
- ไฟล์สำรองมีข้อมูลอ่อนไหว (password hash, SMTP/LINE token, HMAC secret) ต้องเก็บและส่งอย่างปลอดภัย
- อีเมล/LINE ตั้งค่าได้ที่ Settings → แจ้งเตือน หรือใช้ env สำรอง: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_TO`, `LINE_CHANNEL_TOKEN`, `LINE_TO`

## Project Guardian (ตรวจสุขภาพโปรเจ็ค)

- Agent สำหรับตรวจแบบอ่านอย่างเดียว: `.opencode/agents/project-guardian.md`
- เรียกจาก TUI ด้วยคำสั่ง: `/check-project` (หรือ `/check-project โฟกัส auth`)
- ตรวจ build/tests/dependency/code markers/hygiene ด้วย: `npm run health`
- รายงานถูกเก็บที่ `checks/reports/health-*.md`
- ตั้งให้ตรวจอัตโนมัติทุกวัน (Windows Task Scheduler) ด้วย:
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-health-task.ps1 -Time 08:00
  ```
  ยกเลิกด้วย `-Remove` — ตัว scheduled task รันสคริปต์ health check ส่วนการวิเคราะห์เชิงลึกใช้ agent ตอนเรียก `/check-project`

## สถานะ migration

เสร็จใน base นี้:
- [x] Angular shell/login/dashboard + responsive theme
- [x] NestJS + SQLite + Drizzle + JWT + first-run admin
- [x] Metadata registry + generic records API (validation / permission / scope / audit)
- [x] Master data, Ticket workflow, Project 13 steps, Purchase/Receive, Stock/Serial, PM, Reports, Users/Roles
- [x] ความถูกต้องพื้นฐาน: local date-only, ref/select/rows validation, cross-customer/site check, ETag off, CSV export
- [x] Module Builder: สร้างโมดูลเอง, เพิ่ม/ซ่อนฟิลด์, เลือกคอลัมน์/ตัวกรอง, กำหนดสิทธิ์รายบทบาท จากหน้า Settings
- [x] Workflow editor แบบฟอร์ม: เพิ่ม/แก้สถานะ, เส้นทางถัดไป, ฟิลด์บังคับ, ผู้อนุมัติ (มี JSON ขั้นสูงสำหรับโครงการ)
- [x] Approval flow: คำขออนุมัติค้าง (request/decide) สำหรับ workflow, ใบสั่งซื้อ และขั้นตอนโครงการ
- [x] หน้าคำขออนุมัติ + แจ้งเตือนคำขอค้างในหน้าเอกสารและ Dashboard
- [x] ไฟล์แนบจริง: upload/download พร้อมmetadata และปุ่มพิมพ์/Save as PDF สำหรับเอกสารหลัก
- [x] Backup/Restore ข้อมูล JSON และนำเข้าข้อมูลเอกสารจาก React เดิม
- [x] Sidebar ย่อ/ขยายได้, Quick search ด้วย Ctrl K, Dashboard ใหม่
- [x] ปฏิทินงานรวมนัดหมาย Ticket, งาน PM, ขั้นตอนโครงการ และกำหนดส่งใบสั่งซื้อ
- [x] SLA บน Ticket (4/8/24/72 ชม. ตามความเร่งด่วน) + แจ้งเตือนเกินกำหนดผ่านกระดิ่ง
- [x] Module Builder: ลากจัดลำดับฟิลด์, ปุ่ม ↑/↓ และเปลี่ยน key ฟิลด์อย่างปลอดภัยพร้อมย้ายข้อมูลเดิม
- [x] Platform event bus: บันทึกเหตุการณ์ record/approval และฟีดเหตุการณ์ใน Settings
- [x] โมดูลบัญชี/การเงิน: ใบแจ้งหนี้, ใบเสร็จ/รับชำระ, ค่าใช้จ่าย พร้อม workflow และภาพรวมการเงินบน Dashboard

ยังเป็นลำดับถัดไป (ตั้งใจไม่ทิ้ง core ERP):
- [x] PDF ฝั่งเซิร์ฟเวอร์จาก template HTML (รองรับภาษาไทย) + ปุ่มดาวน์โหลด PDF
- [x] แจ้งเตือนอีเมล SMTP / LINE Messaging API พร้อมหน้าตั้งค่าและทดสอบ
- [x] Backup/Restore รวมไฟล์แนบไบนารี (base64) และ event log
- [x] Webhook ภายนอกพร้อม HMAC signature, คิว retry อัตโนมัติ และประวัติการส่งใน Settings
- [x] Security hardening: JWT secret บังคับใน production, rate limit login, แยกสิทธิ์ users/roles, กรอง event/audit ตาม scope, file ACL, Webhook SSRF guard, security headers
- [x] Data integrity: ตรวจยอดใบแจ้งหนี้/รับชำระ, กันรับสินค้าเกิน PO, บังคับสิทธิ์ close ตอน reopen, Backup ต้องมี admin และเขียนไฟล์ก่อนลบของเดิม
- [x] Global search ใน Ctrl K ค้นหา record จริงตามสิทธิ์/scope (เลขเอกสาร ชื่อ ลูกค้า สินค้า ฯลฯ)
- [x] ตั้งค่าข้อมูลบริษัท/หัวเอกสาร และใช้บนหัว-ท้าย PDF ทุกประเภท
- [x] การ์ด “รายการที่เชื่อมโยง” ในหน้าเอกสาร (เช่น ลูกค้า → ใบแจ้งหนี้, ใบแจ้งหนี้ → ใบเสร็จ)
- [x] ปรับ text wrapping / overflow: ชื่อ/อีเมล/URL ยาวตัดบรรทัดได้, รายการยาวแสดง 2 บรรทัด, แท็บ wrap บนมือถือ ไม่มี horizontal overflow
- [x] UI resilience: safe-area/notch, modal เลื่อนได้เมื่อคีย์บอร์ดเปิด, StateComponent สำหรับ loading/empty/error, รูปภาพ object-fit และ guard ค่า null/undefined/[object Object]

ยังเป็นลำดับถัดไป (ตั้งใจไม่ทิ้ง core ERP):
- [ ] LINE Notify แบบเก่า และ retry queue สำหรับอีเมล/LINE
- [ ] เครื่องมือออกแบบ template PDF และตั้งเวลาส่งรายงาน
- [ ] พรีวิวรูปแนบ/thumbnail และ Backup แบบ streaming ไป S3
