# Session Summary — 2026-07-12

Everything done today, across several threads. For deep detail on the Approval Agent specifically, see [`APPROVAL_AGENT_CONTEXT.md`](APPROVAL_AGENT_CONTEXT.md) — this doc covers the full day, including the performance-investigation work that doc doesn't.

**Git status**: all backend/agent work is on branch `feature/approval-agent-skeleton`, **not committed**. The tsconfig/dead-import fixes and the entity-hide bugfix (items 1–2 below) were committed and pushed earlier in the day, on `main`.

---

## 1. Entity hide/unhide bug (fixed, committed, pushed)

**Report**: hiding an entity then unhiding it left its campaigns permanently hidden.

**Root cause**: `entities.service.js`'s `setEntityVisibility` cascaded `is_hidden=true` to all campaigns on hide, but unhide never reversed it — and blindly reversing it would risk un-hiding a campaign that had been hidden independently before the entity was hidden.

**Fix**: migration `022_campaign_hidden_by_entity_cascade.sql` adds `campaigns.hidden_by_entity_cascade`. Hide only flags campaigns that were visible at that moment; unhide restores exactly those. Manual per-campaign hide/unhide (`campaigns.service.js`) now clears the flag, so an explicit action always overrides the cascade bookkeeping. Also manually repaired the 4 campaigns already stuck from before the fix existed.

## 2. TypeScript diagnostics cleanup (fixed, committed, pushed)

- `hamonym-app/tsconfig.json`: added `rootDir: "./src"` (TS6 migration warning).
- Removed genuinely-dead imports (`TextStyleEditorComponent`, `ColorPickerComponent`, `LoadingOverlayComponent`) — each only referenced inside commented-out template markup.
- **Bigger finding**: `C:\DEV\HamonymStudio\` (parent repo root) has a full **duplicate, uninstallable copy** of the Angular app (`src/`, `angular.json`, `tsconfig*.json`, `package.json`, 327 files, no `node_modules`) sitting alongside the real `hamonym-app/`. VSCode's TS server was picking up the root `tsconfig.json` and its default `**/*` scan was wandering into `hamonym-app/src/**`, causing "not under rootDir" errors. Fixed by adding `"exclude": ["hamonym-app", "hamonym-backend", "node_modules", "dist"]` to the root `tsconfig.json`. **Open question, not resolved**: is that root-level duplicate intentional or leftover cruft from the repo reorganization? Flagged to the user, not deleted.

## 3. Network latency investigation (earlier in the day, before this doc's visible window)

Diagnosed intermittent 8–38s request latency as genuine ISP-side network congestion/bufferbloat (tracert/pathping/continuous ping all showed the jump happening at the very first hop past the home router, with high jitter but 0% packet loss — the classic bufferbloat signature) — **not a code bug**. This conclusion mattered because it meant later "slow request" reports needed real per-query evidence before blaming the network again — which is exactly what caught the real bugs in §4 below.

## 4. The real performance bugs (fixed, verified with real before/after numbers)

Repeated pattern, found **four separate times** by tracing/timing actual queries instead of assuming it was all network jitter:

| Where | Symptom | Root cause | Fix | Before → After |
|---|---|---|---|---|
| `entities.service.js` `getEntityById` (entity detail page) | 27.6s for one query while 5 sibling queries took ~2s each | `SELECT e.*` pulled 4 bytea blob columns (PDFs/logo) over the wire; `stripBlobs()` only deleted them from the JS object *after* the full transfer | Explicit column list, blobs never selected | 27.6s → 2.1s |
| `entities.service.js` `getMyEntities` (`/api/entities/my`) | 20s+ | Same `SELECT e.*` pattern, separate function | Same fix | 20s+ → 0.33s |
| `entities.service.js` `updateEntity` (entity settings save) | Not measured directly, but same `RETURNING *` pattern on every save | Same | Explicit `RETURNING` column list | — |
| `entities.service.js` `requestReview` | Same `RETURNING *` pattern, rare action | Same | Same | — |
| `entities.service.js` `getAssociationDocument`/`getTaxDocument` reused by the Approval Agent's `DocumentTool` | 24s for one tool while siblings took ~2s (caught live by the new Tracing, see `APPROVAL_AGENT_CONTEXT.md` §3b) | Same pattern — pulled full PDF bytes just to compute a `hasData` boolean | Added metadata-only variants `getAssociationDocumentMeta`/`getTaxDocumentMeta` (`(..._data IS NOT NULL) AS has_data`); real download routes untouched | 24s → 2.1s |

**Separately, a real (non-blob) bug**: `platform.service.js`'s `getOrganizationDetail` fired 11 DB queries in one `Promise.all`, including two sub-services (`getEntityAmbassadors`, `getEntityDonations`) that each internally fan out 3 queries — 2 of those sub-queries (KPI + campaign-dropdown data) were fetched and then completely discarded, never used by this page. Added lean `getEntityAmbassadorsList`/`getEntityDonationsSummary` (11 → 7 queries, `donorCount` folded into the existing aggregate scan instead of its own query).

**Connection pool exhaustion**: separately, `getOrganizationDetail`'s 9-query fan-out (before the 7-query fix) triggered a real Supabase error — `EMAXCONNSESSION: max clients reached in session mode, max clients are limited to pool_size: 15`. Root cause: the app was on Supabase's **session-mode pooler** (port 5432, hard-capped at 15 total concurrent sessions for the whole project), not the **transaction-mode pooler** (port 6543, designed for exactly this many-short-queries pattern). Switched `DB_PORT` 5432 → 6543 in `.env`. Verified no code relies on session-scoped SQL (`PREPARE`, `SET SESSION`, temp tables, advisory locks, `LISTEN`/`NOTIFY`) that would break under transaction pooling.

**Login flow**: mapped and timed every step (`SELECT user` → `bcrypt.compare` → 3 independent post-auth queries → `jwt.sign`). No single catastrophic bug here, but two real fixes: (1) the 3 independent post-auth queries (`update last_login_at`, link guest donations, check `user_entities`) ran sequentially — parallelized via `Promise.all` in both `/auth/login` and `/auth/google`; (2) added a missing index, `idx_donations_donor_email_lower` (migration `023`) — the guest-donation-linking query runs on *every* login/register with no supporting index on `LOWER(donor_email)`.

## 5. Server-side observability

- Added a one-line request logger to `server.js` (`METHOD /path -> status (Nms)`) — was requested explicitly ("let me see the server responding in the terminal").
- **Infra note**: while debugging, found that running the backend via `npm run dev` (nodemon) was silently dropping/delaying `console.log` output through to the captured terminal file, across multiple restart cycles — not a code bug, a stdio-piping quirk through nodemon → node child process layers. Currently running the server via `node src/server.js` directly (bypassing nodemon) as a workaround — **this means it no longer auto-restarts on file save**; a manual restart is needed after backend code changes until this is revisited.

## 6. Approval Agent (full build-out — see `APPROVAL_AGENT_CONTEXT.md` for complete detail)

Built in stages per explicit, deliberately-staged direction (Agent → Tools → Prompt → LLM → [later] UI → RAG):

- `ApprovalAgent.analyze(entityId)` — gathers `ApprovalContext` from 5 tools (Entity, GuideStar, WebSearch, Document, Campaigns), fully typed via JSDoc (`approval.types.js`, no TS in this backend).
- `ApprovalAgent.recommend(entityId)` — `analyze()` → `buildApprovalPrompt()` (separate file, no LLM knowledge) → `llm.service.js` (OpenAI `gpt-4o-mini`, JSON mode) → `ApprovalRecommendation { summary, confidence, recommendation }`. **Verified against the real OpenAI API.**
- **Tracing** (`trace.util.js`): per-step timing + result metadata (`documents: 2, uploaded: 2`, `status: found`, `confidence: 60`, etc.), not just duration. Already paid for itself once (caught the DocumentTool blob bug above).
- **GuideStar — real integration, not a stub**: `guidestar.service.js` wraps `guidestar.org.il`'s Salesforce-backed REST API (login with the user's real credentials → bearer token → org lookup by registration number). Verified both the found path (real org data: ניהול תקין, סעיף 46, founding year, etc.) and the not-found path (our test entity genuinely isn't in their registry) — the LLM correctly factored a GuideStar miss into a lower confidence score.
- **Normalizer / Fact Builder** (`approval.facts.js`), added between `ApprovalContext` and the prompt builder: `ApprovalContext → Normalizer → ApprovalFacts (16 flat fields) → PromptBuilder → LLM`. The prompt builder no longer touches GuideStar's/Entity's/Documents' raw shapes at all — only uniform booleans/counts the code already verified (`nihulTakin`, `approval46`, `campaignsCount`, ...). Prompt size dropped 858 → 377 chars. Traced like every other step (`✓ Normalizer (0ms) — facts: 16`).
- Along the way, corrected two mistaken claims (mine and a relayed one from another chat): the Prompt Builder was **already** properly separated from the LLM call (verified from actual code, not assumed); and GuideStar was **genuinely** a stub with zero real integration anywhere in the codebase (verified via repo-wide grep across both repos and both `.env` files) until built for real today.
- **Explicitly not done**: `recommend()` is not wired to any UI yet — the existing "ניתוח עמותה" button still calls the older `/analyze` endpoint (Context only, `console.log`, no LLM). Known architectural debt (two parallel product surfaces, `analyze()` vs `recommend()`) is documented but deliberately not fixed — was gated on GuideStar being real, which it now is, so this is the natural next step.
- No RAG, no MCP, no multi-agent — explicitly deferred.

**New dependencies this session**: `openai` npm package only (explicitly authorized). GuideStar needed none — plain `fetch` (Node 18+ built-in).

**New `.env` vars**: `OPENAI_API_KEY`, `GUIDESTAR_BASE_URL`, `GUIDESTAR_USERNAME`, `GUIDESTAR_PASSWORD` — all in `hamonym-backend/.env`, confirmed gitignored via the parent repo's `.gitignore`.

## 7. Google OAuth login — diagnosed, not fixed (external config, not code)

`Error 400: origin_mismatch` on Google Sign-In. Root cause: `http://localhost:4200` isn't in the "Authorized JavaScript origins" list for the OAuth Client ID (`615094696252-....apps.googleusercontent.com`, `hamonym-app/src/environments/environment.ts`) in Google Cloud Console. **Not fixable from code** — the user needs to add the origin themselves at https://console.cloud.google.com/apis/credentials. Waiting on confirmation of which exact origin/port they're running on before finalizing the value to add (assumed `localhost:4200` pending confirmation).

## 8. Open items / waiting on the user

- Google Cloud Console origin fix (§7).
- Whether the duplicate root-level Angular project (§2) is intentional — not deleted, just excluded from TS compilation.
- Next step on the Approval Agent: wire UI to `recommend()` and retire the `analyze()`-only endpoint (§6) — ready to proceed, awaiting go-ahead.
- Nodemon stdio issue (§5) — currently working around it by not using nodemon; not actually root-caused.
