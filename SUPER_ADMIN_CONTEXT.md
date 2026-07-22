# Super Admin — Session Context

Full summary of the Super Admin feature arc built in this session, for continuity in a new chat. Everything described here is implemented, smoke-tested against the real DB, and pushed.

## Project Stack (recap)

- **Frontend**: Angular 17+ standalone components, signals, RxJS — this repo (`hamonym-app`)
- **Backend**: Node.js + Express 5 + PostgreSQL (`pg` pool) — sibling repo `hamonym-backend`
- **Git topology** (same as documented in `DONORS_DONATIONS_CONTEXT.md`/`AMBASSADORS_CONTEXT.md`, reconfirmed this session): `hamonym-app` and the parent `c:\DEV\HamonymStudio` repo (which contains `hamonym-backend`) **push to the same remote/branch** (`hagaicohen/hamonym-studio.git`, `main`) — they are not independent. Pushing from one advances `origin/main` out from under the other. If a push is rejected with "fetch first," that's why — just `git fetch && git rebase origin/main && git push` (they touch disjoint files, so this is always a clean rebase, never a real conflict). Use `git -c http.sslVerify=false push` on this machine (local SSL cert issue, not a permanent config change).

---

## 1. Super Admin MVP

A fourth user kind, **Super Admin** — a platform operator, not tied to any entity. Deliberately minimal: one boolean flag, no roles table, no super-admin management UI. Two users get flagged manually in the DB.

- Migration `hamonym-backend/migrations/012_super_admin.sql`: `users.is_super_admin boolean NOT NULL DEFAULT false`, plus new table `platform_audit_log` (`id, super_admin_user_id bigint REFERENCES users(id), entity_id uuid REFERENCES entities(id), action text, notes text, reason_tags text[], created_at`). **Note:** `users.id` is `bigint`, `entities.id` is `uuid` — don't assume both are uuid.
- JWT payload and `req.user` carry `isSuperAdmin` (`hamonym-backend/src/routes/auth.routes.js`, `src/middleware/require-auth.js`). `src/middleware/require-super-admin.js` gates on it (403 otherwise).
- Backend module `hamonym-backend/src/modules/platform/` mounted at `/api/platform`, all routes `requireAuth` + `requireSuperAdmin`: `GET /dashboard`, `GET /organizations`, `GET /organizations/:id`, `POST /organizations/:id/{approve,reject,request-changes,suspend,reactivate}`.
- **`entities.status` actually gates public campaign access** — `campaigns.service.js`'s `getCampaignBySlugPublic` requires `e.status='active'`; `donations.service.js`'s `createDonation` throws `'Entity not approved'` otherwise. (See §4 — this currently protects an endpoint the frontend doesn't call yet.)

### How platform access actually works today (final behavior — earlier "additive" design was reversed)

**Platform UI/access is gated on `adminMode`, not `isSuperAdmin`.** A regular `/login` — even for an account with `is_super_admin=true` — shows **zero** platform-related UI and cannot reach `/platform/*`. Only the dedicated `/admin` login page (`src/app/modules/platform/pages/admin-login-page/`) sets `CurrentContextService.adminMode` (localStorage `adminMode`), and only that unlocks it:
- `sidebar.component.ts`'s `platformNavItems` renders only when `ctx.adminMode()`.
- `super-admin.guard.ts` blocks `/platform/*` unless `context.adminMode()`.
- `context.guard.ts`'s shell-entry bypass (letting a context-less user into `AppLayoutComponent`) checks `localStorage.adminMode === 'true'`.
- While `adminMode` is true, the topbar's role/context switcher is replaced with a static "מנהל פלטפורמה" badge (no dropdown), and the sidebar shows **only** the platform section (entity nav suppressed even if the account also owns an org).
- Regular `/login` always calls `setAdminMode(false)`; `logout()` does `localStorage.clear()`, wiping everything.
- The `isSuperAdmin` signal/flag still exists and is still set at every login (harmless) — it's only read by `admin-login-page`'s auto-skip logic (if a token + `isSuperAdmin=true` already exist when landing on `/admin`, skip straight to `/platform`). It does **not** drive any nav/guard decision by itself anymore.

---

## 2. Dashboard "control tower" upgrade

Scoped explicitly to **polishing the existing 3 pages only** — no global search/Ctrl+K, no new platform-wide pages, no system/infra health monitoring (none of that exists and wasn't asked for).

- `platform.service.js`'s `getDashboardData` (route `GET /dashboard`) returns `{ kpis, alerts, activity, charts }` in one call, all computed from existing tables:
  - `kpis`: entities/campaigns/donations counts + failed payments + new donors this month
  - `alerts`: pending-review / missing-docs / cardcom-disconnected / overdue-published-campaigns counts, each with a `linkQuery` for deep-linking into the organizations page
  - `activity`: last ~20 events merged from `platform_audit_log` + recent campaigns + recent paid donations + recent user signups
  - `charts`: `donationsDaily` (30d) / `entitiesWeekly` (8w), zero-filled via SQL `generate_series` + `LEFT JOIN` (deliberately not JS date math)
- `getOrganizations` has `profile_completion` (0–100, 5-point weighted SQL CASE) and filters `missingDocs`/`noCampaigns`/`newSince`. Organizations page: 6 mutually-exclusive quick-filter chips replaced the status dropdown.
- `getOrganizationDetail` has `donorCount`. Detail page has a hero KPI row, a client-side Health Score (rollup of 5 checklist booleans), and a Timeline merging entity-creation + campaign-creation + audit-log events.
- Charts are hand-rolled inline SVG (no charting library in `package.json`) — built per the `dataviz` skill's method (single-hue single-series, no legend, 2px rounded line, 4px rounded bar tops, hover tooltip).
- **Bug fixed**: the approval checklist used to compare `cardcom_connection_status === 'connected'`; the real DB value is `'success'`. Fixed via `healthChecks`/`healthScore` getters.
- **Angular gotcha**: a template-ref on an `<svg>` (`#lineSvg`) types as `HTMLElement` under ngtsc, not `SVGSVGElement` — `npx tsc --noEmit` doesn't catch this (no template compilation), only `npx ng build` does. Fixed by typing the handler param as `Element`. **Always verify with a real `ng build`, not just `tsc --noEmit`, when a template ref targets an SVG/non-Angular element.**

---

## 3. Entity Approval Workflow

A real state machine, not just a UI tweak.

**States** (`entities.status`, unchanged): `draft → pending_review → active`, with `pending_review → changes_requested/rejected` and `active → suspended` as exception branches.

| From | To | Trigger | Note required? |
|---|---|---|---|
| `pending_review` | `active` | Super Admin: Approve | optional |
| `pending_review` | `rejected` | Super Admin: Reject | **required** |
| `pending_review` | `changes_requested` | Super Admin: Request Changes | **required** |
| `changes_requested` | `pending_review` | **Org admin: Resubmit for review** | none |
| `active` | `suspended` | Super Admin: Suspend | **required** |
| `suspended` | `active` | Super Admin: Reactivate | optional |

`rejected` is terminal (no org-initiated way out — future work). `draft → pending_review` (initial submission) predates this and isn't touched.

- Migration `013_approval_reasons.sql`: `platform_audit_log.reason_tags text[]`.
- Mandatory-note validation (400) on `reject`/`request-changes`/`suspend` only, in `platform.controller.js`.
- Two new **entity-facing** endpoints (`hamonym-backend/src/modules/entities/`, ownership-checked like `updateEntity`):
  - `GET /api/entities/:id/approval-status` → `{ status, updatedAt, comment, reasonTags, actionBy }`, assembled from the entity row + the latest `platform_audit_log` row (no new table).
  - `PATCH /api/entities/:id/request-review` → flips `changes_requested → pending_review`; the guard **is** the SQL `WHERE status='changes_requested'` (0 rows back = 409 `'Invalid transition'`).
- Frontend: persistent (non-dismissible) `ApprovalStatusCardComponent` (`src/app/modules/settings/components/approval-status-card/`), embedded in **both** `entity-settings` and the entity-manager `dashboard`. Shows status + reason tags + comment + who/when, and a "שלח לבדיקה מחדש" button only when `changes_requested`.
- Super-admin action panel (`platform-organization-detail-page`) has reason-tag checkboxes (shared constants in `src/app/shared/config/approval-reason-tags.ts`) and required-note validation on the three gated actions.
- **How the org admin actually finds out**: only by visiting their own dashboard/settings (no email/SMS/push — explicitly deferred). It's pull, not push.

All of the above was smoke-tested end-to-end: mandatory-note 400, request-changes with tags, owner-facing read (200), non-owner (403), invalid transition (409), valid transition (200 → `pending_review`).

---

## 4. Known unresolved issue (found, NOT fixed — pick this up next)

The real public campaign page (`campaigns/:slug/view`, `CampaignPublicPageComponent`) does **not** call the entity-approval-gated `GET /api/campaigns/public/:slug`. It calls `CampaignApiService.getBySlug()` → `GET /api/campaigns/slug/:slug`, which is `requireAuth` + ownership-gated (`campaigns.service.js`'s `getCampaignBySlug`, comment says "public preview for manager").

Consequences:
- The entity-approval gate built in §1 doesn't protect the real donor-facing flow — it protects a dead endpoint nobody calls.
- A genuinely anonymous visitor likely gets **401**, since the frontend unconditionally sends `Authorization: Bearer ${localStorage.getItem('token')}` (literal `"Bearer null"` when logged out) via `CampaignApiService.headers()` (`campaign-api.service.ts:38-40`).

Agreed direction (not implemented): point the public page at the actual public endpoint. The org admin's own "preview while unapproved" need is separately served by the already-authenticated studio builder preview — no owner-bypass logic needed on the public endpoint itself.

**Don't assume donations work for anonymous visitors until this is fixed.**

---

## 5. Bug fixed this session: document uploads weren't persisting

Reported symptom: org admin uploads association certificate / tax document via the entity settings page; a health check elsewhere still says they're missing.

Root cause: `entity-basic-info-section-edit.component.ts`'s `onAssociationCertificateSelected`/`onTaxDocumentSelected` only stash the raw `File` + filename locally (for an immediate preview) — they never call the real upload endpoint. `entity-settings.component.ts`'s `saveAll()` had real-endpoint logic for **removing** a document (`removeAssociationDocument`/`removeTaxDocument`) but nothing for **uploading/replacing** one — a new file just rode along in the generic `updateEntity()` JSON PATCH, whose backend SQL whitelist doesn't reference document columns at all and silently drops them.

Fix: `saveAll()` now checks for a `File` instance on `draftEntity.association_certificate_file`/`tax_document_file` and calls `uploadAssociationDocument`/`uploadTaxDocument` (the real multipart endpoints, already correctly used elsewhere) before proceeding, then clears the `File` reference so it isn't resent on a later unrelated save.

**Anyone who "uploaded" a document before this fix lost it** — it only ever existed as an in-memory File object, never reached the server. They need to re-upload now that it's fixed.

(Separately noted, not fixed: the organization-registration wizard writes throwaway `blob:` URLs into `association_certificate_url`/`tax_document_url` at entity-creation time, before the real upload call completes later in that same flow — harmless today since that real call is correctly wired there, but stale `blob:` values were observed sitting in those `_url` columns in the DB. The health-check logic correctly ignores `_url` and checks `_name` instead, so this hasn't caused a visible bug, just dead data worth knowing about.)

---

## 6. Reapproval flag — an approved entity can silently drift from what was reviewed

The approval workflow in §3 only covers the `pending_review → active` transition. Nothing watched an entity **after** it became `active` — an org admin could remove their association certificate, change their registration number, or swap Cardcom credentials, and the admin who approved them would never know; `status` just stayed `active` forever.

- Migration `hamonym-backend/migrations/028_entity_flagged_for_review.sql`: `entities.flagged_for_review boolean DEFAULT false`, `flagged_for_review_reason text`, `flagged_for_review_at timestamptz`.
- `entities.service.js`: `computeReapprovalFlag()` (used by `updateEntity`) and `flagForReviewIfActive()` (used by the document upload/remove endpoints) both only act when the entity's current `status = 'active'`. Sensitive fields: `registration_number`, the three `cardcom_*` credential columns, `billing_method`, and association/tax document presence. Flag only ever flips to `true` here — it never clears itself.
- `platform.service.js`'s `setStatus()` (backs approve/reject/request-changes/suspend/reactivate) clears the flag whenever the target status is `'active'` — i.e. Approve and Reactivate both double as "I reviewed this again, it's fine now."
- Surfaced to the admin four ways: notification bell (new count, polls same as pending/incomplete), dashboard alert card, a filter chip + row badge on the organizations list, and a banner on the entity detail page with the exact reason + timestamp.
- **Proactive email alert**: every user with `is_super_admin=true` or `'organizations'` in `platform_permissions` gets emailed on the false→true transition only (not re-sent on further edits while still flagged, only again after a fresh approval and a new flag). Template: `hamonym-backend/src/modules/email/templates/entity-flagged-for-review.js`.
- **New: a real email provider.** Nothing in this app sent real email before — `EMAIL_PROVIDER` was always `stub` (console.log only). Added `providers/resend.provider.js`; set `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` in `.env` to activate. **Not yet activated** — waiting on the user to verify a sending domain in Resend's dashboard and hand over an API key. `EMAIL_ENABLED` also still needs to flip to `true`, which affects *all* email types (receipts, password reset, admin invites), not just this alert.
- Verified end-to-end against the live DB with throwaway test entities/users (created + cleaned up via one-off scripts, not left in the DB): sensitive-field diffing, admin-approve clearing, document-removal flagging, non-active entities never flagged, exactly-one email per flag cycle. Caught and fixed a real Postgres "inconsistent types deduced for parameter" bug in the clearing query along the way (same `$1` reused as both a column value and a string-literal comparison — fixed by passing a plain JS boolean instead of re-deriving it in SQL).

### Actions panel UX redesign (same page, unrelated to the flag itself)

User testing found the existing approve/reject/request-changes/suspend panel (reason-tag checkboxes + note textarea + 5 buttons in a row) confusing — unclear ordering, unclear which action requires a note, and "ניתוח עמותה" (AI recommendation) sat in the same button row as the real decisions despite not being one. Redesigned as three numbered steps (סיבה → הערה → פעולה), buttons grouped by whether a note is required, and the AI tool pulled into its own outlined "assist" button above the decision panel.

---

## Test entity used throughout

`קשת נחושה - ע"ר`, id `9fb88307-2999-459e-8d9c-42b53a82051c`, owner user id `9` (`hagai.cohen@gmail.com`). All smoke tests flipped `users.is_super_admin`/`entities.status` temporarily via one-off `node -e` scripts against the live DB and reverted afterward — DB should be at its natural state (`is_super_admin=false`, entity `status='pending_review'`, no stray `platform_audit_log` test rows).

## Git state

Both repos pushed to `main` this session (frontend `hamonym-app`, backend via parent `HamonymStudio` — remember they share one remote, see topology note above):
- Super Admin MVP + dashboard + entity approval workflow (frontend `9b6e8ae`, backend `8c24833`)
- Document upload fix (frontend `0add6dc`)
- Reapproval flag + actions panel UX (frontend `8c6552b`; backend `544239d` flag, `ef81d52` Resend provider + email, pushed to `feature/approval-agent-skeleton`, **not** `main` — see `SESSION_2026-07-22_CONTEXT.md` for why the backend branch differs from `main` this round)
