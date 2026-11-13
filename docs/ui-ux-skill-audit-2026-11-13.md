# UI/UX + Accessibility Audit — 2026-11-13

| | |
|---|---|
| ขอบเขต | `web/` (Angular 22) — dashboard, tickets list/new/detail, vehicles, settings (users/company/notify), entities, reports, workspace, shell |
| วิธี | อ่านโค้ด + เปิดแอปจริงใน in-app browser + Lighthouse + วัด computed style/contrast + ตรวจ keyboard focus |
| สกิลที่ใช้ | `ui-ux-pro-max`, `better-interface` (+ `better-accessibility/layout/typography/colors/ui`), `userflow` → `flow-app-shell/tables/forms/settings`, `ui-review`, `architecture-diagram` |
| วันที่ | 2026-11-13 |
| สถานะ | build ผ่าน · web tests 15/15 · Lighthouse accessibility 1.0 (หน้า `/tickets`) |

> รายงานนี้ต่อจาก `UI-REVIEW.md` (2026-11-09) และ `docs/ui-consistency-audit-2026-11-11.md` — เน้นสิ่งที่ยังค้างและสิ่งที่แก้ในรอบนี้ ไม่รื้อ audit เดิม

---

## 1. สรุป

พบ **7 ปัญหาระดับ HIGH** และ **4 ระดับ MEDIUM** ที่มีหลักฐานจากการใช้งานจริง — แก้แล้ว **15 ข้อ** ในรอบนี้ และเก็บ polish 2 ข้อ (radius / hover-on-touch) เป็น partial pass

จุดที่แย่ที่สุดก่อนแก้คือ **ตารางทุกรายการเปิดด้วยเมาส์เท่านั้น** — ผู้ใช้คีย์บอร์ดเปิดเอกสารไม่ได้เลย, **ฟอร์ม 103 จุดไม่มี label ผูกกับ input**, และ **error จาก server ไม่ถูก announce/focus** ทำให้ screen reader ไม่รู้ว่าต้องแก้อะไร

---

## 2. Findings

Severity ตาม `better-interface`: HIGH = ทำ task ไม่ได้ / ซ่อนเนื้อหา / ระบบผิดซ้ำ; MEDIUM = ทำความเข้าใจ/ประสิทธิภาพลด; LOW = polish

| ID | Sev | ปัญหา | หลักฐาน | สถานะ |
|---|---|---|---|---|
| **H-01** | HIGH | แถวตารางเปิดรายการด้วย `(click)` อย่างเดียว — ไม่มี `tabindex`, ไม่มี keyboard handler | `web/src/app/shared/data-table.component.ts:157-162` (ก่อนแก้) | **แก้แล้ว** — เพิ่ม `tabindex="0"` + `(keydown)="onRowKey(...)"` (บรรทัด 159-161); ตรวจด้วย Enter → ไป `/tickets/:id` จริง |
| **H-02** | HIGH | หัวตาราง sort ด้วย `<th (click)>` — คีย์บอร์ด sort ไม่ได้ | `data-table.component.ts:146-152` (ก่อนแก้) | **แก้แล้ว** — `<th scope="col">` + `<button class="th-sort">` (บรรทัด 146-150); `aria-sort` เปลี่ยน `none → ascending` |
| **H-03** | HIGH | ฟอร์ม hand-written 103 จุดมี `<label>` ที่ไม่ผูกกับ control (`for`/`id` หาย) — เช่น vehicle quick finder, settings user modal, company/notify settings | ก่อนแก้: `vehicle-booking.component.ts:121-126`, `settings.component.ts:125-130`; ตรวจ `input.labels` ได้ `[]` | **แก้แล้ว** — codemod เติม `for`/`id` 103 คู่ ใน 16 ไฟล์; ตรวจซ้ำ `input.labels` มีค่าครบ (vehicles 9/9, tickets/new 19/19, settings modal 6/6) |
| **H-04** | HIGH | error รายฟิลด์จาก server แสดงเป็น `.err` เฉย ๆ — ไม่มี `aria-invalid`, ไม่มี `aria-describedby`, ไม่ focus ช่องแรก | ก่อนแก้: submit `/tickets/new` ว่าง → 6 errors, `activeElement = BODY`, `[aria-invalid]` = 0 | **แก้แล้ว** — `fields.component.ts:21-120` เติม `aria-invalid/describedby/required`; `record-form.component.ts:90,115-120` focus ช่องแรก + summary; ตรวจแล้ว focus ไป `#f-title` |
| **H-05** | HIGH | ปุ่ม primary โหมดมืดใช้ gradient `#e84b52 → #cf2d36` กับตัวอักษรขาว — ปลายสว่างได้ **3.78:1** (ต้อง 4.5:1) | `styles.css:2787` (ก่อนแก้); วัดจริงในเบราว์เซอร์ | **แก้แล้ว** — เปลี่ยนเป็น `#d13a42 → #b01e26` (4.78–6.28:1) ที่ `styles.css:7127-7129` |
| **H-06** | HIGH | Label-in-name mismatch (WCAG 2.5.3): logo link `aria-label="หน้าแรก"` ทั้งที่เห็น “SJP ERP…”, search `aria-label="ค้นหา"` ทั้งที่เห็น “ค้นหาทั่วระบบ… Ctrl K”, bell `aria-label="การแจ้งเตือน"` ทั้งที่เห็นเลข 3 | Lighthouse `label-content-name-mismatch` 3 nodes | **แก้แล้ว** — ลบ aria-label ที่บังข้อความ visible, bell ใส่จำนวน (`shell.component.ts:225`), search ใช้ชื่อจากเนื้อหา; Lighthouse ไม่ flag แล้ว |
| **H-07** | HIGH | Deep link โหลด `theme-init.js` ผิด path → 404 และ theme flash: `<script src="theme-init.js">` resolve เป็น `/tickets/theme-init.js` | เปิด `/tickets/new` ตรง ๆ → console 404 + MIME error; `index.html:5-6` | **แก้แล้ว** — ย้าย `<base href="/">` ขึ้นก่อน script + ใช้ absolute `/theme-init.js`, `/favicon.ico`; reload ตรง route ไม่มี 404 |
| **M-01** | MED | Filtered-to-empty บอก “ไม่พบรายการ” แต่ไม่มีทางล้าง filter ในที่เดิม | `data-table.component.ts:135-141` (ก่อนแก้) | **แก้แล้ว** — เพิ่ม action “ล้างตัวกรอง” + `clearFilters()`; ตรวจแล้ว rows กลับมา 3 แถว |
| **M-02** | MED | จำนวนผลลัพธ์เปลี่ยนแต่ไม่ถูก announce ให้ screen reader | `data-table.component.ts:180` | **แก้แล้ว** — `role="status" aria-live="polite"` |
| **M-03** | MED | ปุ่มปักหมุดใน sidebar เป็น 22×22 px — ต่ำกว่า WCAG 2.5.8 (24×24) | `styles.css:6225` (ก่อนแก้); วัดได้ 22×22 | **แก้แล้ว** — 26×26 ที่ `styles.css:7124`; วัดซ้ำได้ 26×26 |
| **M-04** | MED | Input 13.5px บนมือถือ → iOS Safari zoom เมื่อ focus | `styles.css:6496-6500`; ไม่มี mobile override | **แก้แล้ว (CSS)** — `@media (max-width:760px) { .field input/select/textarea { font-size:16px } }` (`styles.css:7132-7136`); ยังไม่ได้ทดสอบบนอุปกรณ์ iOS จริง |
| **M-05** | MED | โหลด list ล้มเหลว → toast อย่างเดียว แต่ตารางยังแสดง empty state “ยังไม่มีเคส…” (fake empty) | `tickets.component.ts:61-66`; `data-table` ไม่มี error input | **แก้แล้ว** — เพิ่ม `error`/`retry` ให้ `app-data-table`; tickets/purchase/projects/entities/pm/warehouse ส่ง error state และมีปุ่ม “ลองใหม่”; settings users มี notice + retry |
| **M-06** | MED | `role="tablist"`/`role="tab"` ในตัวกรองตาราง/metadata editor/vehicle view ไม่มี APG keyboard (Arrow keys, roving tabindex, `aria-controls`) | `data-table.component.ts:46-52`, `metadata-editor.component.ts:207`, `vehicle-booking.component.ts:172` | **แก้แล้ว** — เปลี่ยนเป็น `role="group"` + ปุ่ม `aria-pressed` ซึ่งตรงกับพฤติกรรม filter/view toggle และ keyboard ปกติ |
| **L-01** | LOW | `<th>` ในตาราง hand-written บางหน้า (warehouse/reports/vehicle) ยังไม่มี `scope="col"` | grep `<th>` ใน `pages/*.ts` | **แก้แล้ว** — เติม `scope="col"` 32 หัวตารางใน 8 ไฟล์ (vehicle, warehouse, pm-record, project/purchase/ticket detail, role editor, entity detail) |
| **L-02** | LOW | Badge แจ้งเตือนใช้ 9px, avatar 10px — ต่ำกว่า micro-label 10.5–11.5 ใน `DESIGN.md` | computed style หน้า dashboard | **แก้แล้ว** — bell badge 10.5px/16px, avatar 10.5px (`styles.css` ท้ายไฟล์) |
| **L-03** | LOW | Radius ยังมีค่า 7/12/14px นอก scale 4/6/8/10 ของ `DESIGN.md` | computed style หน้า dashboard | **ปรับบางส่วน** — `.btn` 7→8px, quick-create split 8px; ค่า 12/14px ที่เหลืออยู่ใน legacy/overlay layers |
| **L-04** | LOW | Hover styles จำนวนมากไม่ถูกห่อ `@media (hover: hover)` — บน touch อาจค้างสถานะ hover | `styles.css` หลายจุด | **ปรับบางส่วน** — neutralise hover ของ table row, sidebar item/group, tile, chip บน `@media (hover:none)`; rule อื่นยังเหลือ |

---

## 3. สิ่งที่ตรวจแล้วไม่พบปัญหา

- **Shell**: sidebar + main ถูกต้องตาม `flow-app-shell`; 56px topbar, 248px sidebar, content max 1600px, bottom nav บนมือถือ, skip link เป็น focusable element แรก
- **Keyboard focus ring**: global `:focus-visible` 3px `--focus-ring` ทำงานกับ nav/button/input; ไม่พบ `outline: none` ที่ไม่มี replacement
- **Reduced motion**: มี global `prefers-reduced-motion` block และปิด animation/transition
- **Contrast tokens หลัก**: light muted/bg 5.58, dark muted/bg 7.50, light ink/bg 16.55, dark ink/bg 16.02 — ผ่าน AA
- **Form labels ใน shared `FieldComponent`**: ใช้ `[attr.for]` + `id` อยู่แล้ว; ปัญหาอยู่ที่ฟอร์ม hand-written
- **Settings IA**: 3 หมวด/10 หน้า, danger actions (restore/import) มี type-to-confirm และรหัสผ่าน
- **Empty/loading**: `app-state` มี `role="status" aria-live="polite"`; ตารางมี empty state แยก first-use vs filtered
- **Responsive**: prior audit 2026-11-11 ครอบ 320–1920 แล้ว; รอบนี้ recheck 1000×700 ไม่พบ document overflow
- **Palette**: `ui-ux-pro-max` แนะนำชุด blue/amber สำหรับ data-dense dashboard แต่โปรเจ็คมี brand red ที่เขียนไว้ใน `DESIGN.md` — รอบนี้คงไว้และแก้เฉพาะ pair ที่ contrast ไม่ผ่าน

---

## 4. Verification

```text
web build              success (initial 458.59 kB, lazy chunks)
web tests              15/15 passed (4 files)
Lighthouse /tickets    accessibility 1.0 · best-practices 1.0 · SEO 1.0 (หลังเพิ่ม meta description)
Lighthouse failures    none (ก่อนแก้: label-content-name-mismatch + meta-description)
Keyboard row           focus row → dispatch Enter → /tickets/784929b9-…
Sort header            focus .th-sort → Enter → aria-sort ascending
Filtered empty         search “zzzz-no-match” → “ล้างตัวกรอง” → rows 3, search cleared
Form errors            submit empty ticket → 6 × aria-invalid, describedby=err-*, focus #f-title
Labels                 vehicles 9/9, tickets/new 19/19, settings modal 6/6 associated
Pin target             26×26 measured
Dark primary           linear-gradient(#d13a42, #b01e26) with white text
Deep link              /tickets/new reload → /theme-init.js 200, no MIME error
Architecture diagram   static checks OK · screenshot exit 0 · 6 captures

M-05 / M-06 / L-01 / L-02   build + tests ผ่าน; ตรวจ runtime ซ้ำด้วย browser
                            ในรอบถัดไป (browser tool ไม่พร้อมใน follow-up นี้)
```

> หมายเหตุ: Lighthouse ให้ accessibility 1.0 แต่ไม่จับ keyboard-only row/sort — การตรวจด้วยการ dispatch Enter และการอ่าน `input.labels` เป็นหลักฐานเสริมที่จำเป็น

---

## 5. งานที่แนะนำต่อ (เรียงตามผลกระทบ)

1. **L-04 (ต่อ)** — ขยาย `@media (hover: none)` ให้ครอบ hover ที่เหลือ (buttons/cards/tabs) หรือห่อ rule ต้นทางด้วย `@media (hover: hover)`
2. **L-03 (ต่อ)** — ไล่เก็บ radius 12/14px ที่ยัง effective ใน overlays ให้เหลือ 10px
3. **Test on real iOS** — ตรวจว่า 16px input override ไม่ทำให้ form/line-item table ล้นที่ 320–390px

---

## 6. Skill installation

ติดตั้งชุดสกิลที่ใช้ในรอบนี้ไว้ในโปรเจ็คแล้ว (47 สกิล จาก 5 repo, pin commit):

- `.opencode/skills/` — ตัวสกิล
- `.opencode/skills-manifest.json` — repo/commit/รายชื่อที่ติดตั้ง
- `.opencode/SKILLS.md` — วิธีใช้/อัปเดต
- `scripts/sync-opencode-skills.ps1` — sync แบบ reproducible (`-Check` สำหรับตรวจ)

Architecture diagram ที่ได้จาก `architecture-diagram`:

- `docs/architecture/architecture.html` — interactive (Dev/Prod, 3 flows)
- `docs/architecture/architecture.md` — คำอธิบายสำหรับอ่านใน GitHub/Slack
