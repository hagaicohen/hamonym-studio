# Super Admin — Session Context

Summary of everything built in this session, for continuity in a new chat, plus the plan for the next piece of work (**not yet implemented**).

## Project Stack (recap)

- **Frontend**: Angular 17+ standalone components, signals, RxJS — this repo (`hamonym-app`)
- **Backend**: Node.js + Express 5 + PostgreSQL (`pg` pool) — sibling repo `hamonym-backend`
- Same git topology as documented in `DONORS_DONATIONS_CONTEXT.md`/`AMBASSADORS_CONTEXT.md` (`hamonym-backend` has no `.git` of its own; push backend changes from `c:\DEV\HamonymStudio`, with `git -c http.sslVerify=false push`).

---

## Part 1 — What's already built this session

### 1. Super Admin MVP

A fourth user kind, **Super Admin** — a platform operator, not tied to any entity. Deliberately minimal: no roles table, no super-admin management UI. Two users get flagged manually in the DB.

- Migration `hamonym-backend/migrations/012_super_admin.sql`: `users.is_super_admin boolean NOT NULL DEFAULT false`, plus new table `platform_audit_log` (`id, super_admin_user_id bigint REFERENCES users(id), entity_id uuid REFERENCES entities(id), action text, notes text, created_at`). **Note:** `users.id` is `bigint`, `entities.id` is `uuid` — don't assume both are uuid (bit us once already).
- JWT payload and `req.user` gained `isSuperAdmin` (`hamonym-backend/src/routes/auth.routes.js`, `src/middleware/require-auth.js`). New `src/middleware/require-super-admin.js` (403 if `!req.user.isSuperAdmin`).
- New backend module `hamonym-backend/src/modules/platform/` (`platform.routes.js` / `.controller.js` / `.service.js`), mounted at `/api/platform` in `server.js`. All routes `requireAuth` + `requireSuperAdmin`. Endpoints: `GET /dashboard`, `GET /organizations`, `GET /organizations/:id`, `POST /organizations/:id/{approve,reject,request-changes,suspend,reactivate}`.
- **Load-bearing side effect**: `entities.status` now actually gates public campaign access — `campaigns.service.js`'s `getCampaignBySlugPublic` requires `e.status = 'active'`; `donations.service.js`'s `createDonation` throws `'Entity not approved'` otherwise. Before this it was purely cosmetic (see the unresolved issue in §3 — this gate currently protects a dead endpoint).
- Frontend: Super Admin is **additive** — `CurrentContextService.isSuperAdmin` (localStorage `isSuperAdmin`) is independent of the `RoleType`/role-switching system. `contextGuard` (`src/app/core/guards/context.guard.ts`) accepts `isSuperAdmin` as valid context. Sidebar (`src/app/core/layout/sidebar/`) shows a "פלטפורמה" section *alongside* (not replacing) the normal entity nav. New guard `superAdminGuard` (one-directional — blocks non-admins from `/platform/*`, never blocks admins from anything else). Routes: `/platform`, `/platform/organizations`, `/platform/organizations/:id`, all children of the existing `AppLayoutComponent` shell.
- **Dedicated `/admin` login entry point** (added after the additive model, per explicit later request): standalone page `src/app/modules/platform/pages/admin-login-page/`, no layout/guard, same `/auth/login` call. On success sets `isSuperAdmin` **and** a second flag `CurrentContextService.adminMode` (localStorage `adminMode`). While `adminMode` is true, the sidebar shows **only** the platform section (entity nav suppressed even for a super-admin-who-also-owns-an-org) and the topbar's role/context switcher (`src/app/core/layout/topbar/`) is replaced with a static "מנהל פלטפורמה" badge (no dropdown). Regular `/login` always calls `setAdminMode(false)`. `logout()` already does `localStorage.clear()`, wiping both flags.
- **Superseded later in the session — read this, not the paragraph above, for current behavior**: the "additive" model (super admin sees platform nav *alongside* normal nav even on a regular login) was explicitly reversed. Now: **platform UI/access is gated on `adminMode`, not `isSuperAdmin`.** A regular `/login` — even for an account with `is_super_admin = true` — shows zero platform-related UI and cannot reach `/platform/*`; only entering through `/admin` (which sets `adminMode`) unlocks it. Changed: `sidebar.component.ts`'s `platformNavItems` now checks `ctx.adminMode()` (was `ctx.isSuperAdmin()`); `super-admin.guard.ts` now checks `context.adminMode()` (was `isSuperAdmin()`); `context.guard.ts`'s shell-entry bypass now checks `localStorage.adminMode === 'true'` (was `isSuperAdmin`). The `isSuperAdmin` signal/flag itself still exists and is still set at login (harmless, used by `admin-login-page`'s auto-skip-to-`/platform` check when a token already exists) but no longer drives any nav/guard decision on its own.

### 2. Dashboard "control tower" upgrade

External design feedback pushed for a richer feel; user explicitly scoped it to **polishing the existing 3 pages only** (no global search/Ctrl+K, no 6 new platform-wide pages for Campaigns/Donations/Users/Ambassadors/Payments/Messages, no system/infra health monitoring — none of that infrastructure exists and wasn't asked for).

- `platform.service.js`'s `getKpis` → renamed `getDashboardData`, route `GET /kpis` → `GET /dashboard`. Returns `{ kpis, alerts, activity, charts }` in one call — all computed from existing tables, zero new schema:
  - `kpis`: 8 fields (entities/campaigns/donations counts + failed payments + new donors this month)
  - `alerts`: pending-review count, missing-docs count, cardcom-disconnected count, overdue-published-campaigns count — each with a `linkQuery` for deep-linking into the organizations page
  - `activity`: last ~20 events merged from `platform_audit_log` + recent campaigns + recent paid donations + recent user signups, sorted by timestamp
  - `charts`: `donationsDaily` (30d) / `entitiesWeekly` (8w), zero-filled via SQL `generate_series` + `LEFT JOIN` (deliberately not JS date math, to dodge timezone-alignment bugs)
- `getOrganizations` gained `profile_completion` (0–100, 5-point weighted SQL CASE: display_name/legal_name/association cert/tax doc/cardcom connected) and filters `missingDocs`/`noCampaigns`/`newSince` (days). Organizations page (`platform-organizations-page`): 6 mutually-exclusive quick-filter chips (ממתינות/פעילות/מושעות/חסרות מסמכים/ללא קמפיינים/חדשות השבוע) replaced the old status dropdown; Action Center alerts deep-link here via route query params read on init.
- `getOrganizationDetail` gained `donorCount` (distinct donor identities, paid donations only). Detail page (`platform-organization-detail-page`) gained a hero KPI row (total raised/donors/campaigns/success rate), a client-side Health Score (rollup of 5 checklist booleans, colored ring), and a Timeline merging entity-creation + campaign-creation + audit-log events chronologically (all client-side from data already fetched — no new query for the timeline itself).
- Charts are hand-rolled inline SVG (no charting library added, none was in `package.json`) — built per the `dataviz` skill's method: single-hue since each is a single series (no legend needed per that skill's rules), 2px line with rounded caps, ~10% opacity area fill, 4px rounded bar tops, lightweight hover tooltip + guide line.
- **Bug fixed along the way**: the original approval checklist compared `entity.cardcom_connection_status === 'connected'`, but the real DB value is `'success'` — that check always rendered as missing even when Cardcom was genuinely connected. Fixed via the new `healthChecks`/`healthScore` getters.
- **Angular gotcha hit and fixed**: a template-ref variable declared on an `<svg>` element (`#lineSvg`) types as `HTMLElement`, not `SVGSVGElement`, under Angular's ngtsc. `npx tsc --noEmit` does **not** catch this (it doesn't run the Angular template compiler) — only `npx ng build` does. Fixed by typing the handler param as `Element` (all it actually needs is `getBoundingClientRect()`). **Lesson: verify with a real `ng build`, not just `tsc --noEmit`, whenever a template ref targets a non-Angular/SVG element.**

### 3. Known unresolved issue (found, not yet fixed)

The real public campaign page (`campaigns/:slug/view`, `CampaignPublicPageComponent`) does **not** call the entity-approval-gated `GET /api/campaigns/public/:slug` — it calls `CampaignApiService.getBySlug()` → `GET /api/campaigns/slug/:slug`, which is `requireAuth` + ownership-gated (`campaigns.service.js`'s `getCampaignBySlug`, comment says "public preview for manager").

Consequences:
- The entity-approval gate built in §1 doesn't actually protect the real donor-facing flow yet — it protects a dead endpoint nobody calls.
- A genuinely anonymous visitor likely gets **401** today, since the frontend unconditionally sends `Authorization: Bearer ${localStorage.getItem('token')}` (a literal `"Bearer null"` string when logged out) via `CampaignApiService.headers()` (`campaign-api.service.ts:38-40`).

Agreed direction (**not yet implemented**): point the public page at the actual public endpoint. The org admin's own "preview my campaign while my entity is still unapproved" need is separately served by the already-authenticated studio builder preview (`campaign-studio-page` → `getCampaignById`), so no owner-bypass logic is needed on the public endpoint itself — keep it strictly public/approval-gated, no exceptions.

**Pick this up before assuming donations work for anonymous visitors in production.**

### Test entity used throughout

`קשת נחושה - ע"ר`, id `9fb88307-2999-459e-8d9c-42b53a82051c`, owner user id `9` (`hagai.cohen@gmail.com`). All smoke tests flipped `users.is_super_admin` / `entities.status` temporarily via one-off `node -e` scripts against the live DB and reverted them afterward — DB should be back to its original state (`is_super_admin=false`, entity `status='pending_review'`, no stray `platform_audit_log` rows from testing).

---

## Part 2 — Entity Approval Workflow (IMPLEMENTED — was "not yet" when this doc was first written, now done and verified)

Everything below was built exactly as planned and smoke-tested end-to-end (mandatory-note 400, request-changes with reason tags, owner-facing `approval-status` read, `request-review` transition success + 409-when-invalid + 403-for-non-owner). One addition beyond the original plan: `getOrganizationDetail`'s audit-log query also now selects `reason_tags` so the super-admin Timeline/Audit-Log tab can show them too.

### Context

Super Admin can already flip an entity's status (approve/reject/request-changes/suspend/reactivate) and leave a note, but that note only ever reaches other super admins (stored in `platform_audit_log`, exposed only via `/api/platform/*`). An organization admin whose entity is sent back for changes today sees nothing but a status-badge label ("נדרשים תיקונים") with zero explanation of what to fix, and no way to signal "I fixed it, please look again."

### State machine

**States** (`entities.status`, unchanged): `draft → pending_review → active`, with `pending_review → changes_requested/rejected` and `active → suspended` as exception branches.

| From | To | Trigger | Note required? |
|---|---|---|---|
| `pending_review` | `active` | Super Admin: Approve | optional |
| `pending_review` | `rejected` | Super Admin: Reject | **required** |
| `pending_review` | `changes_requested` | Super Admin: Request Changes | **required** |
| `changes_requested` | `pending_review` | **Org admin: Resubmit for review** (new) | none |
| `active` | `suspended` | Super Admin: Suspend | **required** |
| `suspended` | `active` | Super Admin: Reactivate | optional |

`rejected` stays terminal for now (no org-initiated way out) — a re-application flow is explicitly future work. `draft → pending_review` (initial submission) already exists via `is_profile_complete` in `createEntity`/onboarding and isn't touched by this plan.

### Scope

- **MVP**: persistent (non-dismissible) approval-status display for the org admin, mandatory notes on the three "bad news" transitions (reject/request-changes/suspend), a consolidated `approvalStatus` read endpoint designed to grow without breaking callers.
- **MVP+**: the org-initiated "Resubmit for review" transition, plus structured reason tags (checkboxes) alongside the free-text note — cheap now, valuable later for analytics on why entities bounce back.
- **Explicitly deferred**: timeline/history of comments for the org admin, email/SMS/push notifications, multiple-correction-round tracking, a rejected→resubmit path.

### Backend

**Migration `hamonym-backend/migrations/013_approval_reasons.sql`**
```sql
ALTER TABLE platform_audit_log ADD COLUMN IF NOT EXISTS reason_tags text[];
```
No other schema change — `approvalStatus` is assembled from the entity row + the latest `platform_audit_log` row for it, not a new table.

**`platform.controller.js`** (existing super-admin actions): add mandatory-note validation before calling the service, for `reject`/`requestChanges`/`suspend` only (`approve`/`reactivate` stay optional): `if (!req.body.notes?.trim()) return res.status(400).json({ error: 'נדרשת הערה' })`. Pass through `req.body.reasonTags` (array) for those three actions.

**`platform.service.js`**: `setStatus(...)` gains a `reasonTags` param, included in the `INSERT INTO platform_audit_log (..., reason_tags)`.

**New entity-facing endpoints — `hamonym-backend/src/modules/entities/`** (same pattern as `updateEntity`: ownership check via `user_entities`, `entities.routes.js` → `.controller.js` → `.service.js`):

- **`GET /api/entities/:id/approval-status`** (`requireAuth`) → `getApprovalStatus(entityId, userId)`:
  - ownership check (copy `updateEntity`'s `SELECT 1 FROM user_entities WHERE user_id = $1 AND entity_id = $2` pattern, throw `'Unauthorized'` on failure)
  - `SELECT status, updated_at FROM entities WHERE id = $1`
  - `SELECT action, notes, reason_tags, created_at, u.full_name AS actor_name FROM platform_audit_log a JOIN users u ON u.id = a.super_admin_user_id WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 1`
  - returns `{ status, updatedAt: auditRow?.created_at ?? entity.updated_at, comment: auditRow?.notes ?? null, reasonTags: auditRow?.reason_tags ?? [], actionBy: auditRow?.actor_name ?? null }`

- **`PATCH /api/entities/:id/request-review`** (`requireAuth`) → `requestReview(entityId, userId)`:
  - same ownership check
  - `UPDATE entities SET status = 'pending_review', updated_at = NOW() WHERE id = $1 AND status = 'changes_requested' RETURNING *` — the `AND status = 'changes_requested'` clause *is* the transition guard (0 rows back = invalid transition)
  - if no row returned, throw `'Invalid transition'`

`entities.controller.js` gets two thin handlers mapping `'Unauthorized'` → 403, `'Invalid transition'` → 409. Routes added to `entities.routes.js`, both behind `requireAuth`.

### Frontend

- **`src/app/shared/constants/approval-reason-tags.ts`** (new, shared): the 5 predefined reason keys + Hebrew labels (מסמכים חסרים / מסמכים לא קריאים / פרטי עמותה שגויים / בעיית סליקה / אחר) — single source of truth for both sides.
- **`EntitiesService`**: add `getApprovalStatus(entityId)`, `requestReview(entityId)`.
- **New `ApprovalStatusCardComponent`** (`src/app/modules/settings/components/approval-status-card/`) — a persistent card (not a dismissible banner), fetches its own data given an `[entityId]` input. Shows status icon/label, reason tags + free-text comment + actionBy/when when present, and a "שלח לבדיקה מחדש" CTA only when `status === 'changes_requested'`. Dropped into **both** `entity-settings.component.html` and `dashboard.component.html` (entity-manager dashboard) — same component, two call sites.
- **Super-admin side** (`platform-organization-detail-page`): notes `<textarea>` becomes required (button disabled without it) for Reject/Request-Changes/Suspend only; add reason-tag checkboxes above it for those three actions. `PlatformService`'s `reject`/`requestChanges`/`suspend` gain a `reasonTags?: string[]` param.

### Verification

- Backend smoke test (temp super-admin token + the test entity above): request-changes with reason tags + note → confirm `platform_audit_log.reason_tags` populated. Hit `GET /api/entities/:id/approval-status` **as the entity owner** and confirm it returns comment/tags/actionBy. Hit `PATCH /api/entities/:id/request-review` — 409 when status isn't `changes_requested`, success (→`pending_review`) when it is. Confirm a non-owner gets 403 on both new endpoints.
- `npx tsc --noEmit` **and** `npx ng build` both clean.
- Visual: as the test org's owner, load `/settings` and the dashboard, confirm the persistent card renders correctly and the resubmit button only appears/works in `changes_requested`; as super admin, confirm the reason-tag checkboxes + required-note validation on the three gated actions.
