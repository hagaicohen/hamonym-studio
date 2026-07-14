# Donors & Donations — Session Context

Summary of everything built in this session, for continuity in a new chat.

## Project Stack (recap)

- **Frontend**: Angular 17+ standalone components, signals, RxJS — this repo (`hamonym-app`)
- **Backend**: Node.js + Express 5 + PostgreSQL (`pg` pool) — sibling repo `hamonym-backend`
- **Git topology (important, discovered this session)**:
  - `hamonym-app` is its own git repo, remote `hagaicohen/hamonym-studio.git`
  - `hamonym-backend` has **no `.git` of its own** — its files are tracked via the parent folder `c:\DEV\HamonymStudio`, which is *also* a git repo pointing at the same remote
  - Inside that parent repo, `hamonym-app` shows up as an orphaned submodule-like gitlink (no `.gitmodules`) — harmless, just don't try to "update" it
  - **To push backend changes**: `cd c:\DEV\HamonymStudio` (not `hamonym-backend`)
  - **SSL issue on this machine**: normal `git push` fails with "unable to get local issuer certificate" — use `git -c http.sslVerify=false push` (workaround, not a permanent config change)

---

## What Was Built

### 1. Public campaign page — "Donors" block upgrade
File: `src/app/modules/campaigns/studio/preview/campaign-preview/campaign-preview.component.{ts,html,css}`

- Stats row: total raised / donor count / average (reuses existing `draft.currentAmount` / `supportersCount`, no extra request)
- Period filter tabs: הכל / השבוע / היום
- Per-row tags: "בעילום שם" (anonymous), "תרומה ראשונה" (first donation to this campaign)
- Top 10 donors leaderboard sidebar (all-time, independent of the period filter)
- **Intentionally NOT built**: "תרומה חודשית" (recurring donor) tag — no recurring-donation data model exists yet (would need a real schema change); a personal donor message field — `donations` table has no `message` column

Backend: `donations.service.js` → `getCampaignDonors(slug, period)` now accepts `period` (`all`/`today`/`week`), returns `is_anonymous`, `is_first` (matched via email→phone→id, computed over full history regardless of period filter so it's not skewed), and a `topDonors` array. Route/controller updated to pass `period` query param through.

### 2. Donations admin page — UX overhaul
File: `src/app/modules/donations/pages/donations-page/donations-page.component.{ts,html,css}`

- Sorting on all 5 columns (donor/campaign/amount/date/status), server-side (`sortBy`/`sortDir` query params, whitelisted SQL column map in the backend — no injection risk)
- Non-blocking refresh: `loading` (full skeleton) only on first load; `refreshing` (dims table, keeps rows mounted) on subsequent sort/filter/page changes — avoids the table "flashing" empty on every click
- CSV export (fetches up to 10k rows matching current filters/sort, not just the current page; UTF-8 BOM so Hebrew opens correctly in Excel)
- Column visibility toggle ("☰ עמודות" dropdown, checkboxes, persisted to `localStorage`) — קמפיין/תאריך/סטטוס are optional, תורם/סכום are fixed
- Rows-per-page selector (10/25/50)
- Mobile (`<600px`): secondary columns collapse (drawer still has full detail on row tap); filters stack full-width in a column instead of wrapping awkwardly
- Filters row: search + campaign + status all balanced to equal width (`flex: 1 1 160px` on all three), filling the full row

Backend: `donations.service.js` → `getEntityDonations` gained a `SORT_COLUMNS` whitelist map and `sortBy`/`sortDir` handling.

### 3. Donors admin page — brand new (`/donors` route)

**Root cause found**: the sidebar (`src/app/core/layout/sidebar/sidebar.component.ts`) already had a `/donors` nav item, but no matching route existed in `app.routes.ts` — it silently fell through to the `**` wildcard and redirected to `/login`. This is now fixed.

Files:
- `src/app/modules/donors/pages/donors-page/donors-page.component.{ts,html,css}` (new)
- `src/app/app.routes.ts` — added the `donors` route next to `donations`

Features: same design language as the donations page — KPI row (donor count, total raised, avg per donor), search, sortable table (name/total/count/last donation), pagination, row drawer, CSV export, column toggle, mobile collapse.

Backend: new `getEntityDonors(entityId, { search, sortBy, sortDir, page, limit })` in `donations.service.js` — groups raw donations by donor identity (`COALESCE(email, phone, name)`), returns per-donor total donated, donation count, campaigns touched, first/last donation dates, plus entity-wide KPIs. New route `GET /api/donations/entity/:id/donors` (+ controller).

**Known data quirk (not a bug, but worth knowing)**: when several different donor *names* share the same email/phone (e.g., dev testing with fake names but a real personal email), they collapse into a single donor row, and the displayed name is picked somewhat arbitrarily (`MAX()` over non-anonymous names in the group). Confirmed against real DB data — in this DB, of 13 total paid donations, only 2 are real (non-mock); the rest are dev test payments, all sharing the developer's own email under various fake names. Mock/test donations (`is_mock=true`) are currently **included** in the donors page (per explicit request — "show everything"), with a TEST badge; they're also still included in the Donations page KPI totals (never explicitly asked to exclude them there).

**Open question, not yet decided**: whether to change the merged-donor display from a single arbitrary name to something like "שם + עוד N" when a group contains multiple distinct names.

---

## Git Commits This Session

- `hamonym-app` (branch `feature/ambassadors-enhancement`), commit `2dac1a1`: frontend — donors page, donations page UX, campaign-preview donors block
- `HamonymStudio` parent repo (branch `main`), commit `6a8762d`: backend — donors aggregation endpoint, donations sort/filter

Both pushed to `origin`.

---

## Relevant File Paths

| File | Purpose |
|------|---------|
| `src/app/modules/donors/pages/donors-page/` | New admin donors CRM page |
| `src/app/modules/donations/pages/donations-page/` | Admin donations transaction table |
| `src/app/modules/campaigns/studio/preview/campaign-preview/campaign-preview.component.*` | Public campaign page, incl. donors block (`block.type === 'donors'`) |
| `src/app/modules/campaigns/services/donation.service.ts` | `Donor`, `TopDonor`, `DonorPeriod` types; `getDonors()` |
| `src/app/app.routes.ts` | Route definitions, incl. `/donors` |
| `src/app/core/layout/sidebar/sidebar.component.ts` | Nav items (already had `/donors` before the route existed) |
| `c:\DEV\HamonymStudio\hamonym-backend\src\modules\donations\donations.service.js` | All donations/donors SQL logic |
| `c:\DEV\HamonymStudio\hamonym-backend\src\modules\donations\donations.controller.js` / `donations.routes.js` | HTTP layer |
