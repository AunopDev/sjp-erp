# UI Consistency / Overflow Audit — 2026-11-11

## Scope

- 20 routes: dashboard, my work, approvals, tickets, ticket list, ticket new,
  ticket detail, projects, project detail, vehicles, purchase list, purchase detail,
  warehouse, PM, PM record, reports, calendar, settings, customer list, customer detail,
  item detail
- Plus `/workspace` (free-form dashboard) – 19 routes × 5 widths audited separately
  in dark and light themes, 95 checks each, all clean.
- 5 viewport widths: 320, 390, 768, 1280, 1920 px
- 10 settings tabs at 320, 390 and 768 px
- 125 page checks per theme; run in both dark and light themes (250 renders)
- Modal pass: user create, vehicle booking, project create, PO create at 390 px
- Overlay pass at 320 px: notifications, quick create menu, command palette, user menu

## Automated checks

For every page/width:

- document horizontal overflow
- clipped text (scrollWidth > clientWidth with hidden/nowrap/ellipsis)
- nowrap overflow
- elements outside viewport
- card/header/form container overflow
- text smaller than 10.5px
- `.table-wrap` overflow
- button height/radius distribution

## Final result

```text
dark  pages=125  clipped=0  offscreen=0  container=0  tiny=0
light pages=125  clipped=0  offscreen=0  container=0  tiny=0
```

No page had horizontal document overflow at any width.

Overlays at 320 px:

```text
notifications   300px wide, inside viewport
quick create    210px wide, inside viewport
palette         304px wide, inside viewport
user menu       300px wide, inside viewport
```

Table wrapper overflow at 390/768/1280: 0.

Modals at 390 px (user create, vehicle booking, project create, PO create):

```text
modal width: 366px inside 390px viewport
modal body scrollWidth = clientWidth
clipped text: 0
page horizontal overflow: 0
```

## Fixes applied

- Unified tab headers into one segmented control with count chips.
- Removed custom `.vb-tabs` and `.meta-tabs` variants.
- Mobile tabs: balanced 2-column grid with wrapped labels, no truncation.
- Ticket detail: action panel is full-width on narrow screens, appears before details,
  sticky on wide screens; primary status button is full-width 36px.
- Global control sizing: buttons 36px, small buttons 30px, inputs 36px (page actions and
  action panels now use the same 36px control height).
- Every page header is now text-only; the two pages that had an icon in the `<h1>`
  were aligned with the rest.
- Secondary text is at least 11px everywhere, including dashboard queue lines, vehicle
  metadata, settings metadata field keys/flags and keyboard hints.
- Card headings use 14px; the action-panel heading matches.
- Calendar month cells show colour dots on phones instead of clipped event labels.
- Calendar prev/today/next stays on one row on phones.
- Vehicle date navigation (prev/date/next + today/book) stays on two tidy rows.
- Line-item editors (PO lines, BOQ, project attendees) stack into labelled cards on
  phones instead of four squeezed columns; delete stays on one line, top-right.
- Row editor index bug fixed: editing column 2+ or deleting a row now affects the correct
  line (previously the column index was used as the row index).
- Standardised form action rows (right aligned desktop, full width mobile).
- Mobile page actions use a 2-column grid instead of a 3+1 wrap.
- `/tickets/new` now renders a page-level form card, not a modal shell:
  normal page scroll, visible page header, full-width form and sticky footer.
- Mobile record-form footer sits above the bottom navigation and keeps both
  Cancel/Save buttons visible.
- Vehicle date navigation grouped into prev/date/next + today/book rows.
- Vehicle booking tabs now use the same segmented tab style as every other page.
- Metadata editor tabs now use the same segmented tab style with a count chip.
- PM “create cycle” button shortened so it never clips.
- Topbar user name max-width increased to 240px with full-name title.
- Secondary text under 11px raised to 11px for dashboard/activity/vehicle metadata.
- Dark-mode focus ring changed from blue to the product accent.
- Stat bar collapses to 2 columns at 1180px and 1 column at 560px.
- Mobile tables/cards retain delete/edit action buttons without overflow.

## Intentionally scrollable

The Settings → Modules module browser remains a horizontal strip on narrow screens.
It has a visible scroll hint and a scrollbar; it is not page overflow.

## Verification

```text
web build: success
web tests: 15/15 passed
```

## UI create flows

- Ticket page form, PO modal, vehicle booking modal and stock receive all create real
  records and refresh their lists.
- PO modal with two lines: editing item/quantity/price keeps all values; deleting the
  first line keeps the second line and sends the correct payload.
- Purchase receive and warehouse actions show a Thai hint and disable saving when no
  warehouse exists yet.

