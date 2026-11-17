# Aunop Dev Skill Review — SJP ERP

| | |
|---|---|
| วันที่ | 2026-11-13 |
| สกิล | `aunop-dev-skill` (playbook เจ้าของ) |
| ขอบเขต | `server/` (NestJS/SQLite) + `web/` (Angular) — โค้ด, API/ข้อมูล, security, flow หลัก, UI checklist |
| วิธี | อ่าน `owner-profile.md`, `coding-playbooks.md` (E), `coding-standards.md`, `review-checklist.md`, `security.md`, `api-design.md`, `database-design.md`, `ui-patterns.md` (7–8), `ux-ui.md`; ไล่โค้ดจริง + รัน build/lint/test/check-code |
| สถานะ | แก้ไข findings ที่เป็นโค้ดแล้ว 9 กลุ่ม (ดู §9) — ข้อที่เป็นสถาปัตยกรรม/ผลิตภัณฑ์ยังรอตัดสินใจ |

---

## สรุป

โปรเจ็คมีฐานที่ดีกว่าค่าเฉลี่ย: auth ใช้ HttpOnly cookie + CSRF + rate limit, ตรวจสิทธิ์ที่ server, ไฟล์ตรวจ signature, webhook กัน SSRF และมี HMAC, backup เข้ารหัส, และมี audit/event กลาง

แต่เมื่อเทียบกับ playbook ของเจ้าของ มี **ข้อขัดแย้งระดับโปรเจ็ค 5 เรื่อง** ที่ต้องตัดสินใจก่อน (สองภาษา, ชื่อตาราง/คอลัมน์, วันที่ พ.ศ., เงินเป็นสตางค์, ความหนาแน่นปุ่ม 36 vs 44px) และพบ **จุดเสี่ยงที่ควรแก้ก่อน** ด้าน data integrity (รหัสเอกสารชนกันเมื่อสร้างพร้อมกัน, เงินเป็น float), privacy (ตอบ 403 แทน 404 เมื่อไม่มีสิทธิ์), และประสิทธิภาพ (N+1/โหลดทั้งตารางใน list หลายจุด)

หลังรีวิวได้แก้ฝั่งโค้ดแล้ว: 404 แทน 403, atomic document counter + unique index, transaction สำหรับ record/audit/event, date formatter ไทย พ.ศ./อังกฤษ ค.ศ., timeout ของ LINE/SMTP, N+1 ของ purchase list, และ query limit ของ audit/events — ส่วน idempotency, เงินเป็นสตางค์, FK/ชื่อตาราง, สองภาษา และ error envelope ยังเป็นข้อตัดสินใจ

---

## 1. ข้อขัดแย้งกับ owner-profile — ต้องตัดสินใจก่อน

| เรื่อง | owner-profile กำหนด | สภาพปัจจุบัน | ผลกระทบ / ข้อเสนอ |
|---|---|---|---|
| หน้าจอสองภาษา | ไทย + อังกฤษ สลับได้ทุกหน้า ข้อความทุกชิ้นอยู่ในไฟล์แปล | UI เป็นไทยล้วน ข้อความ hard-code ใน template/component | เป็นงานใหญ่แต่เป็นข้อกำหนดหลัก; ต้องตัดสินใจว่าจะทำ i18n ตอนนี้หรือยอมรับ exception เป็นรายโปรเจ็ค |
| ชื่อตาราง/คอลัมน์ | `*_tb`, `<name>_id`, `<name>_create_date`, `<name>_update_date` | `users`, `roles`, `records`, `created_at`, `password_hash` | ห้าม rename ทั้งระบบโดยพลการ; ต้องทำ migration plan + compatibility ก่อน |
| วันที่บนหน้าจอ | `dd/MM/yyyy` ไทยใช้ พ.ศ. (`13/11/2569`) | `Intl.DateTimeFormat('th-TH-u-ca-gregory', { month:'short' })` → ปี ค.ศ. และเดือนย่อ | แก้ที่ `web/src/app/core/util.ts` จุดเดียว; แต่ต้องรองรับ EN ด้วยถ้าทำสองภาษา |
| เงิน | จำนวนเต็มสตางค์ หรือ `numeric` | `unitPrice`/`amount` เป็น `number` (float) ใน JSON และคำนวณ float | เสี่ยงปัดเศษ; ต้องตัดสินใจแปลงเป็นสตางค์ทั้ง schema/API/UI |
| เป้ากด | อย่างน้อย 44×44px ทุกขนาดจอ | ปุ่ม/คอนโทรลหลัก 30–36px ตาม `DESIGN.md` (density) | ขัดกับ design system เดิม; ต้องเลือกความหนาแน่นหรือเพิ่ม hit area โดยไม่เปลี่ยนหน้าตา |
| เก็บ record | JSON เฉพาะเมื่อไม่ต้องกรอง/join | ทุกเอกสารอยู่ใน `records.data` JSON และกรอง/เรียงด้วย `json_extract` | เป็นแกนของ metadata-driven ERP; ถ้าคงไว้ต้องยอมรับข้อจำกัด index/constraint |

> ทั้ง 6 ข้อนี้ไม่ควรแก้เงียบ ๆ ในรีวิวโค้ด — ต้องมีคำตอบเจ้าของก่อน ตามกฎ "ถ้าคำสั่งขัดกับข้อกำหนด ให้หยุดส่วนที่ขัดและถาม"

---

## 2. Findings — ต้องแก้

### [ต้องแก้] `server/src/common/access.service.ts:98-100` + `server/src/records/records.service.ts:209-214` — ตอบ 403 เมื่อไม่มีสิทธิ์ ทำให้รู้ว่าข้อมูลมีอยู่

**เกิดอะไรขึ้น:** `records.get()` อ่านแถวก่อน แล้วเรียก `requireSee()` ซึ่งโยน `ForbiddenException` เมื่อผู้ใช้ไม่มีสิทธิ์เห็น record นั้น ผู้ใช้ที่เดา id ได้จึงแยกได้ว่า "ไม่มีรายการ" (404) กับ "มีแต่ไม่มีสิทธิ์" (403) ต่างจาก checklist ความปลอดภัยของเจ้าของที่ให้ตอบ 404 เมื่อไม่ควรเปิดเผยว่ามีอยู่

**แนะนำ:** เปลี่ยน `requireSee` ให้โยน `notFound('ไม่พบรายการ')` ในเส้นทางที่ผู้ใช้ไม่มีสิทธิ์เห็น (หรือแยก `requireSeeOr404`) และคง 403 ไว้เฉพาะกรณีที่การรู้ว่ามีอยู่ไม่เป็นความลับ (เช่น เอกสารที่ผู้ใช้มีสิทธิ์แก้แต่ติด workflow)

### [ต้องแก้] `server/src/records/records.service.ts:722-727` + `:243-255` — รหัสเอกสารอาจซ้ำเมื่อสร้างพร้อมกัน

**เกิดอะไรขึ้น:** `nextCode()` เป็น read → +1 → write บนตาราง `counters` โดยไม่มี transaction/conditional update/unique constraint; คำขอสร้างสองรายการพร้อมกันสามารถอ่านค่าเดียวกันแล้วได้ `TK-0013` ซ้ำกันได้ และตาราง `records` ไม่มี unique `(entity, code)`

**แนะนำ:** ใช้ `UPDATE counters SET value = value + 1 WHERE entity = ? RETURNING value` ใน transaction เดียวกับการ insert record หรือเพิ่ม unique index `(entity, code)` แล้ว retry เมื่อชน; อย่าพึ่งการเช็ค "มีอยู่แล้วหรือยัง" อย่างเดียว

### [ต้องแก้] `server/src/meta/entities.ts:670` + `server/src/operations/purchasing.service.ts:45-47` — เงินเป็น float

**เกิดอะไรขึ้น:** `unitPrice` เป็น `number` และ `amount()` คูณ `Number(qty) * Number(unitPrice)` เป็นทศนิยมฐานสอง; ยอดรวม/ภาษี/รับชำระใช้ `Math.abs(... ) > 0.01` เพื่อกลบเศษ ซึ่งเป็นสัญญาณว่า precision ไม่คงที่

**แนะนำ:** เก็บเป็นจำนวนเต็มสตางค์ (`*_satang`) หรือ `numeric` ตาม owner-profile; แปลงที่ boundary และ format ที่ UI; เพิ่ม test ปัดเศษ/ภาษี/รับชำระบางส่วน

### [ต้องแก้] `web/src/app/core/util.ts:46-58` — วันที่แสดงเป็น ค.ศ. และเดือนย่อ ไม่ตรง owner-profile

**เกิดอะไรขึ้น:** `th-TH-u-ca-gregory` บังคับปฏิทิน Gregorian และ `month:'short'` ทำให้ได้ เช่น `13 พ.ย. 2026` แทน `13/11/2569`; ขณะที่ PDF ฝั่ง server ใช้ `th-TH` ซึ่งเป็น พ.ศ. → หน้าจอกับ PDF แสดงปีไม่ตรงกัน

**แนะนำ:** ทำ formatter กลางตัวเดียวที่รับภาษา: `th` → `dd/MM/yyyy` + ปี พ.ศ., `en` → `dd/MM/yyyy` + ค.ศ.; ใช้ทั้งหน้าเว็บและ PDF; เพิ่ม test 29 ก.พ. และการสลับภาษา

---

## 3. Findings — ควรแก้

### [ควรแก้] `server/src/records/records.service.ts:255-272` + `server/src/common/audit.service.ts:23-38` + `server/src/events/events.service.ts:43-58` — record + audit + event ไม่ได้อยู่ transaction เดียว

**เกิดอะไรขึ้น:** `create()` insert record สำเร็จก่อน แล้วจึงเรียก `audit.log()` และ `events.publish()` ซึ่ง insert คนละคำสั่ง; ถ้า audit/event ล้มเหลว record จะอยู่โดยไม่มีร่องรอย หรือผู้ใช้เห็นสำเร็จแต่ event หาย

**แนะนำ:** ใช้ `db.transaction` ครอบ insert record + audit + event (ส่ง `tx` เข้า service หรือทำ outbox); ถ้า event ต้องยิงภายนอก ให้ใช้ transactional outbox ตาม `database-design.md`

### [ควรแก้] `server/src/records/records.controller.ts:33-40` — POST สร้าง record ไม่มี idempotency

**เกิดอะไรขึ้น:** การกดบันทึกซ้ำ/เน็ตช้า/retry จะสร้าง record ใหม่ทุกรอบ เพราะไม่มี `Idempotency-Key` หรือ unique client token; เอกสารมีเลขรันใหม่ทุกครั้ง

**แนะนำ:** รับ `Idempotency-Key` จาก client, เก็บ key + response ด้วย unique constraint, คำขอซ้ำคืนผลเดิม; หรือให้ client สร้าง UUID และใช้เป็น idempotency key

### [ควรแก้] `server/src/operations/purchasing.service.ts:20-27` + `:64-72` — list PO โหลดทุกใบและวน stockMoves ต่อใบ (N+1)

**เกิดอะไรขึ้น:** `list()` เรียก `records.all('purchaseOrders')` (โหลดทุกแถว) แล้ว لكل PO เรียก `received()` ซึ่งวน `records.rawAll('stockMoves')` ทั้งตาราง; ต้นทุนโตตามจำนวน PO × จำนวน stock move

**แนะนำ:** query stock moves ครั้งเดียวแล้ว group ด้วย `po`/`item`; ใส่ pagination ให้ list; ถ้าต้องใช้บ่อยให้ทำ view/query ที่ aggregate ฝั่ง DB

### [ควรแก้] `server/src/common/access.service.ts:79-84` + `:217-220` — dept scope  query ต่อ record และ rawScoped กรองใน memory

**เกิดอะไรขึ้น:** `canSee()` กรณี `dept` query ตาราง `users` ต่อหนึ่ง record; `rawScoped()` โหลดทุก record แล้ว filter ด้วย `canSee()` ทำให้ list ที่มี scope เป็น O(n) queries / O(n) memory

**แนะนำ:** แปลง scope เป็น SQL predicate เหมือน `records.list` (join users/dept) หรือ cache dept ของผู้ใช้; หลีกเลี่ยง `rawScoped` ในเส้นทาง list

### [ควรแก้] `server/src/events/events.service.ts:71-80` + `server/src/common/audit.service.ts:42-48` — โหลดทั้งตารางแล้ว slice/filter ใน memory

**เกิดอะไรขึ้น:** `events.list()` และ `audit.recent()` ใช้ `select().from(...).all()` แล้วค่อย filter/slice; ตารางโตขึ้นเรื่อย ๆ และไม่มี limit ที่ DB

**แนะนำ:** ใส่ `where`, `orderBy`, `limit` ใน query; ถ้าต้องกรองตามสิทธิ์ record ให้ join/where ตั้งแต่ DB

### [ควรแก้] `server/src/files/files.service.ts:146-154` — ตรวจสิทธิ์ไฟล์ด้วย `LIKE '%id%'` ทั้งตาราง

**เกิดอะไรขึ้น:** `canRead()` ค้น `records.data LIKE '%<fileId>%'` ซึ่ง full scan และอาจเจอ id ใน field ที่ไม่เกี่ยวกับไฟล์; จากนั้นค่อย filter ด้วย JSON string อีกครั้ง

**แนะนำ:** เก็บ relation `record_files` (record_id, file_id) หรืออย่างน้อย query เฉพาะ field ที่เป็น file; ใส่ index; หลีกเลี่ยง `%...%` กับข้อมูลที่โต

### [ควรแก้] `server/src/notify/notify.service.ts:182-190` — LINE fetch ไม่มี timeout

**เกิดอะไรขึ้น:** `fetch()` ไป LINE ไม่มี `AbortSignal.timeout()`; ถ้า LINE ช้า/ค้าง คำขอที่เรียก notify อาจค้างจน timeout ของ proxy และผู้ใช้ไม่ได้รับผล

**แนะนำ:** ใส่ `signal: AbortSignal.timeout(10_000)` และจัดการ error เป็นข้อความที่ผู้ใช้แก้ได้; ตรวจ SMTP transporter ว่ามี connection/greeting timeout ด้วย

### [ควรแก้] `server/src/db/schema.ts` — ไม่มี foreign key/unique ตาม owner DB standard

**เกิดอะไรขึ้น:** `users.role_id`, `records.entity`, `approvals.record_id`, `files.uploaded_by` ฯลฯ เป็น text เปล่า ไม่มี `.references()`; `records` ไม่มี unique `(entity, code)`; `roles`/`settings`/`counters` ไม่มี create/update date ตามกฎ; แม้เปิด `PRAGMA foreign_keys=ON` ก็ไม่มี constraint ให้บังคับ

**แนะนำ:** เพิ่ม FK/unique ใน migration ใหม่ (ไม่แก้ migration เก่า) หลังตรวจข้อมูลซ้ำ; ถ้า metadata-driven ต้องเก็บ JSON ต่อ ให้เพิ่ม unique `(entity, code)` และ index ที่필ด์ที่ใช้กรองบ่อย

### [ควรแก้] `server/src/main.ts:47` + `server/src/records/records.controller.ts:36-40,52-56` — boundary validation ไม่เป็น schema

**เกิดอะไรขึ้น:** `ValidationPipe` ตรวจเฉพาะ DTO ที่มี decorator; `records` รับ `Record<string, unknown>` แล้วให้ service `sanitize` ตาม metadata — ดีในแง่ธุรกิจ แต่ไม่ใช่ schema ที่ boundary ตาม owner standard (Zod/StandardSchema) และ type ของ body ไม่ได้ถูกตรวจก่อนเข้า service

**แนะนำ:** ใช้ `StandardSchemaValidationPipe` ของ Nest กับ Zod schema สำหรับ body/query ของ records (หรืออย่างน้อย schema ของ filter/sort/page) แล้วให้ service ตรวจกฎธุรกิจต่อ; AGENTS.md ระบุว่า Nest เวอร์ชันนี้รองรับ Standard Schema

### [ควรแก้] `server/src/common/exceptions.ts:1-18` + `web/src/app/core/api.service.ts:11-36` — error shape ไม่มี `code`/`trace_id`

**เกิดอะไรขึ้น:** error ใช้ `message`/`fieldErrors` ของ Nest เป็นหลัก; frontend ตัดสินใจจากข้อความ/status ไม่มี code คงที่ และไม่มี trace id ให้ support ตามรอย

**แนะนำ:** กำหนด error envelope กลาง `{ code, message, trace_id, details }`; ค่อย ๆ migrate โดยคง `message`/`fieldErrors` ไว้ช่วงเปลี่ยนผ่าน; เพิ่ม trace id จาก middleware

### [ควรแก้] type safety — `check-code` พบ 20 error ฝั่ง server และ 9 error ฝั่ง web

**เกิดอะไรขึ้น:** ตัวอย่างจริง: `server/src/meta/meta.controller.ts:60,68` cast `EntityDto` เป็น `EntityDef`; `server/src/backup/backup.service.ts:209-219` cast หลัง array check; `web/src/app/core/meta.service.ts:61` cast workflows; `web/src/app/core/storage.ts` มี empty catch หลายจุด

**แนะนำ:** แยกเป็นงานย่อย: (1) ทำ schema/type ของ `EntityDef` ให้ตรง DTO, (2) type `workflows` เป็น `Record<string, {statuses?: WorkflowStatus[]}>`, (3) ใส่ comment/logger ใน catch ที่เป็น best-effort, (4) อย่าแก้ `check-code` false positive ของ Drizzle SQL (ดูข้อ 5)

---

## 4. Findings — เสนอแนะ

- **`server/src/records/records.service.ts:124,163,168`** — `check-code` รายงาน `sql-interpolation` แต่โค้ดใช้ Drizzle `sql` template ซึ่ง bind ค่าเป็น parameter; `${user.dept}`, `${pattern}`, `${path}` ไม่ได้ต่อ string ดิบ. **ไม่ควรแก้ตามสคริปต์** — เก็บโค้ดไว้และระบุว่าเป็น false positive หลังตรวจแล้ว
- **`server/src/main.ts:50`** — `console.log` แทน logger ของโปรเจ็ค; ย้ายเป็น `Logger`/structured log
- **Comments ภาษาอังกฤษ** — `server/src/records/records.service.ts:51-68` และอื่น ๆ; owner-profile กำหนดคอมเมนต์ไทย (อธิบายเหตุผล)
- **`web/src/app/core/storage.ts:20,50,66,87,116,137,158`** — empty catch ของ localStorage; เป็น best-effort แต่ควรมี comment ว่าทำไมกลืน และ log ระดับ debug
- **`server/src/db/database.service.ts:176-180` / `files.service.ts:78,139,237`** — empty catch ของ chmod/unlink; เป็น best-effort แต่ควร comment ให้ชัด (บางจุดมีแล้ว)
- **UI control height 36px** — `web/src/styles.css` และ `DESIGN.md:68`; ขัดกับ 44px ของ owner UI checklist. ถ้าคง density ให้เพิ่ม invisible hit area แทนการเปลี่ยน visual height
- **ไม่มี i18n** — ข้อความไทย hard-code ใน `web/src/app/pages/login.component.ts:14-17` และหน้าอื่น ๆ; เป็นงานใหญ่ ต้องตัดสินใจก่อน

---

## 5. สิ่งที่ตรวจแล้ว (มีหลักฐาน)

```text
server build          ผ่าน (nest build)
server lint           0 error, warning จำนวนมาก (no-base-to-string / restrict-template-expressions)
server unit test      14/14 ผ่าน (5 files; เพิ่ม test วันที่ พ.ศ.)
server e2e test       18/18 ผ่าน (2 files)
web build             ผ่าน
web unit test         16/16 ผ่าน (4 files; เพิ่ม test วันที่)
check-code server/src 86 ไฟล์: error 20, warn 10
check-code web/src/app 60 ไฟล์: error 9, warn 1
```

**Manual trace ที่ตรวจแล้ว:**
- `AuthGuard`: JWT จาก Bearer/cookie, ตรวจ `passwordVersion` + `sessionVersion`, CSRF สำหรับ cookie ที่ไม่ใช่ GET/HEAD/OPTIONS — ถูกต้อง
- `AuthController`: cookie `HttpOnly`, `SameSite`/`Secure` ตาม env, rate limit login/setup 5/นาที — ถูกต้อง
- `FilesService`: whitelist นามสกุล, ตรวจ signature, จำกัด 15 MB/จำนวนไฟล์/พื้นที่ผู้ใช้, ตั้งชื่อไฟล์ใหม่, ตรวจสิทธิ์ตอนดาวน์โหลด — ถูกต้อง
- `WebhooksService`: ตรวจ URL ด้วย `assertSafeUrl`, pin IP, HMAC SHA-256, retry พร้อม timeout 10s — ถูกต้อง
- `BackupService`: เข้ารหัส backup, ตรวจ array ก่อน restore, transaction ตอน restore — ถูกต้อง (cast หลัง array check เป็น false positive ของ check-code)
- `RecordsService`: sanitize ตาม field definitions, validate required/ref/rows/ตัวเลข/วันที่, ตรวจ scope ตอนอ่าน — ถูกต้องในเส้นทางปกติ
- `AccessService`: สิทธิ์จาก role ฝั่ง server, admin bypass, scope own/team/dept/project/site — ถูกต้องเชิงตรรกะ แต่มี N+1 ตามข้อ 3
- `nextCode()`: รันกับ SQLite in-memory จริง ได้ `TK-0001`, `TK-0002`, `PRJ-0001` — atomic upsert ทำงาน
- Unique index: `records_entity_code_uq` ถูกสร้างบนฐานข้อมูลปัจจุบัน (ไม่มี code ซ้ำ)

---

## 6. ยังไม่ได้ตรวจ

- **UI runtime หลังการเปลี่ยนแปลงล่าสุด** ที่ 360/768/1024/1440px และ keyboard/screen reader — browser tool ไม่เสถียรในเซสชันนี้; prior audit `docs/ui-ux-skill-audit-2026-11-13.md` ครอบ 320–1920 แต่ก่อนการแก้รอบนี้
- **Concurrency test ของ `nextCode`** — ยังไม่มี test ที่ยิงสร้างพร้อมกัน; ข้อสรุปอ้างจากการอ่านโค้ด
- **Idempotency test** — ยังไม่มี
- **Migration/rename ตาราง** — ไม่ได้รัน (และไม่ควรทำก่อนตกลง)
- **SMTP/LINE จริง** — ไม่มี credential; ตรวจได้แค่โค้ด
- **Production observability** — ไม่ได้เชื่อม NestJS Observe MCP; ไม่มี trace จริงให้ดู

---

## 7. สมมติฐานและคำถามถึงเจ้าของ

1. **สองภาษา:** จะทำ i18n ทั้งระบบตอนนี้ หรือยกเว้นโปรเจ็คนี้อย่างเป็นทางการ?
2. **ชื่อตาราง/คอลัมน์:** จะทำ migration ไป `_tb`/`<name>_id` หรือคง schema เดิมและยกเว้นกฎ?
3. **วันที่:** จะให้หน้าจอไทยเป็น พ.ศ. ตาม owner-profile และ PDF ใช้ formatter เดียวกันหรือไม่?
4. **เงิน:** จะเปลี่ยนเป็นสตางค์/numeric หรือคง float พร้อมยอมรับความคลาดเคลื่อน?
5. **Validation:** จะย้ายไป Zod/StandardSchemaValidationPipe ตาม AGENTS.md หรือคง class-validator DTO?
6. **Error envelope:** จะเพิ่ม `code`/`trace_id` แบบ breaking change หรือค่อย ๆ เพิ่มแบบ backward-compatible?
7. **44px:** จะคง density 36px ของ ERP หรือเพิ่ม hit area 44px โดยไม่เปลี่ยนหน้าตา?

---

## 8. ข้อจำกัดของรายงานนี้

- ตัวเลข `check-code` เป็นการตรวจแบบ text pattern; บางรายการเป็น false positive (โดยเฉพาะ Drizzle `sql` template และ cast หลัง `Array.isArray`) — ระบุไว้ในข้อ 4
- ไม่ได้ยืนยันพฤติกรรม runtime ของ UI/เส้นทาง network จริงในรอบนี้

---

## 9. สถานะหลังแก้ไข (2026-11-13)

### แก้แล้ว

| ข้อ | สิ่งที่แก้ | ไฟล์ |
|---|---|---|
| 403 → 404 | `requireSee()` ตอบ 404 เมื่อไม่มีสิทธิ์เห็น record | `server/src/common/access.service.ts` |
| รหัสเอกสารชนกัน | เปลี่ยน `nextCode()` เป็น atomic upsert + unique index `(entity, code)` | `server/src/records/records.service.ts`, `server/src/db/database.service.ts` |
| record/audit/event ไม่ atomic | ครอบ create/update/patchSystem ด้วย `db.transaction` | `server/src/records/records.service.ts` |
| วันที่ | web + PDF ใช้ `dd/MM/yyyy`; ไทย พ.ศ., อังกฤษ ค.ศ. | `web/src/app/core/util.ts`, `server/src/common/dates.ts` |
| LINE/SMTP ค้าง | เพิ่ม timeout 10s/20s | `server/src/notify/notify.service.ts` |
| Purchase list N+1 | โหลด stockMoves ครั้งเดียวแล้ว group ตาม PO | `server/src/operations/purchasing.service.ts` |
| Audit/Events โหลดทั้งตาราง | ใช้ `orderBy` + `limit` ที่ DB | `server/src/common/audit.service.ts`, `server/src/events/events.service.ts` |
| Type cast | ลบ cast ของ `workflows` | `web/src/app/core/meta.service.ts`, `web/src/app/core/models.ts` |
| Log | ใช้ `Logger` แทน `console.log` | `server/src/main.ts` |

### ยังไม่แก้ (ต้องตัดสินใจ/งานใหญ่)

- Idempotency ของ POST create
- เงินเป็นสตางค์/numeric
- FK/unique ครบ + ชื่อตาราง `_tb`/คอลัมน์ตาม owner-profile
- สองภาษา (i18n)
- Error envelope `{code, trace_id}` + Zod/StandardSchema ที่ boundary
- `files.canRead` full scan และ dept scope N+1/`rawScoped`
- เป้ากด 44px และ radius 12/14px ที่เหลือ
