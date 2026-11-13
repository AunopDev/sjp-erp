# Sidebar UX Redesign — Direction A (Accordion + Favorites/Recent)

| | |
|---|---|
| วันที่ | 2026-11-10 |
| สถานะ | **Implemented — Phase 1–5** (Settings IA = Phase 6 ยังไม่ทำ) |
| ขอบเขต | Navigation shell เท่านั้น (sidebar, topbar create, mobile drawer, bottom nav) |
| ผูกกับ | `web/src/app/shell/shell.component.ts`, `web/src/styles.css`, `web/src/app/core/storage.ts` |

---

## 1. ปัญหาที่พบ (ยืนยันจากโค้ดปัจจุบัน)

| # | ปัญหา | หลักฐาน |
|---|---|---|
| 1 | ทุกกลุ่มกางตลอด ไม่มี accordion | `shell.component.ts` วน `visibleGroups()` แบบ flat ไม่มี state การย่อ |
| 2 | หัวข้อกลุ่มเล็ก/จาง จนเหมือน "ไม่มีหมวด" | `.rail-group h4 { font-size: 11px; color: #998d84; }` |
| 3 | ปุ่มย่อ sidebar อยู่ topbar ไม่ได้อยู่ใน sidebar | `.sidebar-toggle` อยู่ใน `<header class="top">` |
| 4 | ไม่มี Favorite / Recent / ค้นหาเมนู | ไม่มี storage key และไม่มี UI |
| 5 | ปุ่ม "สร้าง" ผูก `/tickets/new` ตายตัว | `routerLink="/tickets/new"` ไม่สนหน้าปัจจุบัน |
| 6 | Bottom nav hardcode 4 เส้นทาง | `pinned()` filter `['/', '/tickets', '/projects', '/warehouse']` |
| 7 | เมนูมือถือเป็น grid เต็มจอ ไม่มีลำดับความสำคัญ | `menu-panel` + `menu-grid` แสดงทุกกลุ่มพร้อมกัน |
| 8 | Settings มี 10 แท็บแบนราบ | `settings.component.ts` ปุ่ม tab 10 ปุ่ม |

---

## 2. เป้าหมาย / ไม่ใช่เป้าหมาย

### เป้าหมาย
- ผู้ใช้ใหม่หาเมนูเจอภายใน **2 การตัดสินใจ** (เปิดกลุ่ม → เลือกงาน)
- ผู้ใช้ประจำเข้าถึงงานที่ใช้บ่อยได้ใน **1 คลิก** (Favorites)
- กลับไปงานล่าสุดได้ใน **1 คลิก** (Recent)
- Desktop ไม่ต้องเลื่อนเมนูในภาวะปกติ (20 รายการ + custom)
- Mobile ใช้ drawer เดียวกับ desktop แต่ใหญ่ขึ้น ไม่มีเมนูซ่อน
- Quick Create ตรงบริบทของหน้าปัจจุบัน

### ไม่ใช่เป้าหมาย (รอบนี้)
- ไม่เปลี่ยน route structure
- ไม่แก้สิทธิ์/role model
- ไม่แตะ DB schema หรือ metadata
- ไม่ทำ drag-and-drop จัดลำดับ favorites
- ไม่รวม Settings tabs (ทำเป็น Phase 2 หลัง sidebar นิ่ง)

---

## 3. Information Architecture ใหม่

รวม 7 กลุ่ม → **6 กลุ่ม** + โมดูลไดนามิก

| # | กลุ่ม | รายการ | ค่าเริ่มต้น | ไอคอนกลุ่ม |
|---|---|---|---|---|
| 1 | ภาพรวม | หน้าแรก `/`, งานของฉัน `/my`, ปฏิทินงาน `/calendar`, คำขออนุมัติ `/approvals` | เปิด | `home` |
| 2 | งานบริการและโครงการ | แจ้งซ่อม `/tickets`, งาน PM `/pm`, โครงการ `/projects` | ยุบ | `wrench` |
| 3 | จัดซื้อและคลัง | ใบสั่งซื้อ `/purchase-orders`, คลังสินค้า `/warehouse` | ยุบ | `box` |
| 4 | บัญชีและการเงิน | ใบแจ้งหนี้/วางบิล, ใบเสร็จ/รับชำระ, ค่าใช้จ่าย | ยุบ | `receipt` |
| 5 | ข้อมูลหลัก | ลูกค้า, ผู้ขาย, ผู้ติดต่อ, ไซต์งาน, สินค้า/อุปกรณ์, Serial Number | ยุบ (อยู่ล่างสุดก่อนระบบ) | `building` |
| 6 | ระบบ | รายงานและส่งออก, ตั้งค่า | ยุบ | `gear` |
| + | โมดูลของฉัน | custom modules ตามสิทธิ์ | ยุบ | `puzzle` |

**การเปลี่ยนชื่อ**
- `แจ้งซ่อม / Service Ticket` → **แจ้งซ่อม** (ชื่อเต็มคงอยู่ในหน้าและ breadcrumb)
- `ตั้งค่าผู้ใช้/สิทธิ์` → **ตั้งค่า**

**เหตุผลที่ย้าย `/calendar` มาภาพรวม:** ปฏิทินรวมนัดหมาย Ticket / PM / Project / PO เป็นตารางงานส่วนตัว ใช้บ่อยและไม่ผูกกับโดเมนเดียว

**เหตุผลที่รวมโครงการกับงานบริการ:** ลดจำนวนหัวข้อหลัก และทั้งคู่เป็นงานปฏิบัติการที่ทีมเดียวกันใช้ (ถ้าอนาคตมีโมดูลขาย/ใบเสนอราคา ค่อยแยก "งานขาย" ออก)

---

## 4. Wireframe 3 สถานะ

### 4.1 Desktop expanded — 256px

```
┌────────────────────────────────────┐
│  SJP ERP                    [ « ]  │  ← ปุ่มย่ออยู่ใน sidebar
│  ระบบงานบริษัท                     │
├────────────────────────────────────┤
│  [ 🔍 ค้นหาเมนู…              / ]  │  ← sticky, กรองเฉพาะเมนู
│                                    │
│  ★ รายการโปรด                      │
│    ▸ หน้าแรก                       │
│    ▸ แจ้งซ่อม                      │
│    ▸ ใบสั่งซื้อ                    │
│                                    │
│  ↺ ล่าสุด                          │
│    คลังสินค้า                      │
│    ใบแจ้งหนี้/วางบิล               │
│                                    │
│  ▾ ภาพรวม                          │  ← 40px, ตัวหนา, มี chevron
│      หน้าแรก                ●     │  ← active: แถบซ้าย + tint
│      งานของฉัน                    │
│      ปฏิทินงาน                    │
│      คำขออนุมัติ             (3)   │
│                                    │
│  ▸ งานบริการและโครงการ             │
│  ▸ จัดซื้อและคลัง                   │
│  ▸ บัญชีและการเงิน                  │
│  ▸ ข้อมูลหลัก                      │
│  ▸ ระบบ                            │
├────────────────────────────────────┤
│  🌙 โหมดสว่าง                      │
└────────────────────────────────────┘
```

### 4.2 Desktop collapsed — 72px rail + flyout

```
┌──────┐   ┌─────────────────────────┐
│ SJP  │   │ งานบริการและโครงการ      │
│  ⌂   │◀──│ ▸ แจ้งซ่อม              │
│  🔧  │   │ ▸ งาน PM                │
│  ▦   │   │ ▸ โครงการ               │
│  🧾  │   │                         │
│  🏢  │   │ ★ ปักหมุดหน้านี้         │
│  ⚙   │   └─────────────────────────┘
│      │
│  [»] │
└──────┘
```

- ไอคอน 1 ตัว = 1 กลุ่ม
- hover (desktop) เปิด flyout หลัง 120ms / click เปิดค้าง (touch)
- flyout แสดงชื่อกลุ่ม + รายการ + ดาวปักหมุด
- active group มีแถบสีซ้าย, active item มีจุด

### 4.3 Mobile drawer — `min(86vw, 340px)`

```
┌──────────────────────────────┐
│  เมนู                [ ✕ ]   │
│  [ + สร้างใหม่ ]             │  ← quick create chips
│  [ 🔍 ค้นหาเมนู… ]           │
│  ★ รายการโปรด                │
│  ↺ ล่าสุด                    │
│  ▾ ภาพรวม                    │
│  ▸ งานบริการและโครงการ       │
│  ▸ จัดซื้อและคลัง             │
│  ▸ บัญชีและการเงิน            │
│  ▸ ข้อมูลหลัก                │
│  ▸ ระบบ                      │
└──────────────────────────────┘

Bottom nav (4 ช่อง):
[ หน้าแรก ] [ แจ้งซ่อม ] [ ใบสั่งซื้อ ] [ เมนู ]
   ★1          ★2           ★3          grid
```

- Bottom nav ใช้ favorites 3 รายการแรก (กรองตามสิทธิ์) + "เมนู"
- ถ้า favorites ว่าง ใช้ fallback: `/`, `/tickets`, `/projects`
- Drawer lock body scroll, focus trap, ปิดเมื่อ navigate

---

## 5. พฤติกรรมโดยละเอียด

### 5.1 Accordion
- Group header เป็น `<button aria-expanded aria-controls>`
- กลุ่มที่มี route ปัจจุบัน **เปิดอัตโนมัติ** ทุกครั้งที่ navigate
- ผู้ใช้เปิดหลายกลุ่มพร้อมกันได้ (multi-open)
- เก็บเฉพาะกลุ่มที่ผู้ใช้ **ปิดเอง** ใน `sjp-nav-closed-groups` (array ของชื่อกลุ่ม) เพื่อให้กลุ่มใหม่เปิด默认
- animation สูงสุด 180ms, เคารพ `prefers-reduced-motion`

### 5.2 Favorites
- ดาวอยู่ท้ายรายการ: แสดงเมื่อ hover/focus-within; ถ้าปักแล้วแสดงตลอด
-  limite 6 รายการ; ปักเพิ่มเมื่อเต็ม → toast "ปักได้สูงสุด 6 รายการ"
- ลำดับตามเวลาปัก (ไม่มี drag ในรอบนี้)
- seed ครั้งแรก (เฉพาะเมื่อยังไม่มี key): `['/', '/tickets', '/projects']` กรองด้วยสิทธิ์
- unpin → ลบออกทันที
- `aria-pressed` + `aria-label="ปักหมุด <ชื่อ>"`

### 5.3 Recent
- บันทึกทุก `NavigationEnd` ที่ path ตรงกับ nav item (ไม่รวม record detail)
- เก็บ 5 รายการล่าสุด, dedupe, ใหม่สุดอยู่บน
- ซ่อนรายการที่อยู่ใน favorites
- ถ้าน้อยกว่า 1 รายการ → ซ่อน section
- เก็บเฉพาะ path ใน storage; label/icon resolve จาก nav ทุกครั้ง (รองรับ rename)

### 5.4 In-nav search
- input sticky ใต้ header
- กรองด้วย `label + group` (case-insensitive, รองรับภาษาไทย)
- ขณะมี query: ซ่อน Favorites/Recent, แสดงผลแบบ group ที่ match และ auto-expand
- ไม่พบ → "ไม่พบเมนูที่ตรงกับ “…”"
- `Escape` ล้าง query; `Enter` เปิดผลแรก
- shortcut `/` โฟกัสช่องนี้ เมื่อไม่ได้อยู่ใน input/textarea/select และไม่มี modal
- ไม่ค้น record — นั่นคือ Ctrl K palette เดิม

### 5.5 Collapsed rail + flyout
- ปุ่มย่อ/ขยายอยู่ใน sidebar header (มุมขวา) และคงอยู่ใน storage key เดิม `sjp-sidebar-collapsed`
- topbar `.sidebar-toggle` **ถอดออกบน desktop** (เหลือเฉพาะ tablet)
- flyout เป็น panel ตำแหน่งขวาของ rail, ความกว้าง 232px, มีเงา
- เปิดด้วย hover intent 120ms หรือ click; ปิดเมื่อ mouseleave (เฉพาะ desktop), `Esc`, หรือ navigate
- keyboard: `Tab` เข้าไอคอน → `Enter/Space` เปิด → `Esc` ปิด → focus กลับไอคอน
- item ใน flyout มีดาวปักหมุดและ badge

### 5.6 Mobile drawer + bottom nav
- ใช้ `side-nav` component เดียวกันใน mode `drawer`
- ปุ่ม "เมนู" ใน bottom nav เปิด drawer
- drawer มี quick create chips ด้านบน (เฉพาะ action ที่มีสิทธิ์)
- ปิด drawer เมื่อเลือกเมนู, กด overlay, หรือ `Esc`
- focus trap + คืน focus ให้ปุ่มที่เปิด
- bottom nav label ตัดด้วย ellipsis ไม่ wrap

### 5.7 Active / badge
- active item: `aria-current="page"`, แถบซ้าย 3px, พื้น tint, ตัวหนา
- badge คำขออนุมัติแสดงทั้งที่ item และ group header (ผลรวม)
- notification bell คงอยู่ใน topbar

### 5.8 Quick Create (context-aware)
แทนที่ปุ่ม "สร้าง" ที่ชี้ `/tickets/new` ตลอด

**ปุ่มหลัก** = action ที่ตรงบริบทปัจจุบัน:

| หน้าปัจจุบัน | ปุ่มหลัก | ปลายทาง |
|---|---|---|
| `/tickets*` | แจ้งซ่อม | `/tickets/new` |
| `/projects*` | โครงการ | `/projects?new=1` |
| `/purchase-orders*` | ใบสั่งซื้อ | `/purchase-orders?new=1` |
| `/entities/invoices*` | ใบแจ้งหนี้ | `/entities/invoices?new=1` |
| `/entities/receipts*` | รับชำระ | `/entities/receipts?new=1` |
| `/entities/expenses*` | ค่าใช้จ่าย | `/entities/expenses?new=1` |
| `/entities/<other>` | เพิ่ม <ชื่อ entity> | `/entities/<other>?new=1` |
| อื่น ๆ | แจ้งซ่อม | `/tickets/new` |

**เมนูรอง** (คลิก caret): แจ้งซ่อม, ใบสั่งซื้อ, ใบแจ้งหนี้, รับชำระ, ค่าใช้จ่าย, โครงการ — เฉพาะที่ `auth.can(resource, 'create')`

**การรองรับ `?new=1`** (แก้เล็กน้อย 3 หน้า):
- `entity-list.component.ts` → อ่าน `new` query param แล้ว `formOpen.set(true)` + ล้าง param ด้วย `replaceUrl`
- `purchase.component.ts` → เช่นเดียวกัน
- `projects.component.ts` → เช่นเดียวกัน
- ถ้าไม่มีสิทธิ์ create → ไม่แสดง action และไม่เปิดฟอร์ม

---

## 6. State & Storage

เพิ่มใน `web/src/app/core/storage.ts`

| Key | Type | ค่าเริ่มต้น | หมายเหตุ |
|---|---|---|---|
| `sjp-nav-favorites` | `string[]` | seed `['/', '/tickets', '/projects']` | max 6, เก็บ path |
| `sjp-nav-recent` | `string[]` | `[]` | max 5, ใหม่สุดก่อน |
| `sjp-nav-closed-groups` | `string[]` | `[]` | เก็บชื่อกลุ่มที่ผู้ใช้ปิด |
| `sjp-sidebar-collapsed` | `'0' \| '1'` | `'0'` | key เดิม ใช้ต่อ |

**Edge cases**
- path ใน favorites/recent ที่ไม่ปรากฏใน nav (สิทธิ์หาย/โมดูลถูกลบ) → กรองตอน render แต่ไม่ลบจาก storage
- custom module ถูกเพิ่ม → ปรากฏใน "โมดูลของฉัน" และปักหมุดได้ทันที
- storage ถูก disable → ใช้ค่า in-memory, ไม่ throw
- กลุ่มที่ active ถูกปิดโดยผู้ใช้ แล้ว navigate ไปกลุ่มอื่น → กลุ่มใหม่เปิด, กลุ่มเดิมคงสถานะปิด

---

## 7. Component Structure

### ไฟล์ใหม่
```
web/src/app/shell/side-nav.component.ts
web/src/app/shell/quick-create.component.ts
```

**`SideNavComponent`**
- Inputs: `mode: 'expanded' | 'rail' | 'drawer'`, `groups`, `favorites`, `recent`, `pendingApprovals`, `currentUrl`, `collapsed`
- Outputs: `navigate`, `toggleFavorite`, `toggleGroup`, `toggleCollapse`, `closeDrawer`, `quickCreate`
- รับผิดชอบ: search, accordion, favorites/recent render, rail flyout, a11y

**`QuickCreateComponent`**
- Inputs: `currentUrl`, `canCreate` map
- Output: `selected(path)`
- รับผิดชอบ: ปุ่มหลัก + dropdown + keyboard

### ไฟล์ที่แก้
- `shell.component.ts` — ใช้ `<app-side-nav>` 3 ที่ (desktop, drawer), topbar เปลี่ยน create เป็น quick create, ถอด toggle ออก
- `storage.ts` — keys + read/write helpers
- `entity-list.component.ts`, `purchase.component.ts`, `projects.component.ts` — รองรับ `?new=1`
- `styles.css` — **เพิ่ม section ใหม่ท้ายไฟล์** ใช้ prefix `sb-` เท่านั้น

### ยุทธศาสตร์ CSS
`styles.css` ปัจจุบันยาว ~3,400 บรรทัดและมี rail/nav ถูก override มาหลายยุค

- **ห้ามแก้ block เก่าแบบไล่จุด**; เพิ่ม section ใหม่ `/* ===== Sidebar v2 ===== */`
- ใช้ class ใหม่ทั้งหมด: `.sb`, `.sb-head`, `.sb-search`, `.sb-section`, `.sb-group`, `.sb-item`, `.sb-rail`, `.sb-flyout`
- ลบ markup เดิม `.rail-*`, `.menu-grid` ออกจาก shell เมื่อ side-nav ใหม่เสร็จ
- เก็บ CSS เก่าที่ไม่ถูกใช้ไว้ลบใน phase สุดท้าย (กัน regression)

---

## 8. Visual Spec

| รายการ | ค่า |
|---|---|
| Expanded width | 256px |
| Rail width | 72px |
| Drawer width | `min(86vw, 340px)` |
| Header height | 64px |
| Group header | 40px, radius 10px, padding 0 10px |
| Nav item | 38px, radius 10px, padding 0 10px 0 12px |
| Icon | 18px (item), 20px (rail) |
| Font group | 13px / 700 |
| Font item | 14px / 500 (active 600) |
| Section label (โปรด/ล่าสุด) | 11.5px / 600 / tracking .4px / `--muted` |
| Badge | 11px / 700, pill, `--pri` |
| Active | แถบซ้าย 3px `--pri` + พื้น `pri 10%` |
| Hover | พื้น `--line2` 60% |
| Motion | 180ms `cubic-bezier(.2,.8,.2,1)` |
| Focus | ใช้ `--focus-ring` เดิม 3px |
| Thai text | `line-height: 1.55`, `overflow-wrap: anywhere` |

**Dark mode**: ใช้ token เดิมทั้งหมด ไม่เพิ่ม palette ใหม่; ตรวจ contrast ≥ 4.5:1

---

## 9. Accessibility

- `<nav aria-label="เมนูหลัก">` + `<ul role="list">`
- group header เป็น button จริง (`aria-expanded`, `aria-controls`)
- active item `aria-current="page"`
- star button `aria-pressed`
- rail flyout: `role="group"`, `aria-label="<ชื่อกลุ่ม>"`, `Esc` ปิด, focus กลับ
- drawer: focus trap, `aria-modal="true"`, คืน focus
- ทุก interactive มี focus ring ชัด
- touch target ≥ 44px บน mobile (item สูง 44px ใน drawer)
- `prefers-reduced-motion: reduce` → ปิด animation
- skip link เดิมยังใช้ได้

---

## 10. Responsive Acceptance

| Width | พฤติกรรม |
|---|---|
| 1440px | sidebar expanded 256px, ไม่มี horizontal scroll, เมนู 20 รายการ + custom อยู่ในสายตา |
| 1024px | ยัง expanded; ถ้าผู้ใช้ย่อ → rail + flyout |
| ≤900px | ใช้ breakpoint เดียวกับ shell เดิม: ซ่อน sidebar และใช้ drawer + bottom nav |
| 390px | drawer + bottom nav 4 ช่อง; ไม่มี overflow; ปุ่ม≥44px |
| 320px | drawer เต็มความกว้าง, label ตัด ellipsis, ไม่มีปุ่มล้น |

---

## 11. Acceptance Criteria

- [ ] กลุ่มทั้ง 6 + โมดูลของฉัน แสดงและย่อ/ขยายได้
- [ ] กลุ่มของ route ปัจจุบันเปิดอัตโนมัติ
- [ ] สถานะย่อ/ขยายกลุ่มอยู่รอดหลัง reload
- [ ] ปักหมุด/ยกเลิกได้, จำกัด 6, อยู่รอดหลัง reload
- [ ] Recent แสดง ≤5, ไม่ซ้ำ, อัปเดตเมื่อเปลี่ยนหน้า
- [ ] ค้นหาเมนูกรองถูกต้อง, ไม่พบมีข้อความ, `Esc` ล้าง
- [ ] Rail แสดง 1 ไอคอน/กลุ่ม, flyout เปิดด้วย mouse + keyboard, `Esc` ปิด
- [ ] Mobile drawer เปิด/ปิดได้, bottom nav ใช้ favorites, ไม่มี overflow ที่ 375/320
- [ ] Quick Create เปลี่ยนตามหน้าและสิทธิ์; `?new=1` เปิดฟอร์มและล้าง URL
- [ ] Light/Dark ผ่าน contrast, focus ring มองเห็น
- [ ] `npm run build` + `npm test` ผ่าน
- [ ] ไม่มี console error และไม่มี horizontal overflow ที่ 375/768/1440

---

## 12. Implementation Phases

**Phase 1 — Foundation (sidebar desktop)**
1. `storage.ts` keys/helpers
2. `SideNavComponent` expanded + accordion + active group
3. เปลี่ยน shell ให้ใช้ component, ย้ายปุ่มย่อเข้า sidebar
4. CSS section ใหม่ `sb-*`

**Phase 2 — Personalization**
5. Favorites + Recent + seed/limits
6. In-nav search + `/` shortcut
7. Badge approvals ที่ group header

**Phase 3 — Collapsed + Mobile**
8. Rail + flyout (mouse/keyboard/touch)
9. Drawer + focus trap + bottom nav จาก favorites

**Phase 4 — Quick Create**
10. `QuickCreateComponent` + context mapping
11. `?new=1` ใน entity-list / purchase / projects
12. ลบปุ่ม create เดิม

**Phase 5 — Verification**
13. ตรวจ 320/375/768/1024/1440, light/dark
14. build/test, อัปเดต README, ล้าง `server/data`

**Phase 6 (แยก PR) — Settings IA**
- จัด 10 แท็บเป็น 3 กลุ่ม: ผู้ใช้และสิทธิ์ / ปรับแต่งระบบ / การเชื่อมต่อและข้อมูล
- ไม่ทำในรอบ sidebar เพื่อลดความเสี่ยง

---

## 13. ความเสี่ยง & การลดความเสี่ยง

| ความเสี่ยง | ลดอย่างไร |
|---|---|
| CSS เก่าทับ CSS ใหม่ | ใช้ `sb-` prefix + section เดียว + ลบ markup เก่า |
| สิทธิ์เปลี่ยนแล้วเมนูค้าง | คำนวณ `visibleGroups` จาก `auth.can` ทุกครั้ง (ของเดิม) |
| Recent ชี้ path ที่ถูกลบ | resolve จาก nav ปัจจุบัน, ไม่ render ถ้าไม่พบ |
| Drawer/menu ทำ body เลื่อนทะลุ | lock scroll + cleanup on destroy |
| Quick create เปิดฟอร์มทั้งที่ไม่มีสิทธิ์ | ตรวจ `auth.can(resource,'create')` ทั้งตอนแสดงและตอน navigate |
| Regression หน้าอื่น | ไม่แตะหน้า pages ยกเว้น 3 ไฟล์ที่เพิ่ม `?new=1` |

---

## 14. คำถามที่ต้องการ confirmation ก่อนลงมือ

1. **seed favorites เริ่มต้น** `['/', '/tickets', '/projects']` ยอมรับได้ไหม หรืออยากเริ่มว่างแล้วให้ผู้ใช้ปักเอง?
2. **bottom nav** ใช้ 3 favorites + เมนู หรือคง 4 ทางลัดเดิม (`/`, `/tickets`, `/projects`, `/warehouse`) + เมนู?
3. **Settings tabs** ทำ Phase 6 หลัง sidebar หรืออยากให้รวมในรอบนี้?

---

## 15. Implementation notes (หลังลงมือ)

- Breakpoint ใช้ **900px** ตาม shell เดิม ไม่ใช่ 768px เพื่อไม่ให้เกิดสอง breakpoint ที่ซ้อนกัน
- Favorites seed แบบ lazy: UI แสดง `/, /tickets, /projects` ทันที แต่จะเขียนลง storage เมื่อผู้ใช้ปัก/ยกเลิกครั้งแรก
- Recent บันทึกเฉพาะ path ที่ตรงกับ nav item (record detail ไม่ถูกบันทึก) และบันทึกหน้าปัจจุบันตอน shell เริ่มทำงาน
- Drawer มี quick create chips ตาม action ที่มีสิทธิ์ และโฟกัสช่องค้นหาอัตโนมัติ
- Rail flyout เปิดด้วย hover (desktop) หรือ click (touch) และปิดด้วย Esc / คลิกนอก / scroll
- Tablet (561–900px) แสดงชื่อหน้าปัจจุบันใน topbar แทนพื้นที่ว่าง
- CSS ทั้งหมดของ sidebar ใหม่ใช้ prefix `sb-` และ quick create ใช้ `qc-`; ไม่แก้ block เก่า ยกเว้น breakpoint ของ topbar
- เพิ่ม `storage.spec.ts` ครอบการอ่าน/เขียน/ข้อมูลเสียของ nav storage
- ยังไม่ได้ทำ: drag-and-drop จัดลำดับ favorites, saved views, inline create master data, Settings IA (Phase 6)
