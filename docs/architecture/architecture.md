# SJP ERP — Architecture

Interactive version: [`architecture.html`](architecture.html) (self-contained, no build step).
Source of truth for the runtime: `web/`, `server/`, `server/src/app.module.ts`.

## Shape

```text
Browser (Angular 22 SPA)
  └─ /api/*  ──►  NestJS 12 API (global prefix /api)
                    ├─ AuthGuard (JWT cookie + CSRF)  ──► users / roles
                    ├─ Metadata registry              ──► modules, fields, workflow
                    ├─ Records service                ──► validation, scope, audit
                    ├─ Files / PDF / Backup
                    ├─ Notifications (SMTP, LINE)
                    ├─ Webhooks (HMAC, SSRF guard)
                    └─ Search / Events / Operations
                              │
                              └─ SQLite (better-sqlite3 + Drizzle, WAL)
                                 server/data/sjp.sqlite
```

- **SPA** — Angular 22 standalone components + signals, route-level code splitting, `web/src/app`.
- **API** — NestJS 12, global `AuthGuard` + `ThrottlerGuard`, DTO validation, `Cache-Control: no-store`, CSP/security headers in `server/src/main.ts`.
- **Data** — SQLite with Drizzle ORM; `records` stores the metadata-driven payload, `audit`/`events` keep traceability.
- **Metadata** — modules/fields/workflow are editable at runtime in Settings → Modules; the generic records API validates against that schema.
- **External** — SMTP, LINE push, outbound webhooks, and PDF rendering through a headless Chrome/Edge/Chromium.

## Flows in the diagram

### 1. Login / session

`Browser → Angular → POST /api/auth/login → AuthService (bcrypt) → users/roles → HttpOnly cookie → route guard → dashboard`

- Login is rate-limited (5/min) and sets an HttpOnly cookie + CSRF token.
- `/auth/me` rebuilds the shell; nav/KPI are filtered by role and resource permissions.
- Deep links are preserved via `?redirect=`; expired sessions redirect to `/login?expired=1`.

### 2. Create a record (metadata-driven)

`Form → POST /api/records/:entity → permission/scope → metadata schema → validate → INSERT record + audit + event → 201 → list/detail refresh`

- The server rejects fields that are not in the module schema.
- Required/ref/rows/cross-customer-site validation happens server-side.
- Record + audit are written in one transaction; the UI gets the created record and shows a toast.

### 3. Approval + notification

`Approvals list → POST /api/approvals/:id/decide → ApprovalDecisionService → records action → UPDATE + audit → NotifyService / Webhook → LINE/email`

- `canDecide` is computed per request, so requesters see “waiting” instead of buttons they cannot use.
- The approver’s authority comes from the workflow (`approverRole` / `approverUser`), not from their module edit permission.
- Notifications are best-effort; the approval itself is already committed.

## Modes

| Mode | What changes |
| --- | --- |
| **Dev** | SPA on `:4200`, API on `:3000/api`, Vite/Angular dev proxy |
| **Prod** | SPA served as static files behind nginx/TLS, API under `/api`, CSP from `index.production.html` |

The topology is the same; only URLs/ports and the proxy layer change.

## Assumptions

- The diagram describes the code in this repo, not a future multi-tenant/cloud deployment.
- SQLite is shown as a single datastore; files live under `server/data/uploads`.
- “External systems” groups SMTP, LINE, webhooks and the headless PDF browser because they share the same boundary: outbound I/O that can fail independently.

## Reading the HTML

- Click a flow tab, then `→`/`Space` to walk the steps.
- Click a node to jump to its first step.
- `O` cycles Dev/Prod, `T` toggles light/dark, `F` fullscreen, `R` resets dragged nodes.
- On a phone the canvas scrolls horizontally; the side panel stacks below it.
