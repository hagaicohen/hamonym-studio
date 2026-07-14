# Ambassadors — Session Context

Summary of what was built in this session, for continuity in a new chat.
Replaces the old version of this file, which described a feature that
didn't exist yet — it turned out the ambassador feature was already
fully built in an earlier, never-committed session. This session found
that, fixed a data bug in it, added the missing entity-wide admin page,
and pushed everything that had been sitting uncommitted.

## Project Stack (recap)

- **Frontend**: Angular 17+ standalone components, signals, RxJS — this repo (`hamonym-app`)
- **Backend**: Node.js + Express 5 + PostgreSQL (`pg` pool) — sibling repo `hamonym-backend`
- Same git topology as documented in `DONORS_DONATIONS_CONTEXT.md` (`hamonym-backend` has no `.git` of its own; push backend changes from `c:\DEV\HamonymStudio`, with `git -c http.sslVerify=false push`).

---

## What Already Existed (built in an earlier, uncommitted session)

- Table `campaign_ambassadors` (migration `004_ambassadors.sql`, plus `010_ambassador_deactivation.sql` for audit columns) — full_name, phone, email, goal_amount, status (active/inactive/pending), personal_message, personal_title, slug, deactivated_at/by.
- Table `ambassador_adjustments` — manual (cash/cheque) fundraising adjustments per ambassador.
- `donations.ambassador_id` — links a donation to the ambassador whose referral link it came through.
- Backend: `hamonym-backend/src/modules/ambassadors/` — full CRUD, bulk import, self-registration, public leaderboard, per-slug lookup.
- Frontend: `AmbassadorService` (`src/app/modules/campaigns/services/ambassador.service.ts`), per-campaign management page (`/campaigns/:id/ambassadors`), the ambassador's own portal (`/campaigns/:id/ambassador-studio`), and the public referral URL pattern `/campaigns/:slug/:ambassadorSlug`.
- Sidebar already had a "שגרירים" nav item pointing at `/ambassadors` — but the route didn't exist (same bug pattern found and fixed for `/donors` last session).

None of this was committed to git before this session — it existed only in the working tree (see "What Was Uncommitted" below).

## What Was Built/Fixed This Session

### 1. Bug fix — raised amounts were always 0
`ambassadors.service.js`'s `STATS_SQL` filtered on `donations.status = 'completed'`. The real enum is `pending/paid/failed` (per `CLAUDE.md`, confirmed in `donations.service.js` and `dashboard.service.js`). Fixed all three occurrences to `'paid'`.

### 2. New entity-wide ambassadors admin page (`/ambassadors`)
Same UX language as `/donations` and `/donors`:
- `src/app/modules/ambassadors/pages/ambassadors-page/ambassadors-page.component.{ts,html,css}`
- KPI row (total ambassadors, active, total raised, total donors), search, campaign filter, status filter, sortable table (name/campaign/goal/raised/donors/status), pagination, CSV export, column visibility toggle (localStorage-persisted), mobile collapse, row drawer with full detail incl. a copyable referral link (`{origin}/campaigns/{campaign_slug}/{slug}`).
- Route added in `app.routes.ts` next to `/donors`.

Backend: `getEntityAmbassadors(entityId, { search, status, campaignId, sortBy, sortDir, page, limit })` in `ambassadors.service.js`, new controller `listForEntity`, new route `GET /api/entities/:id/ambassadors` (requireAuth only, same trust model as the existing `/api/donations/entity/:id` endpoints — no explicit ownership check beyond auth).

### 3. Committed the backlog of uncommitted backend work
The parent repo (`c:\DEV\HamonymStudio`, branch `main`) had several sessions' worth of finished-but-uncommitted work sitting in the tree. Per explicit instruction, all of it was committed and pushed this session, in separate commits:
- Ambassadors endpoint + bug fix + migration 004 + `server.js` route mounting (`ambassadorsRoutes`/`dashboardRoutes` — these were already wired locally, just never committed).
- An unrelated finished feature: `DELETE /api/entities/:id/association-document`.
- Migrations 005–008 (donations tracking columns, campaign `is_hidden`, campaign show/logo flags, campaign logo position) — schema was already live in the DB, files were never checked in.
- Dev scripts (`scripts/diag-ambassador.js`, `scripts/migrate-005.js`) and a new `hamonym-backend/CLAUDE.md`.

**Worth knowing**: this means there may still be more uncommitted state floating around in `hamonym-backend` from even earlier sessions that wasn't touched this time (only what `git status` showed at the start of this session was committed).

---

## Verification Done

- Called `getEntityAmbassadors` directly against the real (Supabase) DB.
- Hit `GET /api/entities/:id/ambassadors` over HTTP with a manually-minted JWT.
- Installed Playwright + Chromium locally (not committed — `--no-save`), injected a valid session into `localStorage` (`token`, `currentEntity`, `currentRole`, `currentContext_v1`), and screenshotted the live page: KPI row, table, and drawer all render correctly with real data, zero console errors.

## Known Data Quirk

One ambassador's `slug` is the literal Hebrew name (`חגי-כהן`) instead of a transliterated slug (e.g. `mshh-khn` for others) — pre-existing data from before/around when `nameToSlug` transliteration was added. Not fixed (out of scope, and renaming a live slug could break an already-shared referral link).

---

## Relevant File Paths

| File | Purpose |
|------|---------|
| `src/app/modules/ambassadors/pages/ambassadors-page/` | New entity-wide admin page |
| `src/app/modules/campaigns/services/ambassador.service.ts` | Per-campaign CRUD service (pre-existing) |
| `src/app/modules/campaigns/pages/campaign-ambassadors-page/` | Per-campaign management page (pre-existing) |
| `src/app/modules/campaigns/pages/ambassador-studio-page/` | Ambassador's own portal (pre-existing) |
| `src/app/app.routes.ts` | Route definitions, incl. `/ambassadors` |
| `c:\DEV\HamonymStudio\hamonym-backend\src\modules\ambassadors\ambassadors.service.js` | All ambassador SQL logic, incl. new `getEntityAmbassadors` |
| `c:\DEV\HamonymStudio\hamonym-backend\migrations\004_ambassadors.sql` / `010_ambassador_deactivation.sql` | Schema |
