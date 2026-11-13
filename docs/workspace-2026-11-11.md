# Workspace / Free-form Dashboard — 2026-11-11

## What it is

A personal “desktop” for the ERP. Each user can drag work cards anywhere on the page,
resize them, hide the ones they do not use, and keep the arrangement. It is role-aware:
only cards the signed-in role can access are offered.

Open it from:

- sidebar → ภาพรวม → **โต๊ะทำงาน**
- dashboard → **จัดหน้าจอ**
- direct URL `/workspace`

## Widgets

| Card | Content | Shown for |
|---|---|---|
| ตัวชี้วัดสำคัญ | KPI strip (งานของฉัน, รออนุมัติ, เคสค้าง, PM เกินกำหนด, สินค้าต่ำ, ใกล้หมดประกัน) | roles with matching views |
| งานของฉัน | assigned tickets, PM jobs, projects | tickets / pm / projects |
| คำขออนุมัติ | pending count + link | tickets / purchase / accounting |
| คิวงานที่ต้องจัดการ | oldest open tickets | tickets |
| ความเคลื่อนไหวล่าสุด | latest audit events | everyone |
| ภาพรวมการเงิน | outstanding / overdue / receipts / expenses | accounting |
| เคสตามสถานะ / ตามทีม / ตามผู้รับผิดชอบ | workload bars | tickets |
| โครงการตามขั้นตอน | active projects by current step | projects |
| งาน PM | overdue and this-week counts + assigned jobs | pm |
| ทางลัด | permission-filtered quick links | everyone |

## How to use

1. Press **จัดหน้าจอ**.
2. Drag a card by its floating handle. Cards snap to an 8px vertical grid.
3. Drag the bottom-right corner to change width (18–100%).
4. Use the **×** on a card handle to hide it; the chip row at the top restores it.
5. **จัดเรียงอัตโนมัติ** returns to the compact grid arrangement.
6. **รีเซ็ต** deletes the saved arrangement and restores the default.
7. **เสร็จสิ้น** leaves edit mode. Changes are also auto-saved while editing.

Keyboard (focus the card handle):

- Arrow keys move by 12px (Shift = 40px)
- `+` / `-` resize by 2%
- The card being moved always comes to the front; stacking order is saved.

Desktop (≥960px) uses the free canvas. Phones and narrow tablets show the cards in the
saved top-to-bottom order as a single column; the edit button is disabled with a clear
label (“จัดหน้าจอบนจอใหญ่”).

## Persistence

- `GET /api/prefs/workspace` – current user's layout
- `PUT /api/prefs/workspace` – save `{ version, widgets, hidden }`
- `DELETE /api/prefs/workspace` – reset

Layouts are stored per user in the `settings` table under `workspace:<userId>`, so they
survive browser changes and are included in backups. The server clamps coordinates
(x 0–100%, y 0–100000px, width 6–100%, z 0–10000), drops unknown hidden keys and rejects
payloads over 64 KB. Overlapping cards are allowed; the most recently moved card has the
highest z-order.

## Verification

UI flow (headless Edge + CDP):

```text
flow view            12 widgets, no horizontal overflow
enter edit           12 handles + catalog chips
drag queue           x 0% → 9.5%, y 315 → 384px
resize queue         width 57.73% → 70%
z-order              queue z = 12, persisted
auto-save            3 PUTs while editing
reload               position + z + hidden card preserved
hide finance         removed from canvas, chip shows “ซ่อน”
reset                DELETE, back to flow grid, finance restored
mobile 390px         flow, 12 widgets, edit disabled, overflow 0
```

Full audit (including `/workspace`) – 19 routes × 5 widths = 95 checks per theme:

```text
dark:  95 pages · clipped 0 · offscreen 0 · container 0 · tiny 0
light: 95 pages · clipped 0 · offscreen 0 · container 0 · tiny 0
```

Regression suites:

```text
server unit 13/13 · server e2e 18/18 · web 15/15 · web build success
```

