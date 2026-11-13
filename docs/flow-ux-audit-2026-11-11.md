# Flow & UX Audit — 2026-11-11

Companion to `ui-consistency-audit-2026-11-11.md`. This pass walked real user flows
(login → create → approve → receive → close) with headless Edge/CDP and API checks,
then fixed the flow and UX defects found.

## How it was tested

- 6 role accounts: `pm.demo`, `helpdesk.demo`, `tech.demo`, `store.demo`, `buyer.demo`,
  `exec.demo`
- 14 routes per role, rendered in the browser at desktop and phone widths
- API flow suite: ticket lifecycle, project steps, PO → receive → stock, PM jobs,
  vehicle booking, approval request/decision
- UI create flows: ticket page form, PO modal, vehicle booking modal, stock receive
- Auth flows: unauthenticated deep link, session expiry, redirect after login

## Critical fixes

### 1. Row editors edited the wrong line

Line-item tables (`rows` fields: PO lines, BOQ, project attendees) used the inner
column loop's `$index` as the row index. The first column happened to be index 0, so
the item column worked; quantity, price and every later column wrote to a non-existent
row and were silently dropped. Delete removed the wrong line.

- Fix: outer `@for` now aliases `let rowIndex = $index`; all `setRow` / `removeRow`
  calls use `rowIndex`. Same bug fixed in entity-detail row rendering (lookup labels).
- Evidence: intercepted request before the fix:

```json
{"vendor":"…","orderDate":"2026-11-11","lines":[{"item":"…"}]}
```

after the fix:

```json
{"vendor":"…","orderDate":"2026-11-11","lines":[{"item":"…","qty":"2","unitPrice":"150"}]}
```

PO creation through the modal now closes and shows “สร้างรายการแล้ว”.

### 2. Configured approvers could not approve

Approval authority comes from the workflow (`approverRole` / `approverUser`), but the
approved action ran with the approver's own module permissions. An executive role with
view-only access (the normal case) got `403 คุณไม่มีสิทธิ์ดำเนินการนี้` when pressing
Approve, so approver roles could never approve POs, tickets or project steps.

- Fix: `ApprovalDecisionService` verifies the approver, then executes the approved
  action with the edit gate lifted while keeping the approver's id for audit trails.
- Evidence: `exec.demo` (purchase view-only) approved PO-0007 through the UI: toast
  “อนุมัติแล้ว”, PO status changed `draft → ordered`.

### 3. Requesters saw buttons they could not use

`/approvals` showed Approve/Reject to the person who submitted the request, which then
failed with a permission error. The API now returns `canDecide` per request and the page
shows either the action buttons or “รอผู้อนุมัติ / คำขอของคุณ”.

- Evidence: buyer pending list → only “เปิดเอกสาร”; exec pending list → “อนุมัติ /
  ไม่อนุมัติ / เปิดเอกสาร”.

### 4. Silent “pending approval” state

Submitting a status change that required approval showed “เปลี่ยนสถานะแล้ว” while the
record stayed in its old status.

- Ticket detail, PO detail and project steps now show
  “ส่งคำขออนุมัติแล้ว — รอผู้อนุมัติ”.
- Ticket and PO detail pages show a banner with the request title and approver while a
  request is pending.

## Navigation and access flow

- Deep links are preserved: `/tickets/:id` while signed out → `/login?redirect=…` →
  after sign-in returns to the ticket.
- Session expiry now redirects to `/login?redirect=<current>&expired=1` and shows
  “เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่” instead of leaving a stale page.
- Module routes are guarded by real permissions. Direct URLs to `/settings`,
  `/purchase-orders`, `/pm`, `/tickets/new`, etc. redirect to the dashboard with
  “ไม่มีสิทธิ์เข้าถึงหน้านี้” instead of rendering an empty page full of 403 errors.
  Entity routes use metadata (`resource`) for the same check.
- Reports tabs are filtered by module permission; buyer sees projects/BOQ/serials/stock
  without a ticket tab or permission toast.
- Rate-limit and session errors are translated to Thai messages instead of raw
  `ThrottlerException: Too Many Requests`.

## Forms and guidance

- Required reference dropdowns with no data now explain what to create first, e.g.
  “ยังไม่มีข้อมูล “ผู้ติดต่อ” ให้เลือก — เพิ่มที่เมนู “ผู้ติดต่อ” ก่อน แล้วกลับมาเลือก”.
- Warehouse receiving, issuing and transfer validation stays inline in Thai, e.g.
  “การเบิกต้องอ้างอิงโครงการ ไซต์ หรือ Ticket อย่างน้อยหนึ่งอย่าง”.
- Purchase receive explains when no warehouse exists and disables saving; warehouse
  actions explain when master data is missing.
- Mobile line-item editors render each line as a labelled card, so long item names and
  numeric fields stay readable at 320–390 px.

## Mobile layout

- Calendar: event chips become colour dots on phones (agenda list still shows full
  details) instead of clipped “PM / 13:00” fragments; month navigation stays on one row.
- Vehicle booking: `‹ date ›` on one row, `วันนี้ / จองรถ` on the next.
- Page actions and action panels use the same 36px control height; small buttons 30px.
- Top bar, bottom navigation, notifications, quick create menu, command palette and
  user menu all fit inside a 320px viewport.
- Page headers are text-only on every page; secondary text never drops below 11px.

## Verification

```text
server unit:   13/13 passed
server e2e:    17/17 passed
web tests:     15/15 passed
web build:     success
UI audit:      125 checks per theme (20 routes × 5 widths + 10 settings tabs × 3 widths)
               dark:  clipped 0 · offscreen 0 · container 0 · tiny text 0
               light: clipped 0 · offscreen 0 · container 0 · tiny text 0
modal audit:   5 modals at 390px, 0 clipped text, 0 page overflow
overlays:      notifications / quick create / palette / user menu fit at 320px
```

Functional evidence:

```text
ticket page form      → created, redirected to /tickets/:id, title shown
PO modal              → created with item/qty/price; 2 lines, delete first → correct
vehicle booking modal → created, appears in list
stock receive         → balance 10 → 13, toast shown
issue without project → inline Thai validation error
approval flow         → buyer submits, exec sees it, approves, PO becomes ordered
approval rejection    → reason required, rejection recorded, PO stays draft
role deep links       → unauthorized routes redirect to dashboard with Thai toast
```

## Demo data added for testing

Master data is now present so purchase/stock/vehicle flows are usable:

- vendor: ผู้ขายทดสอบโฟลว
- warehouse: คลังกลางทดสอบ
- item: ITM-FLOW-01 / อุปกรณ์ทดสอบโฟลว
- vehicle: TEST-9999 / รถทดสอบโฟลว
- PM template: แม่แบบทดสอบโฟลว (2 checklist items)

Transactional rows created by this audit were archived afterwards
(tickets TK-0008…0012, projects PRJ-0006…0008, test POs, PM plan/template,
vehicle bookings).
