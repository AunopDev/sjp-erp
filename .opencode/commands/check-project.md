---
description: ตรวจสุขภาพโปรเจ็ค SJP ERP และรายงานบั๊ก/ความเสี่ยงแบบอ่านอย่างเดียว
agent: project-guardian
subagent: true
---

ตรวจสอบโปรเจ็ค SJP ERP ตามขั้นตอนของ Project Guardian อย่างครบถ้วน:

1. รัน `npm run health` (หรือ `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/project-health.ps1 -SkipAudit` ถ้าเวลาจำกัด)
2. อ่านรายงานล่าสุดใน `checks/reports/` และเปรียบเทียบกับรายงานก่อนหน้า
3. ตรวจโค้ดจุดเสี่ยงสูงตามรายการใน system prompt (auth/permissions, records, metadata rename, backup, files/PDF, webhooks/notify, workflow, accounting, Angular security)
4. รายงานเป็นภาษาไทยตามรูปแบบที่กำหนด โดยเรียง Critical → High → Medium → Low และมีหลักฐาน file:line ทุกข้อ

โฟกัสเพิ่มเติมจากผู้ใช้: $ARGUMENTS

จำไว้: ห้ามแก้ไขไฟล์หรือทำลายข้อมูล — รายงานเท่านั้น
