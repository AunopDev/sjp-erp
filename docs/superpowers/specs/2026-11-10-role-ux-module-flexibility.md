# Role UX & Custom Module Flexibility — Research + Applied Changes

| | |
|---|---|
| วันที่ | 2026-11-10 |
| ขอบเขต | Role-based navigation/workspace, permission UX, custom module builder, module navigation |
| สถานะ | Research complete + first implementation pass |
| อ้างอิง | SAP Fiori, Salesforce, Odoo Studio, ServiceNow App Engine, NetSuite, no-code platforms |

---

## 1. สรุปจากเจ้าที่รีเสิร์ช

### SAP Fiori
- **Spaces & Pages**: 1 space ต่อ business role, 1–5 pages, 2–5 sections ต่อ page, 3–7 apps ต่อ section
- **My Home**: To-Dos (My Inbox), Pages, Apps & Activities, Insights
- Business catalog = สิทธิ์ที่มองเห็น; space = วิธีจัดวาง
- บทบาทควรมี 1–5 roles; เกินกว่านั้นผู้ใช้จะสับสน
- **ใช้ชื่อพื้นที่งาน ไม่ใช่ชื่อ role** และใช้ชื่อ page ตาม task

### Salesforce
- แยก **object permission / field-level security / record sharing** ชัดเจน
- ใช้ **permission sets** ที่ stack ได้ แทน profile ก้อนเดียว
- Object Manager + App Builder + Dynamic Forms: สร้าง object → fields → access → layout → automation → report
- **Dynamic Forms**: ซ่อน/บังคับฟิลด์ตามเงื่อนไขได้ แต่ "ซ่อนไม่ใช่ security"
- Custom object ต้องมี permission set ของ app ตัวเอง

### Odoo
- **Groups** + **ACL (CRUD)** + **Record Rules** แยกชั้น
- Studio: เพิ่ม field, view, automation, approval, security rule ได้โดยไม่เขียนโค้ด
- Field properties: invisible / required / readonly / help / placeholder / default / group visibility
- Studio-created models ได้สิทธิ์ CRUD กับ internal users โดย default — ต้องตั้งกลุ่มเองถ้าต้องการแยก role

### ServiceNow App Engine Studio
- สร้าง app จาก template, กำหนด roles, tables, forms, flows, workspace
- **Workspace Builder**: home, lists, record pages แยกตาม app
- Security ถูกผูกกับ app/role ตั้งแต่ต้น ไม่ใช่เพิ่มทีหลัง

### NetSuite
- **Centers + Roles** กำหนดเมนูและหน้าที่เห็น
- SuiteBuilder: custom records, fields, forms, saved searches, workflows
- Role กำหนด center/tab และระดับสิทธิ์ต่อ record/field

### No-code platforms (Airtable / Power Apps / Zoho Creator)
- เริ่มจาก **template** แล้วปรับ ไม่เริ่มจากหน้าว่าง
- Field types + views (grid/kanban/calendar/form) เป็น configuration
- Permission ระดับ workspace/base/table/field
- การ export/import schema เป็นเรื่องปกติ

---

## 2. หลักการที่นำมาใช้

1. **Role ไม่ใช่ชื่อเมนู** — ใช้พื้นที่งานและงานที่ทำ
2. **เห็นอะไร = สิทธิ์อะไร** — nav, dashboard, quick create, ปุ่ม action ต้องกรองด้วย permission เดียวกัน
3. **Default ตาม role** — ผู้ใช้ควรเห็นงานของตัวเองก่อน แล้วค่อย drilled down
4. **Template-first** — สร้างโมดูลจากแม่แบบที่ตรงงาน ไม่เริ่มจากศูนย์
5. **Module ต้องมีบ้าน** — จัดกลุ่มเมนู/ไอคอน/คำอธิบาย เพื่อไม่ให้ไปกองที่ “โมดูลของฉัน”
6. **สิทธิ์ต้องตั้งได้ตอนสร้าง** — ไม่ต้องสร้างโมดูลแล้วไปไล่ตั้ง role ทีหลัง
7. **Field-level security เป็นเป้าหมายถัดไป** — ตอนนี้ยังเป็น resource-level
8. **Export schema ได้** — ผู้ดูแลสามารถเก็บ/ย้าย/ตรวจโครงสร้างโมดูลได้

---

## 3. ช่องว่างของระบบก่อนปรับ

| ด้าน | ก่อน |
|---|---|
| Dashboard | แสดง KPI/การเงินของโมดูลที่ role ไม่มีสิทธิ์ |
| Sidebar | custom modules ทั้งหมดไปกองที่ “โมดูลของฉัน” |
| Module builder | ไม่มีกลุ่ม/ไอคอน/คำอธิบาย, ตั้ง role access ตอนแก้ไม่ได้ |
| การสร้างโมดูล | เริ่มจากฟิลด์ name เดียวเท่านั้น |
| Role editor | matrix แบน ยาว ไม่มีค้นหา/preset/bulk |
| Navigation | ไม่มี role-specific landing/space |
| Security | resource-level เท่านั้น ยังไม่มี field-level |

---

## 4. สิ่งที่ implement รอบนี้

### 4.1 Role-aware UI
- Dashboard KPI กรองตาม `auth.can`:
  - งานของฉัน (tickets/pm/projects)
  - รออนุมัติ (tickets/purchase/accounting)
  - เคสค้าง (tickets)
  - PM เกินกำหนด (pm)
  - สินค้าต่ำ (warehouse)
  - ใกล้หมดประกัน (assets)
  - การเงิน (accounting)
  - คิวงาน/กราฟเคส (tickets), โครงการ (projects)
- Quick Create และ sidebar กรองตามสิทธิ์อยู่แล้ว

### 4.2 Module metadata
เพิ่มใน `EntityDef` (JSON-only ไม่ต้อง migrate DB):
- `group`: หมวดเมนู (`ภาพรวม`, `งานบริการและโครงการ`, ฯลฯ)
- `icon`: ไอคอน dynamic sidebar
- `description`: คำอธิบายโมดูล

Sidebar จะ merge custom module เข้ากลุ่มที่เลือก ถ้าไม่เลือกจึงไป “โมดูลของฉัน”

### 4.3 Module builder
- เพิ่มช่อง **หมวดเมนู / ไอคอน / คำอธิบาย**
- เพิ่ม **การเข้าถึงของบทบาท** ในหน้าแก้โมดูล
- บันทึก role access แบบ exact: role ที่เลือกได้ view, role ที่ไม่เลือกถูกลบสิทธิ์โมดูลนั้น
- เพิ่ม **แม่แบบโมดูล**:
  - คำขออนุมัติ
  - ทะเบียนอุปกรณ์
  - ผลสำรวจหน้างาน
- เพิ่ม **ตัวเลือกฟิลด์ขั้นสูง** ผ่าน modal:
  - help/tooltip, suffix, unique, readOnly, wide, required, hidden
  - ตัวเลือก select / ปลายทาง ref
  - เปลี่ยน key ได้พร้อมอัปเดต title/columns/filters
- เพิ่ม **ทำสำเนาโมดูล** (คัดลอก fields/layout/group/icon/role access)
- เพิ่ม **นำเข้า JSON schema** ของโมดูล
- เพิ่ม **ส่งออก JSON schema** ของโมดูล

### 4.4 Role editor
- ค้นหาทรัพยากร
- จัดกลุ่มตามโดเมน (งานบริการ, โครงการ, จัดซื้อ/คลัง, บัญชี, ข้อมูลหลัก, ระบบ, โมดูลที่สร้างเอง)
- preset: ทีมบริการ / ทีมโครงการ / จัดซื้อ-คลัง / บัญชี / ผู้จัดการ
- ปุ่ม “ดูทั้งหมด” และ “ล้างสิทธิ์”
- ตั้ง `view` อัตโนมัติเมื่อให้ action อื่น และถอน `view` จะล้างสิทธิ์ทั้ง resource

---

## 5. Roadmap ที่ควรทำต่อ

### P1 — Field-level security
- เพิ่ม `fieldPerms` ต่อ role/resource (JSON) แล้วกรอง field ใน form/list/export
- ต้องแยก “ซ่อนใน UI” กับ “ไม่ส่งข้อมูลจาก API” ให้ชัด

### P2 — Role spaces
- โครงสร้าง `space` ต่อ role: home widgets, pinned apps, default list views
- เก็บใน settings JSON ก่อน แล้วค่อยย้ายเป็นตารางเมื่อนิ่ง

### P3 — Record sharing
- นอกเหนือจาก scope: share ราย record ให้ user/team
- audit การแชร์

### P4 — App/Module lifecycle
- import JSON schema
- version/diff
- duplicate module
- enable/disable module ต่อ role

### P5 — View builder
- list view builder (columns/filters/sort/saved views ต่อ role)
- form layout builder (section/columns/conditions)
- dashboard widgets ต่อ role

---

## 6. Acceptance ของรอบนี้

- สร้างโมดูลจากแม่แบบแล้วได้ field ครบตามแม่แบบ
- เลือกหมวดเมนูแล้วโมดูลไปอยู่กลุ่มนั้นใน sidebar
- เลือก role ตอนสร้าง/แก้ แล้ว role นั้นเห็นโมดูล; role ที่ไม่เลือกไม่เห็น
- Role editor ค้นหา/จัดกลุ่ม/preset ได้ และบันทึกได้
- Dashboard ไม่แสดง KPI ของโมดูลที่ role ไม่มีสิทธิ์
- Build + tests ผ่าน
