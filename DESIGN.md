# SJP ERP — DESIGN.md

Design system for the Angular ERP in `web/`. The shell and dashboard follow a **calm operations console**: neutral surfaces, dense data, one brand accent, and hierarchy from type and alignment rather than decoration.

## References studied

| Source | Adopted |
|---|---|
| Stripe Dashboard | Card-less dashboard, 5–6 key numbers, restrained color, typography-led hierarchy |
| Salesforce Lightning (SLDS) | 13px body, 20px page title, 12px labels, 240px side panel, compact tables |
| SAP Fiori | Actions right-aligned in the page header, one primary action per page, workflow actions in footer |
| NetSuite Redwood | Sticky header, global search, Create New top-right, hover reveals secondary controls |
| Linear | Sidebar recedes, 4px rhythm, muted chrome, active state by fill not stripes |
| Odoo 18 | Inverted-L shell, breadcrumb, dense list views, status badges |

## Direction

- **Inverted L**: flush sidebar + flush top bar. No floating cards, no body gradients, no grid texture.
- **Density with air**: 13–14px text, 32px nav rows, 34px inputs, 8px table cell padding.
- **One accent**: brand red `--pri` is reserved for primary actions, active navigation, alerts. Everything else is neutral.
- **Flat surfaces**: 1px borders, 6–8px radii, almost no shadows. Shadows only for overlays/popovers.
- **Numbers are data**: `font-variant-numeric: tabular-nums` on KPIs, table numbers, finance values.

## Tokens

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#f6f7f9` | `#0d1117` |
| `--card` | `#ffffff` | `#151b23` |
| `--card-2` | `#f9fafb` | `#11161d` |
| `--ink` | `#111827` | `#e6edf3` |
| `--muted` | `#5b6472` | `#9aa4b2` |
| `--line` | `#dfe3e8` | `#28313d` |
| `--line2` | `#eceff3` | `#1e2631` |
| `--pri` | `#d92c34` | `#f0525a` |
| `--pri-d` | `#b01e26` | `#ff7b81` |
| `--pri-l` | `#fef2f3` | `rgba(240,82,90,.13)` |
| `--ok` | `#067647` | `#4ade80` |
| `--warn` | `#b54708` | `#fbbf24` |
| `--bad` | `#b42318` | `#f87171` |

Radii: `4 / 6 / 8 / 10`. Shadows: `--shadow-sm` for static surfaces, `--shadow-md` only for floating layers.

## Type

| Role | Size | Weight |
|---|---|---|
| Page title | 22–24px | 700 |
| Section / panel title | 12.5–16px | 600–700 |
| Body | 13px | 400 |
| Nav item | 13px | 500 (active 600) |
| Group label | 12px | 600 |
| Micro label / meta | 10.5–11.5px | 500–600 |

Font: IBM Plex Sans Thai (already bundled). Line-height 1.5 for Thai; never clip tone marks.

## Layout

- Sidebar: 248px expanded / 60px rail. Header 56px. Groups are 32px rows; active group auto-opens.
- Top bar: 56px sticky, breadcrumb left, search `min(340px,30vw)` before quick create, utilities right.
- Content: max 1600px, 20–24px padding.
- Tables: full width, sticky header, 11.5px header labels, 13px cells, row hover `--card-2`.
- Modals: max 640/960px, radius 10, footer actions right.
- Mobile: drawer `min(86vw,340px)`, bottom nav 56px + safe area.

## Components

- **Buttons**: 32px; primary red; secondary bordered; ghost text. One primary per page header.
- **Inputs**: 34px, 1px border, 6px radius, 3px focus halo.
- **Cards**: only when grouping is meaningful; dashboard avoids cards in favor of panels and dividers.
- **Badges**: 11px, 4px radius, semantic pastel. Status never relies on color alone (text is always present).
- **Tabs**: 13px, 2px underline, scroll horizontally on narrow screens.
- **Empty/loading**: `app-state`; 28px padding, 12.5px message, dashed empty container.
- **Settings**: vertical grouped sub-nav on desktop, horizontally scrollable chips on mobile; 3 groups instead of 10 flat tabs.
- **Table tools**: search, filters, saved views (`sjp-views-<table>`), column chooser (`sjp-cols-<table>`), CSV export.
- **Density**: `compact` (default) / `comfy` via the user menu, persisted in `sjp-density` and applied as `html[data-density]`.
- **Favorites**: drag to reorder on desktop; order is persisted and reused by the mobile shortcut bar.

## Dashboard structure

1. Header (kicker, title, subtitle, secondary actions)
2. 6 KPI cells in a single bordered strip
3. Work queue + activity (1.65fr / 1fr)
4. Finance strip (4 cells)
5. 4 compact bar panels

## Rules

- Do not reintroduce warm beige/cream surfaces, radial gradients, or glow shadows.
- Do not use side-stripe accents for cards, nav, or table rows. Active state = fill + weight + icon color.
- Do not add a second primary button to a page header.
- Do not hide the only label behind an icon on desktop.
- Keep Thai text at ≥11px and allow wrapping at spaces; do not break words mid-token in tables.
- Verify at 320 / 375 / 768 / 1024 / 1440 and in light/dark before shipping.

## Implementation note

The legacy CSS is layered over several design iterations. New work appends to the final "SJP ENTERPRISE UI v3" section at the end of `web/src/styles.css`; do not patch older blocks. New sidebar classes use the `sb-` prefix and quick create uses `qc-`.
