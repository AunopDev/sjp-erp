# Responsive UI & Text Overflow Audit (2026-11)

| | |
|---|---|
| วันที่ | 2026-11-10 |
| ขอบเขต | ทุกหน้าใน Angular app, settings ทุกแท็บ, ฟอร์ม/modal, ตาราง, ปฏิทิน, dashboard |
| ความกว้างที่ตรวจ | 1920, 1600, 1440, 1366, 1280, 1200, 1100, 1024, 960, 900, 820, 768, 640, 560, 430, 390, 375, 360, 320 |
| ธีม | light + dark spot check |
| เครื่องมือ | Headless Edge + DOM geometry scan (outside / clipped / squeezed / ellipsis / body scroll) + visual screenshots |

---

## 1. วิธีตรวจ

1. Seed ข้อมูล stress test ที่มีข้อความยาวผิดปกติ:
   - ชื่อบริษัท/ลูกค้า/ผู้ขาย/ไซต์ ยาวมาก
   - email/URL/SKU/เลขที่เอกสารยาว
   - ticket title/symptom/description/note ยาว
   - ชื่อโมดูล custom และ field label ยาว
2. ตรวจทุก route หลัก + entity list/detail + settings ทุกแท็บ
3. ตรวจ 19 ความกว้าง ตั้งแต่ 1920 ถึง 320
4. ตรวจ modal: ฟอร์มลูกค้า, ฟอร์มแจ้งซ่อม, ฟอร์มจองรถ
5. ตรวจ dark mode ที่หน้า dashboard, tickets, vehicles, customers, settings
6. เก็บ aggregate ของ control height / h1 / badge / card padding เพื่อหา inconsistency

---

## 2. ปัญหาที่พบและแก้แล้ว

### 2.1 Dashboard
| ปัญหา | การแก้ |
|---|---|
| `.dash-kpi-meta` ตัดข้อความด้วย ellipsis (ชื่อสินค้ายาว) | เปลี่ยนเป็น wrap เต็มบรรทัด + `overflow-wrap:anywhere` |
| `.queue-main b/span` ตัดชื่อเคส/ไซต์ | wrap เต็ม + ลบ line-clamp บนมือถือ |
| `.bar-label` ตัดชื่อทีม/สถานะ | wrap ได้ |
| KPI สินค้าต่ำแสดงชื่อยาวหลายบรรทัดจนการ์ดสูงผิดปกติ | สรุปเป็น `สินค้าต่ำ N รายการ` เมื่อชื่อรวมยาวเกิน 42 ตัวอักษร |

### 2.2 Calendar
| ปัญหา | การแก้ |
|---|---|
| event chip ในเดือนตัดชื่อยาวด้วย ellipsis | แสดงเวลา (`09:00`) หรือชนิดแบบสั้น (`PM`, `ขั้นตอน`, `PO`, `รถ`) และเก็บชื่อเต็มใน `title` |
| agenda title ถูกตัด | wrap เต็ม พร้อม `overflow-wrap:anywhere` |
| `.cal .ev` ยังใช้ ellipsis จาก rule เก่า | เปลี่ยนเป็น `text-overflow: clip` |

### 2.3 Quick Create / Page actions
| ปัญหา | การแก้ |
|---|---|
| `เพิ่มสินค้า/อุปกรณ์/อะไหล่` ถูกตัดใน quick create | ใช้ label สั้น `เพิ่ม` เมื่อชื่อยาว |
| ปุ่ม page action `+ เพิ่ม{ชื่อโมดูลยาว}` ล้นจอ | ใช้ `เพิ่มรายการ` เมื่อชื่อยาว + `title` แสดงชื่อเต็ม |
| `เพิ่มSerial Number`, `เพิ่มไซต์งาน/สถานที่` ยังตัดบนมือถือ | คำนวณความยาวรวมกับคำว่า `เพิ่ม` ก่อนตัดสินใจ |

### 2.4 Sidebar / Module Builder
| ปัญหา | การแก้ |
|---|---|
| ชื่อโมดูลยาวถูกตัดใน sidebar | เพิ่ม metadata `navLabel` (ชื่อเมนูสั้น) + ฟิลด์ใน Module Builder |
| sidebar ใช้ ellipsis | เปลี่ยนเป็น wrap เต็ม, ปรับ padding |
| ชื่อโมดูลยาวทำให้ breadcrumb ยาวเกิน | breadcrumb ใช้ `navLabel`; ถ้ายังยาวเกิน 28 ตัวอักษรแสดง `รายการ` |
| module label ยาวเกินไป | จำกัด input 60 ตัวอักษร, navLabel 40 ตัวอักษร |

### 2.5 Role Editor
| ปัญหา | การแก้ |
|---|---|
| บนมือถือ ตาราง role matrix ถูกบีบ ทำให้ key `(stress_long_text)` แตกเป็นแนวตั้ง | เปลี่ยนเป็น **card view** บน <=960px พร้อม checkbox ที่มี label ครบทุก action |
| ตาราง desktop ต้องเทียบสิทธิ์หลายคอลัมน์ | sticky คอลัมน์แรก (ทรัพยากร) |
| key ยาวใน card | wrap ด้วย `overflow-wrap:anywhere` |

### 2.6 ตาราง / เอกสาร
| ปัญหา | การแก้ |
|---|---|
| ตาราง PO lines ถูกบีบหัวคอลัมน์ `สั่ง`, `รับแล้ว` เป็นแนวตั้ง | `min-width: 560px` + `white-space: nowrap` ให้เลื่อนแนวนอน |
| `td:first-child` ถูกบังคับ nowrap ทำให้ชื่อยาวไม่ wrap | เปิดให้ wrap; คง nowrap เฉพาะปุ่มใน action column |
| palette/related list ถูก line-clamp | เปลี่ยนเป็น wrap เต็ม |

### 2.7 ฟอร์ม / ควบคุม
| ปัญหา | การแก้ |
|---|---|
| filter ของ vehicle 30px ขณะที่ฟอร์ม 34px | ปรับ `.vb-search`, `.vb-status-filter`, `.role-search` เป็น 34px |
| ชื่อรถยาวใน availability grid ทำให้แถวสูงมาก | จำกัด 2 บรรทัด + `title` แสดงชื่อเต็ม + แสดงทะเบียน/ประเภทใต้ชื่อ |

### 2.8 Search / Breadcrumb
| ปัญหา | การแก้ |
|---|---|
| search box ตัดข้อความสั้น `ค้นหาทั่วระบบ…` | `min-width: max-content` ให้ label ไม่ถูกบีบ |
| breadcrumb ยาว | ใช้ `navLabel` + fallback `รายการ` |

---

## 3. ค่ามาตรฐานที่ใช้

| องค์ประกอบ | ค่า |
|---|---|
| ปุ่มปกติ | 32px |
| ปุ่มเล็ก | 26px |
| ปุ่ม icon ในตาราง | 18–20px |
| input/select/textarea | 34px (textarea ตาม rows) |
| h1 desktop | 22px |
| h1 tablet <=900 | 20px |
| h1 mobile <=560 | 19px |
| badge | ~19.6px |
| card padding | 16px 18px; mobile 14px |
| content max-width | 1600px |

---

## 4. ผลตรวจรอบสุดท้าย

- Responsive audit 19 widths: **0 กลุ่มปัญหา** (ไม่มี body horizontal scroll / ไม่มี text นอกจอ / ไม่มี squeezed label)
- UI audit 5 widths + settings ทุกแท็บ + modal + dark: **0 กลุ่มปัญหา** หลังแก้
- ตรวจด้วยภาพที่ 1440 / 1280 / 1024 / 768 / 540 / 390 / 375 / 360 / 320
- ฟอร์ม/modal ที่ 320px ใช้งานได้: 1 คอลัมน์, footer ปุ่มครบ
- Quick create dropdown ที่ 320px อยู่ในจอ
- Role editor ที่ 390px ใช้ card view อ่านและตั้งสิทธิ์ได้ครบ

---

## 5. หลักที่ใช้ต่อจากนี้

1. ข้อความใน content ต้อง wrap ได้ ไม่ใช้ ellipsis กับชื่อ/รายละเอียด
2. ถ้าพื้นที่แคบมาก ให้ใช้ label สั้นที่ออกแบบไว้ (`navLabel`, `เพิ่ม`) ไม่ตัดข้อความ
3. ตารางกว้างให้ scroll แนวนอน ไม่บีบคอลัมน์จนตัวอักษรตั้ง
4. ตารางที่มี action หลายคอลัมน์ ใช้ card view บนมือถือพร้อม label
5. ทุกครั้งที่เพิ่มหน้าใหม่ ต้องรัน audit ที่ 1440 / 768 / 390 / 320 อย่างน้อย
