# UI-REVIEW — SJP ERP

| | |
|---|---|
| วันที่ | 2026-11-09 |
| โหมด | **READ-ONLY** — รายงานและเสนอแนวทาง ไม่มีการแก้ไฟล์ ไม่จัด format ไม่ generate asset |
| Target ที่ขอมาตรวจ | `src/app/(marketing)` · landing page · mode = Persuade · dev server `http://localhost:3000` |
| Target ที่ตรวจได้จริง | `web/` (Angular 22 — แอปปัจจุบัน) และ `app/` (React+Vite — legacy reference) |
| เกณฑ์อ้างอิง | impeccable `audit` (5 มิติ) + กฎจาก ui-ux-pro-max (domain ux / color / typography) ตามที่ระบุใน brief |
| ขนาดจอเป้าหมาย | 375 / 768 / 1440 |

> **อ่าน §0 ก่อน** — brief กับ repo นี้ไม่ตรงกัน และนั่นคือ finding ที่สำคัญที่สุด

---

## 0. BLOCKER — target ที่ brief ระบุไม่มีอยู่ในโปรเจกต์นี้

ผมตรวจแล้ว 4 ทาง ทุกทางยืนยันตรงกันว่า **ไม่มี marketing landing page ใน repo นี้** และ **stack ก็ไม่ใช่ Next.js + Tailwind**

| # | สิ่งที่ brief ระบุ | ผลตรวจ | หลักฐาน |
|---|---|---|---|
| 1 | path `src/app/(marketing)` | ไม่มี (ไม่มีแม้แต่ `src/` ที่ root) | `src/` ไม่มีใน root; root มี `app/`, `web/`, `server/`, `scripts/`, `checks/` — ดู `README.md` |
| 2 | Next.js | ไม่มี | `Get-ChildItem -Recurse -Filter next.config.*` → 0 ผล; `package.json` ทั้ง 3 ตัวไม่มี `next` |
| 3 | Tailwind | ไม่มี | `tailwind.config.*` / `postcss.config.*` → 0 ผล; ไม่มี `tailwindcss` ใน dependency ใดเลย |
| 4 | design token ใน `globals.css` | ไม่มีไฟล์ชื่อนั้น | มี `web/src/styles.css` (3,183 บรรทัด) และ `app/src/styles.css` (151 บรรทัด) เท่านั้น |
| 5 | dev server `localhost:3000` | **ปิด** (connection refused) | `Invoke-WebRequest http://localhost:3000` → `Unable to connect to the remote server` |
| 6 | พอร์ตที่มีคน.listen อยู่ | 5173 เปิด แต่ **เป็นโปรเจกต์อื่น** | `http://localhost:5173` ตอบ `<title>OpenLife — Life Simulator</title>` + entry `/src/main.ts` — ไม่ใช่ SJP ERP |
| 7 | stack จริงของโปรเจกต์ | Angular 22 + NestJS + SQLite (Drizzle) | `web/package.json` (`@angular/core ^22.1.0`), `server/` NestJS, `README.md` |
| 8 | `app/` คืออะไร | React+Vite เวอร์ชันเดิม เก็บไว้เป็น reference ระหว่าง migration | `README.md` ตารางโครงสร้าง |

**ผลกระทบ:** คำถามข้อ 1 ของ brief ("รัน detector กับ URL จริง") ทำตามตัวอักษรไม่ได้ — ไม่มี URL ของ surface นั้นอยู่จริง ถ้าผมเดาแล้ว audit หน้า login แอป ERP แทนเงียบ ๆ ผมจะได้รายงานที่ดูครบแต่ตอบผิดคำถาม

**สิ่งที่ผมทำแทน (และกำกับไว้ทุกจุดในรายงานนี้):**
1. รัน detector กับ **ไฟล์จริง** ของโปรเจกต์ (detector รองรับ file/dir ไม่ใช่แค่ URL)
2. ตรวจระบบดีไซน์ที่ **มีอยู่จริง** ใน `web/` — ซึ่งเป็นฐานที่ landing page ใด ๆ ของ SJP จะต้องใช้ร่วมกันอยู่ดี
3. ระบุชัดทุกข้อว่าข้อไหน **ยืนยันด้วยหลักฐาน** และข้อไหน **ผมไม่แน่ใจ / ยังตรวจไม่ได้**

---

## 1. ผลการรัน detector

คำสั่งที่ใช้ (ตาม `impeccable audit` — file scan แทน URL เพราะ target ไม่มี):

```
impeccable detect --json web/src
impeccable detect --json app/src
```

| Target | ผล | หมายเหตุ |
|---|---|---|
| `http://localhost:3000` | สแกนไม่ได้ | port ปิด |
| `http://localhost:5173` | ไม่สแกน | เป็นโปรเจกต์อื่น (OpenLife) — ผลจะไม่เกี่ยวกับ SJP |
| `web/src` | **exit 2** — 6 warning + 1 advisory | แอปปัจจุบัน (Angular) |
| `app/src` | **exit 2** — 5 warning + 1 advisory | legacy React |

### 1.1 Findings จาก `web/src`

| Rule | ตำแหน่ง | snippet | ระดับ | ตรวจในบริบทแล้วเป็นจริงไหม |
|---|---|---|---|---|
| `side-tab` | `styles.css:49` | `border-left: 6px solid var(--pri)` | warning | **จริงตาม rule แต่ถูก override** — `:188` เขียน `border: 1px solid var(--line2)` ทับทั้ง 4 ด้าน → ผลลัพธ์จริงไม่มี side-tab แล้ว (false positive in effect) |
| `border-accent-on-rounded` | `styles.css:103` | `border-bottom: 5px solid` | warning | **false positive in effect** — `:210` เขียน `border-bottom: 0` ทับ และ `:363` เปลี่ยน tabs เป็นแบบ underline อยู่แล้ว |
| `border-accent-on-rounded` | `styles.css:364` | `border-bottom: 3px solid` | warning | **false positive** — element นี้ `border-radius: 0` (`:364`) rule นี้ต้องการ element ที่มีมุมโค้ง |
| `side-tab` ×3 | `styles.css:386` | `inset box-shadow 4px` บน `tr.hl-1/2/3 td:first-child` | warning | **จริง** — แถบสีซ้าย 4px บนแถวตาราง ยัง active อยู่ |
| `codex-grid-background` | `styles.css:558` | two-axis grid gradient | advisory | **จริง** — grid overlay ตกแต่ง (ไม่ใช่ canvas/map) |

### 1.2 Findings จาก `app/src` (legacy)

| Rule | ตำแหน่ง | ระดับ |
|---|---|---|
| `codex-grid-background` | `refined.css:32` | advisory (จริง) |
| `border-accent-on-rounded` | `shell.css:77` | warning |
| `side-tab` ×3 | `shell.css:99` (`tr.hl-1/2/3`) | warning (จริง) |
| `side-tab` | `styles.css:44` (`.kpi` `border-left: 6px`) | warning |

**สรุป detector:** 12 findings ใน 2 โฟลเดอร์ — **ผ่านการตรวจในบริบทแล้วเหลือของจริง 5–6 ข้อ** ทั้งหมดเป็นหมวด `slop` (ไม่ใช่ a11y/perf) และทั้งหมดกระจุกที่ `.kpi` / `.tbl tr.hl-*` / grid background ⇒ เป็น **1 pattern ที่ทำซ้ำ** ไม่ใช่ 6 ปัญหาแยกกัน

> ข้อจำกัด: detector ที่รันเป็น **file mode** ไม่ใช่ **URL mode** จึงไม่ได้ตรวจ computed style หลัง cascade, ไม่ได้วัด contrast จาก pixel จริง, และไม่ได้วัด LCP/CLS — ตัวเลข contrast ทั้งหมดใน §2 ผมคำนวณเองจากค่า token (ระบุวิธีไว้)

---

## 2. ผลตรวจ 3 ด้าน

Severity ที่ใช้: **critical / high / med / low** (เทียบเท่า P0 / P1 / P2 / P3 ของ impeccable)
ทุกข้อเขียนในรูปแบบ: หลักฐาน → ผลกระทบ → วิธีแก้

### 2.1 (a) Technical — a11y · contrast · responsive · perf

| ID | Sev | ปัญหา | หลักฐาน | ผลกระทบต่อผู้ใช้ | วิธีแก้ที่เสนอ |
|---|---|---|---|---|---|
| **T-01** | critical | ไม่มี surface ตาม brief | ดู §0 ทั้งตาราง | งานที่ขอทำไม่ได้ — ต้องตัดสินใจก่อนว่าตรวจอะไร | ยืนยัน target จริงก่อน (§7) |
| **T-02** | **high** | **Focus ring คอนทราสต์ไม่ผ่าน และถูก `!important` ล็อกไว้** | `styles.css:21` `outline: 3px solid #e09b00 !important` — ประกาศซ้ำอีก 3 ครั้งที่ `:2206` (`#1a5fd0`), `:2234` (`var(--pri)`), `:2207`/`:2235` (dark) แต่ **ทั้งหมดไม่มี `!important` จึงแพ้** ⇒ ค่าที่ผู้ใช้เห็นจริงคือ **amber 3px** | วัดแล้ว: amber บน bg `#f2ece6` = **2.02:1**, บน card `#fffcf8` = **2.32:1** — ต่ำกว่า 3:1 ของ WCAG 1.4.11 (Non-text Contrast) ผู้ใช้คีย์บอร์ด/สายตาเลือนรางหา focus ไม่เจอ | ลบ `!important` ที่ `:21` ทิ้ง แล้วเหลือ declaration เดียว `outline: 2px solid var(--pri)` + `outline-offset: 2px`; ตรวจว่า `--pri #d62f38` บน card ได้ 4.75:1 (ผ่าน 3:1) |
| **T-03** | **high** | ไม่มี skip link | grep `ข้าม`/`skip` ใน `web/src/app` → เจอแต่ logic ธุรกิจ ไม่มี `<a href="#main">`; `shell.component.ts` มี nav กลุ่มหลายรายการก่อน content | ผู้ใช้คีย์บอร์ด/สกรีนรีดเดอร์ต้อง Tab ผ่านเมนูทั้งแถบทุกครั้งที่เปลี่ยนหน้า (~20+ stop) — WCAG 2.4.1 Bypass Blocks | เพิ่ม skip link เป็น element แรกใน shell, ซ่อนด้วย `transform: translateY(-200%)`, โผล่ตอน `:focus-visible` |
| **T-04** | **high** | Modal ไม่มี focus trap / ไม่ย้าย focus เข้า / ไม่คืน focus | `shared/modal.component.ts:7-16` — มี `role="dialog" aria-modal="true"` แต่ทั้งไฟล์มีแค่ `onBackdrop` + `onEscape`; grep `tabindex`/`focus` ใน `web/src/app` ไม่พบ focus management ใด ๆ | `aria-modal="true"` บอกสกรีนรีดเดอร์ว่า "ข้างหลังใช้ไม่ได้" แต่คีย์บอร์ดยัง Tab ออกไปข้างหลังได้จริง → ขัด WCAG 2.4.3 (Focus Order) และทำให้ผู้ใช้หลงบริบท | เพิ่ม focus trap (จับ `keydown.tab` วนใน dialog), `afterViewInit` ย้าย focus ไป element แรก, `ngOnDestroy` คืน focus ให้ปุ่มที่เปิด |
| T-05 | med | Toast หายเองโดยหยุดไม่ได้ | `shared/toast.service.ts:17` — `setTimeout` 3000ms (ok) / 6000ms (err), ไม่มีปุ่มปิด ไม่มี pause-on-hover; `toast-host.component.ts:8-11` ไม่มี dismiss | ข้อความ error ที่ผู้ใช้อ่านช้า หรือสกรีนรีดเดอร์ที่อ่าน `aria-live` ยังไม่จบ อาจหายก่อน — WCAG 2.2.1 (Timing Adjustable) | เพิ่มปุ่มปิด, pause เมื่อ hover/focus, และคง error toast ไว้จนผู้ใช้ปิด |
| T-06 | med | Touch target 36px | `styles.css:2208` `.btn.sm, .icon-btn, .star, .rail-item, .bb-item { min-height:36px; min-width:36px }`; `:3325` `.settings-tabs button { padding:9px 11px; font-size:14.5px }` ⇒ สูง ~41px | ต่ำกว่า 44×44 ที่ brief กำหนด; WCAG 2.5.8 (AA) ผ่านที่ 24px แต่บนมือถือกดพลาดง่ายในเมนู/แท็บ | ดันเป็น 44px ที่ ≤900px ผ่าน media query เดียว ไม่กระทบ desktop density |
| T-07 | med | ตัวอักษรเล็กกว่า 14pt หลายจุด | 14pt ≈ 18.67px; ที่ต่ำกว่า: `:160` 12px, `:2178` 15px, `:2195` 13.5px, `:2244` 14.5px, `:2275` 12.5px, `:3325` 14.5px, `:388` 14.5px | ขัดเกณฑ์ 14pt ของ brief; ผู้อ่านสูงอายุ/จอ 1366×768 อ่านยาก | ตั้ง floor 16px สำหรับ body-adjacent text และ 14px สำหรับ meta; ใช้ type scale (§2.2 U-02) |
| T-08 | med | `prefers-reduced-motion` เป็น global kill switch | `styles.css:2209-2211` `*, *::before, *::after { animation:none !important; transition:none !important }` | ตาม impeccable audit: การ kill transition ทั้งหมดทำลาย **feedback ของ state change** (hover/press/focus) ไม่ใช่แค่ตัดของตกแต่ง — ผู้ใช้ที่เปิด reduced-motion จะไม่เห็นว่าระบบตอบสนองหรือยัง | เปลี่ยนเป็น: คง `transition` เฉพาะ `color/background/opacity` (≤150ms), ตัดเฉพาะ `transform`/`animation` ของ decorative |
| T-09 | low | `<th>` ไม่มี `scope="col"` | `shared/data-table.component.ts:92` | สกรีนรีดเดอร์บางตัวจับคู่ header-cell ไม่ได้ในตารางที่ sort ได้ | เพิ่ม `scope="col"` (บรรทัดเดียว) |
| T-10 | low | `role="button"` ไม่รับ Space | `pages/project-detail.component.ts:51` `(keydown.enter)` เท่านั้น | native button รับทั้ง Enter และ Space; ผู้ใช้คีย์บอร์ดที่กด Space จะไม่มีอะไรเกิดขึ้น | เพิ่ม `(keydown.space)` + `preventDefault` หรือเปลี่ยนเป็น `<button>` จริง |
| T-11 | med | Theme flash (FOUC) | `web/src/index.html:2` ฮาร์ดโค้ด `data-theme="dark"`; ค่าจริงอ่านจาก localStorage ที่ `core/storage.ts:22-24` แล้ว set ที่ `app.ts:14` — คือ **หลัง** bootstrap | ผู้ใช้ที่เลือกโหมดสว่างไว้จะเห็นจอ **ดำวาบ** ทุกครั้งที่โหลด/refresh | ใส่ inline script เล็กใน `<head>` อ่าน `sjp-theme` แล้ว set attribute ก่อน paint |
| T-12 | low | `muted` บน `bg` พลาด AA ไปนิดเดียว | `--muted #756a62` (`:1084`) บน `--bg #f2ece6` (`:1080`) = **4.49:1** (ต้องการ 4.5) | ผ่านบ้างไม่ผ่านบ้างตามการปัดเศษ — ไม่มี margin เหลือเลยสำหรับอนาคต; ข้อความ muted นอก card (`.demo-banner`, `.hint`) กระทบ | เข้มขึ้น ~1 step (`#6f645c` → ประมาณ 4.7:1) |

**Performance — สถานะ: ยังไม่วัดจริง (บอกตรง ๆ)**
- สิ่งที่วัดได้จากโค้ด: CSS bundle เดียว **116 KB / 3,183 บรรทัด** (`web/src/styles.css`) มี declaration ซ้ำจำนวนมาก (§2.3) — Angular build จะ gzip เหลือราวหนึ่งในแปด แต่ยังเป็น blocking stylesheet ก้อนเดียวทุก route
- สิ่งที่ **ยังไม่ได้วัด**: LCP / CLS / INP จริง, ขนาด JS ต่อ route, จำนวน re-render — ต้องเปิด dev server ที่รันได้ก่อน (§7)
- สิ่งที่เห็นเชิงโครงสร้าง: `.topbar { backdrop-filter: blur(6px) }` (`:182`) เป็น `position: sticky` ⇒ repaint ทุกครั้งที่ scroll บนมือถือรุ่นล่าง; ควรวัดก่อนจะสรุปว่าเป็นปัญหา

**Responsive — ผ่านโครงสร้าง แต่ไม่เป็นระบบ**
- จอเป้าหมายทั้ง 3 ถูกคลุมจริง: 375 → กฎ `≤560` (`:1924`, `:2154`), 768 → กฎ `≤900` (`:392`, `:2128`), 1440 → `max-width: 1500px` (`:38`/`:184`) ⇒ **ไม่มี horizontal overflow ที่คาดจากโค้ด**
- แต่มี **9 breakpoint ไม่ซ้ำกัน**: 560, 600, 640, 700, 760, 900, 901(min), 960, 1000 ⇒ พฤติกรรมเปลี่ยนคนละจังหวะในแต่ละหน้า (med)

### 2.2 (b) UX heuristic — hierarchy · spacing rhythm · typography · feedback

| ID | Sev | ปัญหา | หลักฐาน | ผลกระทบ | วิธีแก้ |
|---|---|---|---|---|---|
| **U-01** | **high** | **ไม่มี typographic scale — 34 ขนาดตัวอักษร** | นับจาก `font-size: Npx` ใน `web/src/styles.css`: 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 16, 16.5, 17, 17.5, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 32, 34, 36, 38, 56 | ไม่มีลำดับชั้นที่อ่านออก — h1 30px (`:186`) กับ `.kpi .n` 38px (`:189`) แข่งกันเป็น "ใหญ่สุด", 17 กับ 17.5 แยกกันโดยไม่มีเหตุผล ⇒ ตาไม่รู้ว่าให้อ่านอะไรก่อน | ยุบเหลือ scale 6–7 ขั้น (เช่น 12/14/16/20/26/34/48) แล้ว map ทุกหน้าผ่าน token |
| U-02 | med | Spacing rhythm ไม่มีหน่วยฐาน | `padding` ที่ใช้: 4,5,6,8,9,10,11,12,13,14,16,18,20,22,24,28,32,36,48,56,64px — ทั้ง 4px และ 6px base ปนกัน (`:187` 22/24px, `:192` 8/20px, `:202` 14px) | จังหวะแนวตั้งไม่นิ่ง — card ที่อยู่ติดกันดู "ไม่ตรงกัน" โดยหาสาเหตุไม่ได้ | ล็อก 4px base: 4/8/12/16/24/32/48 และแก้เฉพาะ container หลัก |
| U-03 | med | Radius 19 ค่า แต่ token มีแค่ 4 | `border-radius: Npx` ไม่ซ้ำ: 3,4,5,6,8,9,10,11,12,13,14,15,16,17,18,20,22,24 + 999; token มี `--radius-xs..lg` = 10/13/18/24 (`:1095-1098`) | มุมโค้งเป็นตัวบอก "ระดับชั้น" ของ UI — เมื่อมี 19 ค่า มันไม่บอกอะไรเลย; card/btn/input/modal ดูไม่เป็นตระกูลเดียวกัน | ใช้ 4 token ที่มีอยู่ + 999 สำหรับ pill; แก้ที่ layer ใหม่เท่านั้น |
| U-04 | med | Feedback ของ error ในฟอร์มไม่มี anchor | `login.component.ts:44` (`role="alert"` อยู่ท้ายฟอร์ม เหนือปุ่ม submit) แต่ไม่มี `aria-describedby` ผูกกับ input ที่ผิด และไม่ focus ไปที่ช่องนั้น | ผู้ใช้เห็นข้อความแต่ไม่รู้ว่าช่องไหนผิด (โดยเฉพาะ first-run ที่มี 4 ช่อง) | เพิ่ม `aria-describedby` + `aria-invalid` และ focus ช่องแรกที่ผิด |
| U-05 | low | Login (first impression) ไม่มีอะไรบอกว่า "ระบบนี้ทำอะไร" | `login.component.ts:10-53` — โลโก้ + ชื่อบริษัท + ฟอร์ม + ประโยคเดียว (`login-sub`, `login-note`) | ถ้าหน้านี้คือ "ประตูแรก" จริง มันให้ข้อมูลตัดสินใจน้อยมาก (mode Persuade ต้องการความมั่นใจก่อนพิมพ์รหัส) — *ผมไม่แน่ใจว่านี่คือ surface ที่ brief หมายถึง* | ดูทิศทาง C ใน §5 |
| U-06 | low | แถวที่ถูก highlight ใช้สีล้วน | `styles.css:386` แถบ 4px `#f2b036`/`#f08a36`/`#e81d25` + `:387` พื้นหลัง transparent | ผู้ใช้ตาบอดสีแยก 3 ระดับไม่ออก และไม่รู้ว่าแต่ละสีหมายถึงอะไร | เปลี่ยนเป็นพื้นหลังจาง + เพิ่ม badge/ไอคอนหรือ tooltip ระบุความหมาย |

**Positive (ของดีที่ควรเก็บ)**
- `aria-sort` ครบทุกคอลัมน์ที่ sort ได้ (`data-table.component.ts:92`)
- `role="status" aria-live="polite"` ทั้ง toast และ state component (`toast-host.component.ts:8`, `state.component.ts:11`)
- `role="alert"` ใช้กับ error จริง ไม่ได้ overuse (7 จุด)
- ปุ่ม icon ทุกตัวมี `aria-label` ภาษาไทย (`login.component.ts:35`, `data-table.component.ts:49`)
- Escape ปิด modal (`modal.component.ts:29`) และปิด command palette (`shell.component.ts:464`)
- ปุ่ม `.btn` มี `min-height: 46px` (`:192`) — เหนือ 44px ตามเกณฑ์; input ก็ 46px
- รองรับ safe-area / notch (`:2157` `env(safe-area-inset-bottom)`)
- มี `@media print` จริงจัง และบังคับ dark → ขาวดำตอนพิมพ์ (`:3058-3062`) — รายละเอียดที่มักลืม
- ใช้ `IBM Plex Sans Thai` self-host ผ่าน `@fontsource` (`:1-5`) ไม่พึ่ง CDN ภายนอก

### 2.3 (c) ความสอดคล้องกับ design system ที่มี

ตัวเลขที่วัดได้ (ทั้งหมดนับจาก `web/src/styles.css`):

| ตัวชี้วัด | ค่า | อ่านว่า |
|---|---|---|
| บรรทัดทั้งหมด | 3,183 | ไฟล์เดียวจบ ไม่มี layer |
| `:root` ที่ประกาศ palette ใหม่ | **5 ครั้ง** — `:6`, `:168`, `:242`, `:530`, `:1079` | token ถูกเขียนทับกัน 5 รอบ "ค่าสุดท้ายชนะ" |
| บล็อก `html[data-theme='dark']` | 6+ กลุ่มใหญ่ — `:407`, `:1680`, `:1950`, `:2207-2235`, `:2329` | dark mode ถูกต่อเติม 6 ครั้ง |
| hard-coded hex | **550** | — |
| `var(--token)` ที่อ้างถึง | 515 | **hex มากกว่า token** ⇒ token ไม่ใช่ authority |
| จำนวน font-size | 34 | ไม่มี scale |
| จำนวน radius | 19 | ไม่มี scale |
| จำนวน breakpoint | 9 | ไม่มี scale |

| ID | Sev | ปัญหา | หลักฐาน | ผลกระทบ | วิธีแก้ |
|---|---|---|---|---|---|
| **D-01** | **high** | **สีแบรนด์ไม่นิ่ง — 4 เฉดแดง + 1 ฟ้า legacy** | `--pri` เปลี่ยนตามลำดับ: `#1456a0` (ฟ้า, `:8`) → `#e81d25` (`:170`) → `#e81d25` (`:244`) → `#d92c34` (`:537`) → **`#d62f38`** (`:1087`); dark `#ef4a50` (`:1957`); `theme-color` ใน `index.html:9` = `#e81d25`; dark ปุ่ม primary ยังใช้ `#e81d25` (`:423`); spinner dark `#e81d25` (`:479`) | แถบ browser บนมือถือเป็นแดงหนึ่ง ปุ่มเป็นอีกแดง ปุ่มใน dark เป็นแดงที่สาม — ผู้ใช้ไม่รู้ว่าอะไรคือ "สีของแบรนด์" และ QA ตรวจ regression ไม่ได้ | เลือก 1 ค่าเป็น `--brand` แล้วให้ `--pri` = `var(--brand)`; ลบ `:6`, `:168`, `:242`, `:530` ออกทั้งบล็อก |
| **D-02** | **high** | **CSS เป็น append-only 8 ยุค — โค้ดตายค้างอยู่** | comment บอกยุคเอง: `:167` "modern surface layer: overrides the base styles", `:2165` "Light usability pass… adds a new login background", `:2214` "Final corrections kept **above legacy layers**" ⇒ `:2168-2175` วาด `.login-bg2` blobs ไว้ แล้ว `:2215` สั่ง `.login-bg2 { display:none }` — ทั้งบล็อกตาย; `login.component.ts:11` **ยัง render `<div class="login-bg2">`** อยู่ | dead DOM + dead CSS ทำให้อ่าน/แก้ยาก, bundle โต, และคนถัดไปไม่รู้ว่ากฎไหนคือของจริง (ผมเองต้องใช้เวลาไล่ cascade ถึงจะรู้ว่า `--pri` ตัวไหนชนะ) | ลบบล็อกที่ถูก override ไปแล้วทั้งหมด (เก็บผลลัพธ์ ไม่เก็บประวัติ), ลบ `<div class="login-bg2">` |
| D-03 | med | Dark mode บังคับซ่อน legacy sidebar ทั้งแถบ | `:468` `html[data-theme='dark'] .nav, html[data-theme='dark'] .side { display: none }` | ทำงานได้เพราะตอนนี้ใช้ `.rail` — แต่ถ้าหน้าไหนยังใช้ `.side` มันจะ **หายไปเฉพาะตอน dark** ซึ่ง debug ยากมาก | ลบ selector legacy หรือ scope ให้ชัดว่าเป็นของ component ที่ถูกลบแล้ว |
| D-04 | med | `border-left-color` เป็น dead declaration | `:125-126` ตั้ง `.step` `border-left: 6px solid` + `.step.done/.doing/.skipped { border-left-color }` — แต่ `:213` เขียน `border: 1px solid var(--line2)` ทับทั้ง 4 ด้าน ⇒ ความกว้างกลับเป็น 1px, `border-left-color` ของ `.done`/`.skipped` **ไม่มีผลอีกต่อไป** | สถานะ "เสร็จ / ข้าม" ไม่มีแถบสีตามที่ผู้ออกแบบตั้งใจ (ยังพอแยกได้จาก badge ข้อความ `:56` + `✓` `:52` — **จึงไม่ถึงขั้นใช้สีอย่างเดียว**) | เลือกทางเดียว: คืน `border-left-width` หรือลบทิ้งแล้วใช้ badge อย่างเดียวให้จบ |
| D-05 | low | `--pri-l` เป็นชมพูอมแดง แต่ถูกใช้เป็น "พื้นหลัง selected" ทั่วระบบ | `#fcefee` (`:1089`) กับ `--pri #d62f38` | ผ่าน contrast (6.16:1) แต่ hue ไม่ตรงกับพื้นอุ่น `#f2ece6` ⇒ selected state ดู "แปลกปลอม" | ใช้ `color-mix()` หรือ `rgba(--pri, .10)` แทน hex คงที่ |
| D-06 | low | ไม่มี automated contrast/a11y test ฝั่ง Angular | `web/src/app` มี spec แค่ 2 ไฟล์ (`app.spec.ts`, `core/util.spec.ts`); แต่ `app/contrast.test.mjs` (React legacy) **มี** และคำนวณคอนทราสต์เป็นตัวเลข | ฝั่งที่กำลัง migrate ไปดันไม่มี guard — T-02 จะกลับมาอีกครั้งโดยไม่มีใครรู้ | ย้าย `contrast.test.mjs` มาคุม token ใน `web/src/styles.css` |

---

## 3. สิ่งที่ผมยังตรวจไม่ได้ / ไม่แน่ใจ (บอกตรง ไม่เดา)

| # | เรื่อง | ทำไม |
|---|---|---|
| 1 | **หน้าตาจริงที่ 375 / 768 / 1440** | dev server ไม่รัน และไม่มี URL ของ surface ที่ brief ระบุ ⇒ ทุกข้อเรื่อง spacing/hierarchy ใน §2.2 มาจาก **การอ่านค่า CSS** ไม่ใช่การเห็นภาพเรนเดอร์ |
| 2 | LCP / CLS / INP / bundle per-route | ต้องรัน build+serve ก่อน (§7) |
| 3 | Contrast จาก pixel จริง (เช่น ข้อความบน gradient, บน `backdrop-filter`) | ผมคำนวณจาก token ล้วน — `.login-wrap` มี gradient 3 ชั้น (`:2216-2220`) ทำให้ค่าจริงต่างจากที่คำนวณ |
| 4 | พฤติกรรม touch gesture | ไม่มี browser ที่สั่ง touch ได้ใน session นี้ |
| 5 | ว่า `app/` (React) ยังต้องดูแลหรือไม่ | `README.md` บอกว่าเป็น reference ระหว่าง migration ⇒ **ผมไม่แน่ใจ** ว่าอยากให้ audit ด้วยหรือเปล่า จึงรายงานแยกและไม่ปนกับ `web/` |
| 6 | บริบทกลุ่มเป้าหมาย ("กลุ่มเป้าหมาย: …" ใน brief ว่างไว้) | ไม่มีข้อมูล ⇒ ข้อเสนอเรื่อง persuasion ใน §5 อิงสมมติฐานว่าเป็น "กิจการไทยที่ยังใช้ Excel" ซึ่ง **ผมเดา** — ต้องยืนยัน |

---

## 4. คะแนนสุขภาพ (ตาม impeccable audit 5 มิติ)

> ให้กับ **แอปจริง `web/`** ไม่ใช่ landing page เพราะ landing page ไม่มีอยู่

| # | มิติ | คะแนน | เหตุผลหลัก |
|---|---|---|---|
| 1 | Accessibility | **2** / 4 | โครง aria ดี แต่ focus ring 2.02:1 + ไม่มี skip link + modal ไม่มี focus trap |
| 2 | Performance | **2** / 4 | CSS ก้อนเดียว 116KB มี declaration ซ้ำจำนวนมาก; **ยังไม่วัด runtime** |
| 3 | Theming | **2** / 4 | token มีจริงแต่ถูกทับ 5 รอบ + hex 550 > var 515 |
| 4 | Responsive | **3** / 4 | คลุม 375/768/1440 ได้ ไม่มี overflow; หักที่ 9 breakpoint + target 36px |
| 5 | Implementation Integrity | **2** / 4 | append-only 8 ยุค, dead code, แบรนด์ 4 เฉด |
| | **รวม** | **11 / 20** | **Acceptable — ต้องลงทุนพอสมควร แต่ฐานไม่พัง** |

---

## 5. ทิศทางปรับปรุง 2–3 แบบ (ต่างกันจริง ไม่ใช่เรียงลำดับความแรง)

### ทิศทาง A — "Consolidate": รวม token ก่อน แล้วค่อยแตะหน้าตา
*แก้ T-02, T-11, T-03, D-01, D-02, D-03, D-04 — ไม่แตะ layout*

**ทำอะไร**
1. เหลือ `:root` เดียว + `html[data-theme='dark']` เดียว; ลบบล็อก `:6`, `:168`, `:242`, `:530` (เก็บค่าสุดท้ายเป็นความจริง)
2. ลบ `!important` ที่ `:21`, เก็บ focus ring ไว้ชุดเดียว
3. ลบบล็อกตาย (`:2168-2175`, `.login-bg2` ทั้ง DOM และ CSS, `:468` legacy selector)
4. เพิ่ม skip link + inline theme script ใน `<head>`
5. ย้าย `contrast.test.mjs` มาคุม token ฝั่ง Angular

| | |
|---|---|
| **ข้อดี** | ความเสี่ยงต่ำสุด — ไม่เปลี่ยนหน้าตาที่ผู้ใช้อนุมัติแล้ว; ปลดล็อกทุกงานถัดไป (ทำครั้งเดียวจบ); ทำให้ regression ตรวจได้ด้วยตัวเลข |
| **ข้อเสีย** | **ผู้ใช้ไม่เห็นความเปลี่ยนแปลงเลย** — ถ้าผู้ว่าจ้างคาดหวัง "หน้าใหม่" จะรู้สึกว่างานไม่คืบ |
| **ความเสี่ยง** | ต่ำ-กลาง: การลบ layer อาจทำให้บางหน้าที่พึ่ง `:root` เก่า (`#1456a0` ฟ้า) เปลี่ยนสี — ต้องไล่ทีละหน้า |
| **工作量** | **S** (1–2 วัน) |

---

### ทิศทาง B — "Build the marketing surface properly": สร้าง landing page จริงจาก token ที่รวมแล้ว
*ทำ A ก่อน แล้วต่อด้วยการสร้าง surface ใหม่*

**ทำอะไร** ต้องตัดสินใจก่อนว่า landing page จะอยู่ที่ไหน — ผมเสนอ 2 ทางย่อย:
- **B1**: route ใหม่ใน Angular (`/` → landing, `/app` → ERP) ใช้ `web/src/styles.css` ร่วม ⇒ ได้ split CSS, ไม่มีแบรนด์ที่สอง, ไม่เพิ่ม dependency
- **B2**: static site แยก (Astro/HTML) ⇒ ได้ performance ดีกว่า แต่ **จะกลายเป็นแบรนด์ที่สองทันที** เพราะ token จะถูกก๊อป ไม่ได้ share

| | |
|---|---|
| **ข้อดี** | ได้สิ่งที่ brief ต้องการจริง; ถ้าเลือก B1 จะได้ design system เดียวทั้ง product |
| **ข้อเสีย** | ต้องมี **เนื้อหา factual ที่อนุมัติแล้ว** (สินค้าคืออะไร, ใครใช้, ตัวเลขอะไรพูดได้) — brief ห้ามผมเปลี่ยนข้อความ factual แต่ก็ไม่ได้ให้ข้อความมาให้ใช้; ต้องมีคนตัดสินใจ stack (Angular vs แยก) ซึ่งกระทบ dependency |
| **ความเสี่ยง** | **สูง**: ถ้าเลือก B2 จะเกิด CSS สองชุดที่ drift ออกจากกันภายใน 3 เดือน (pattern ที่เกิดซ้ำในโปรเจกต์นี้แล้ว — ดู D-02) |
| **工作量** | **M–L** (B1: ~1 สัปดาห์; B2: ~1.5–2 สัปดาห์ รวมเนื้อหา) |

---

### ทิศทาง C — "Persuade the door": ยกระดับหน้า login เป็น first-impression surface
*ทางเลือกที่เร็วที่สุด ถ้าหน้าที่ต้อง persuade จริง ๆ คือ "ประตูแรก"*

**ทำอะไร** `login.component.ts` ปัจจุบันเป็นฟอร์มเดี่ยวบน gradient อุ่น คำอธิบาย 1 บรรทัด แก้เป็น 2 คอลัมน์ (≥901px): ซ้าย = สิ่งที่ระบบทำได้ **โดยใช้ข้อความ factual ที่มีอยู่แล้วใน `README.md`** (ไม่แต่งเพิ่ม), ขวา = ฟอร์มเดิมทั้งหมด; ≤900px ยุบเป็นคอลัมน์เดียว
พร้อมแก้ U-04 (`aria-describedby`), T-11 (theme flash), T-02 (focus ring)

| | |
|---|---|
| **ข้อดี** | เร็ว; วัดผลได้ (time-to-first-login, error rate); ใช้ token ชุดเดิม 100% ⇒ ไม่เสี่ยงแบรนด์ที่สอง; ไม่ต้องรอเนื้อหา marketing |
| **ข้อเสีย** | **ไม่ใช่ marketing landing page** — คนที่ยังไม่เป็นลูกค้าไม่เคยเห็นหน้านี้; คุณค่าทางธุรกิจจำกัดกว่ามาก |
| **ความเสี่ยง** | ต่ำ; เสี่ยงเฉพาะ scope creep เป็น "redesign ทั้งแอป" |
| **工作量** | **M** (3–5 วัน รวม QA 3 ขนาดจอ) |

### เทียบกันเร็ว ๆ

| | A Consolidate | B Landing page | C Login |
|---|---|---|---|
| ตอบ brief ตรง ๆ | ✗ | ✓ | ~ |
| ผู้ใช้เห็นผล | ✗ | ✓ | ✓ |
| ความเสี่ยง | ต่ำ | **สูง** | ต่ำ |
|  workload | **S** | M–L | M |
| ต้องมีเนื้อหา/อนุมัติเพิ่ม | ✗ | **✓ จำเป็น** | ✗ |

---

## 6. เทียบกับเกณฑ์ ui-ux-pro-max (จุดที่ตรง / ต่าง)

ผมใช้ **กฎที่ระบุชื่อได้** จาก skill นั้นเป็นเกณฑ์ (ไม่มีการโหลด dataset ของ skill มา query — ระบุตรงนี้เพื่อความโปร่งใส)

| เกณฑ์ | ผลกับโปรเจกต์นี้ | หมายเหตุ |
|---|---|---|
| ข้อความ ≤ 4.5:1 = fail | **ตรงกัน** — เจอ 1 จุด (T-12, 4.49:1) | impeccable ก็ใช้ 4.5 เท่ากัน ⇒ ไม่มีข้อขัดแย้ง |
| Non-text/UI ≤ 3:1 = fail | **ตรงกัน** — เจอ focus ring 2.02:1 (T-02) | ทั้งสองเกณฑ์ตรงกัน |
| Touch target 44×44 | **ต่างกัน** — impeccable/WCAG 2.5.8 (AA) ยอมรับ **24×24** โดยมีเงื่อนไขระยะห่าง; ui-ux-pro-max แนะ **44×44** | ผมรายงานทั้งคู่: T-06 **ผ่าน AA แต่ไม่ผ่าน 44** ⇒ จัดเป็น med ไม่ใช่ high ตาม WCAG แต่ถ้ายึด brief (44px) ก็ควรแก้ |
| เนื้อหา ≥ 14pt | **ต่างกัน** — impeccable ไม่มีข้อนี้ (เน้น contrast/ARIA) | เกณฑ์ 14pt มาจาก brief ⇒ T-07 อ้าง brief ไม่ได้อ้าง WCAG |
| Typography scale ≤ 8 ขั้น | **ตรงกัน** — เจอ 34 ขั้น (U-01) | ทั้งสองสำนักถือว่าเป็นปัญหา |
| Spacing 8pt/4pt grid | **ตรงกัน** — เจอ 4px กับ 6px ปนกัน (U-02) | — |
| ห้าม gradient/glow ไม่จำเป็น | **ตรงกันบางส่วน** — detector จับ grid overlay (`:558`) เป็น advisory; impeccable มอง gradient/glow เป็น "ban" ใน craft-floor | ผมยังไม่ได้โหลด `craft-floor.md` เพราะงานนี้เป็น **planning/audit only** ตามที่ skill กำหนด (โหลดเฉพาะก่อนแก้ UI) |
| One primary action per screen | **สอดคล้อง** — login มีปุ่มเดียว, หน้าอื่นมี `.btn.primary` เดียวต่อ action group | ไม่พบปัญหา |

**สรุป:** เกณฑ์สองชุดไม่ขัดกันในเรื่องที่มีน้ำหนัก (contrast); ต่างกันแค่ **touch target** (24 vs 44) และ **ขนาดตัวอักษรขั้นต่ำ** (impeccable ไม่มีเกณฑ์นี้) — ผมจึงแยกให้เห็นในตารางว่าข้อไหนมาจาก WCAG และข้อไหนมาจาก brief

---

## 7. สรุปและคำถาม

**สิ่งที่ยืนยันได้ 100%**
- ไม่มี `src/app/(marketing)`, ไม่มี Next.js, ไม่มี Tailwind, ไม่มี dev server ที่ 3000 ในโปรเจกต์นี้
- `web/src/styles.css` เป็น CSS 3,183 บรรทัดที่ถูก append ต่อมา 8 ยุค มี palette 5 ชุด, hex 550 ค่า, font-size 34 ขนาด, radius 19 ค่า, breakpoint 9 ค่า
- focus ring ที่ผู้ใช้เห็นจริงคือ amber 3px ที่ **2.02:1** (ตก WCAG 1.4.11) เพราะ `!important` ที่บรรทัด 21
- modal ไม่มี focus trap, ไม่มี skip link, toast หายเองแบบหยุดไม่ได้, theme flash จาก `index.html:2` + `app.ts:14`
- detector: 12 findings → ผ่านการตรวจในบริบทแล้ว 5–6 ข้อ (ที่เหลือถูก override ไปแล้ว) ทั้งหมดคือ slop pattern เดียวกัน

**สิ่งที่ต้องให้คุณตัดสินก่อน ผมจึงจะเริ่มได้**

> **เลือกทิศทางไหน และจะเริ่มจากข้อไหนก่อน**

คำถามที่ต้องตอบเพื่อให้ผมทำงานต่อได้ (ตอบเท่าที่มี):
1. **Target จริงอยู่ที่ไหน** — repo นี้ถูกต้องไหม? ถ้าใช่ "landing page" ที่ต้องการคือ (ก) หน้าใหม่ที่ยังไม่มี (ข) หน้า login (ค) `app/` ตัว React หรือ (ง) คนละ repo
2. **Stack** — ถ้าจะสร้าง landing ใหม่ เลือก B1 (Angular route เดียวกัน) หรือ B2 (แยก static)? ผมแนะนำ **B1** เพราะไม่เพิ่ม dependency และกันแบรนด์ที่สอง
3. **เนื้อหา factual** — มีข้อความที่อนุมัติแล้วให้ใช้ไหม (ห้ามผมแต่งเอง)
4. **ลำดับ** — เอา A ก่อน (S, ปลอดภัย, แต่ผู้ใช้ไม่เห็น) หรือข้ามไป B/C เลย (เห็นผล แต่เสี่ยงกว่า)

> คุณสามารถสั่งให้ผมทำทีละข้อ รวมกัน หรือสลับลำดับได้ตามต้องการ
> หลังแก้แล้ว ให้รัน `/impeccable audit` ซ้ำเพื่อดูคะแนนขยับ (เป้า: 11 → 17+)
