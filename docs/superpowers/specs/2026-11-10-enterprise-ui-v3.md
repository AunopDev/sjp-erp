# SJP ERP — Enterprise UI v3

| | |
|---|---|
| วันที่ | 2026-11-10 |
| สถานะ | Implemented |
| ขอบเขต | Design tokens, shell, dashboard, ตาราง/ฟอร์ม/ปุ่ม/แท็บ/การ์ด, light/dark, mobile |
| อ้างอิง | Stripe Dashboard, Salesforce Lightning (SLDS), SAP Fiori, NetSuite Redwood, Linear, Odoo 18 |

## 1. บทเรียนจากเจ้าที่ตรวจ

### Stripe Dashboard
- เปลี่ยนจาก "card soup" เป็น **card-less dashboard**: เส้นคั่น บรรทัด และ typography ทำ hierarchy แทนกล่องหนา
- Home แสดง **ตัวเลขสำคัญ 5 ตัว** ไม่ใช่กริดกราฟขนาดใหญ่
- ใช้สีเฉพาะสถานะ (สำเร็จ/ล้มเหลว/รอ) ไม่ไล่สีทุกหมวด
- ตารางการเงินหนาแน่น แต่เว้นวรรคสม่ำเสมอ และ sticky columns/filters

### Salesforce Lightning (SLDS)
- Body 13px, page title 20px, label 12px
- Side panel 240px, global header 50px
- ตาราง compact: padding 8–12px, header สีอ่อน, ตัวเลขใช้ tabular-nums
- มี density setting: compact/comfy — งาน ERP ควรเริ่มที่ compact

### SAP Fiori
- Action อยู่ใกล้ข้อมูลที่มันกระทำ: page header ขวา, workflow action อยู่ footer
- **primary action มีได้หนึ่งตัวต่อหน้า**
- จัดกลุ่ม action ตามหน้าที่ ไม่ยัดทุกปุ่มเสมอกัน

### NetSuite Redwood
- Sticky header + global search กลางจอ + Create New มุมขวา
- Hover/focus เผย secondary controls (progressive disclosure)
- เมนูใหญ่ขึ้น/แตะง่ายขึ้น แต่ยังคงความหนาแน่นของข้อมูล

### Linear
- Sidebar ควร **ถอยหลัง** เมื่อผู้ใช้ถึงหน้าเป้าหมาย; content คือพระเอก
- 4px grid, ตัวอักษร 12–14px, ไอคอนเล็กลง, ลดสีตกแต่ง
- เส้นแบ่งมีน้อยลงและอ่อนลง

### Odoo 18
- Application bar + global search + breadcrumb + side navigation
- List view หนาแน่น, form view มี status bar, action ด้านบน, sticky header/footer

## 2. Direction ที่เลือก

**"Calm operations console"** — neutral, dense, rectilinear, ใช้สีแดงเฉพาะแบรนด์/action/สถานะ

- พื้นหลังเทาอ่อน cool gray, การ์ดขาวแบน ไม่มี gradient/radial/beige
- Typography: IBM Plex Sans Thai 13.5–14px, heading 20–24px, label 11.5–12px
- Radius 4–8px (ไม่ใช่ 18–24px), เงาแทบไม่มี
- Sidebar 248px แบบ inverted-L ติดขอบจอ; ไม่ลอยเป็น card
- Topbar 56px ติดขอบจอ; search กลางขวา, Create New ขวาสุด
- Dashboard แบบ card-less: header → KPI strip → work queue + activity → finance → charts
- Dark mode neutral slate ไม่ใช่น้ำตาลอบอุ่น

## 3. Token

| Token | Light | Dark |
|---|---|---|
| bg | `#f6f7f9` | `#0d1117` |
| card | `#ffffff` | `#151b23` |
| ink | `#111827` | `#e6edf3` |
| muted | `#5b6472` | `#9aa4b2` |
| line | `#dfe3e8` | `#28313d` |
| line2 | `#eceff3` | `#1e2631` |
| pri | `#d92c34` | `#f0525a` |
| pri-l | `#fef2f3` | `rgba(240,82,90,.13)` |
| ok | `#067647` | `#4ade80` |
| warn | `#b54708` | `#fbbf24` |
| bad | `#b42318` | `#f87171` |

Radius: xs 4 / sm 6 / md 8 / lg 10

## 4. โครงสร้าง Dashboard ใหม่

1. Page header: kicker + title + subtitle + actions (1 primary)
2. KPI strip 6 ช่อง: งานของฉัน, รออนุมัติ, เคสค้าง, PM เกินกำหนด, สินค้าต่ำ, ใกล้หมดประกัน
3. Work queue (ซ้าย) + Activity (ขวา)
4. Finance strip 4 ตัวเลข
5. Charts 3–4 คอลัมน์: สถานะ, ทีม, ผู้รับผิดชอบ, ขั้นตอนโครงการ

## 5. Acceptance

- 1440/1024/768/390 ไม่มี horizontal overflow
- Page title ไม่เกิน 24px, body 13–14px
- Light/dark contrast ≥ 4.5:1 สำหรับข้อความหลัก
- Primary action มีหนึ่งตัวต่อ header
- Sidebar/topbar ติดขอบจอ ไม่ลอย
- Dashboard ไม่ใช่กริดการ์ดหนา; ตัวเลข KPI อ่านได้ใน 3 วินาที
- ตาราง compact อ่านสบาย, ตัวเลข tabular
- Build/test ผ่าน
