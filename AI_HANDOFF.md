# HAMONYM — Admin development handoff

## Current instruction
- Owner unavailable for ~26 hours. Implement remaining Admin screens in document order without per-screen approval. Record genuine blockers and continue. This overrides the document's per-screen approval pauses.
- Source specification: `C:\Users\hagai\Downloads\HAMONYM_ADMIN_FULL_DEVELOPMENT_AND_SCREEN_DESIGN_SPEC.docx`, read including appendices.
- Dashboard and Organizations are approved: their UI was not changed in this continuation.
- No commits, pushes, deployments, migrations, live database access, payments, resets, business-clock changes or scheduler activation were performed in this continuation.
- Changes are local and need the owner's visual review. Mock/browser acceptance is not authenticated cloud acceptance.

## IMPORTANT repository locations
- Frontend: `C:\DEV\HamonymStudio\hamonym-app`, local branch `main`, HEAD `ec6a481` with pre-existing modifications. Preserve them.
- Edited Backend: `C:\DEV\HamonymStudio-fin11-deploy-candidate\hamonym-backend`, branch `codex/admin-dashboard-organizations-release`, HEAD `44017ad`. Four read-API files are now modified there, uncommitted.
- Do NOT edit or deploy the stale Backend copy inside the frontend (`hamonym-app/hamonym-backend`). Its existing Organizations diff predates this continuation.
- The previous approved Dashboard/Organizations release was pushed as `44017ad`; no new release was made here. Exact Render Live commit and Frontend hosting were not previously verified. Do not resume that deployment without authorization.
- Ignored baseline: `.angular/admin-continuation/baseline/` (70 frontend files and manifest); Backend baseline: `.angular/admin-continuation/backend-baseline/`. These preserve the state before this continuation's respective edits.
- Existing unrelated modifications include campaigns/users/donations navigation fixes, general-settings campaign selector width, and environment.ts line order. They were retained. Do not blanket-stage the working tree.

## Implemented locally, in specification order

| Screen | Implementation / visual structure | Review status |
| --- | --- | --- |
| Dashboard | Previously approved; unchanged. Only its isolated destination-test DI stub was adapted to the Campaigns context dependency. | Approved UI remains intact |
| Organizations | Previously approved; unchanged, including `עדכון פרטים אחרון`. | Approved UI remains intact |
| Partners | Compact RTL table, visibility terminology, actual owner/campaign associations, Israel dates, name/details drawer, separate empty/no-results/error states and retry. No invented fundraising or owner-only Builder access. | Local; visual approval pending |
| Campaigns | Name opens management/details drawer; nonprofit links honor permission. Monetary cents, clear raised/target/progress, uncapped achieved percentage with capped bar. Informational status; one labeled action entry. Confirmation for status changes and duplication; original required-note rules preserved. Existing feature/lock/delete/restore/slug actions retained. Organization/date filters, end dates, nonprofit-name search and progress/end-date sort with compatible API. | Local; visual approval pending |
| Users | Name/email combined, role/account-status/privilege clearly separated, never-login text, actual affiliations linked, detail/audit drawer. Existing suspension, permission, reset-link and impersonation actions preserved. Independent entity/status/role/full-admin filters with compatible API. Admin creation is secondary. | Local; visual approval pending |
| Donations | Linked nonprofit/campaign and donor/details drawer. Actual receipt link; precise currency/Israel dates. Full filtered paid-only summary from new read API; honest legacy fallback. Entity/campaign/status/period/date/type/method filters; name/email/transaction-reference search for existing Super Admin route. CSV uses identical filters, paginates fully, detects changing/incomplete lists and escapes formulas. Payment method is evidence-based; NULL is not assumed to be card. | Local; visual approval pending |
| Collection Ops | Existing four KPI/calculations retained. Overview adds donation base and nonprofit links. History opens existing statement detail and handles read errors. Reports are a selection/export form plus collapsed preview instead of another always-visible overview. Stale read responses rejected. Existing collection/reconciliation/manual retry/MASAV execution methods unchanged. | Local; visual approval pending |
| General settings / Simulation | Responsive wide clock/reset panels; DD/MM/YYYY display, explicit date preview and feedback. Existing reset preview/confirmation appears in accessible drawer with original guards and counts/amounts. Clock, VAT, reset service calls and financial gates unchanged; no operation executed. | Local; visual approval pending |
| Exceptions | Compact center within Donations at existing `#anomalies`, open/history, severity/type/name/date filters, human labels, source/details/audit and existing-treatment links. Uses existing reconciliation/payment exception/needs-attention reads. Historical FIN-11 failure stops being active when authoritative Collection Ops projection has no action, without modifying the persisted finding. Uncertain results remain active at zero balance. Exact-record dedup only; existing grouped view retained. | Local; visual approval pending |
| Organization internal detail | Status-specific management confirmation drawer; active clean entity has no approval button. Existing flagged-active review uses `אישור בדיקה חוזרת`. Short business timeline deduplicated by record identity; full audit retained with technical notes/codes in advanced disclosure. Readable scrolling audit table, exact currency/Israel dates, permission-aware campaign/user links. Approved return-to-list context preserved. | Local; visual approval pending |

## Frontend changed areas
- Each of the seven remaining page folders: `src/app/modules/platform/pages/platform-{partners,campaigns,users,cardcom-ops,collection-ops,general-settings,organization-detail}-page/`.
- `src/app/modules/platform/services/platform.service.ts`: existing GET-based paginated filter choices; additional read query parameters. No existing write method changed.
- `src/app/modules/platform/services/cardcom-ops.service.ts`: additive read fields/filters and optional findings limit; existing write methods unchanged.
- New shared presentation: `components/admin-details-drawer/admin-details-drawer.component.ts` (focus trap, Escape, restore focus, close disabled while busy), `styles/admin-list.css`, `utils/admin-display.ts`.
- New tests: `scripts/test-admin-screens.cjs`, `scripts/test-admin-read-api.cjs`, `src/app/modules/platform/admin-screens.spec.ts`.
- Existing `platform-users-page.component.spec.ts`: roles read stub added. `scripts/test-platform-dashboard.cjs`: context predicate stub adapted; approved Dashboard code not changed.

## Backend read API changes — four files ONLY
Paths below are relative to the edited Backend root given above:
1. `src/modules/platform/platform.service.js`: only `getCampaigns` and `getUsers`. Adds end date, safe search/date/sort fields, stable pagination, named affiliations and independent filters.
2. `src/modules/platform/platform.controller.js`: only `getCampaigns` and `getUsers`, forwarding read filter parameters.
3. `src/modules/donations/donations.service.js`: only `getPlatformDonations`. Adds filtered paid-only aggregates to the existing count SELECT, date/type/method filters, safe email/transaction search, receipt ID and payment-method evidence. Keeps `is_mock = false` and existing period semantics. No donor contacts, raw provider results, tokens or credentials returned.
4. `src/modules/platform/cardcom-ops/cardcom-ops.controller.js`: only `listDonations`, forwarding read parameters.
- Additive `adminListVersion: 1` marks compatible responses. Frontend does not silently enable unsupported filters against older Render code, and rejects mismatched responses instead of displaying unfiltered data.
- No schema/index/migration changes. Existing source columns verified in repository migrations (including 003/040) and code.
- AST comparison against Backend baseline confirmed that all other exported functions, including financial/action functions, are unchanged.
- A local patch copy is stored under `.angular/admin-continuation/backend-readonly.patch` for review. Do not blindly apply it to stale Backend copies.

## Verification completed
- 80/80 isolated Node tests passed: 24 new UI/controller tests, 7 new readonly API tests, 17 Dashboard tests, 18 Organizations tests, 14 existing Backend Dashboard tests.
- 28/28 real Chrome Headless checks passed: 14 cases on desktop and mobile. Covers rendering, loading/error/empty/no-results, links, required confirmation, compatible API controls, scoped reset preview, drawer keyboard focus and busy-close guard.
- Final Angular production build passed. Existing unrelated campaign-preview CSS budget warning remains (warning only).
- Dashboard, Organizations, Dashboard service and app.routes.ts matched the continuation baseline byte-for-byte (10 protected files). No financial/action exports changed in Backend; Collection Ops action methods and campaign-reset execution/VAT-saving methods matched baseline.
- No tests used a live database or a real provider. Backend imports were fail-closed mocks; browser services and HttpClient were mocked.
- Test output and temporary Karma/tsconfig are ignored under `.angular/admin-continuation/`.

### Reproduce checks
From the frontend root, PowerShell:
```powershell
$env:HAMONYM_ADMIN_BACKEND_ROOT='C:\DEV\HamonymStudio-fin11-deploy-candidate\hamonym-backend'
node --test scripts/test-admin-screens.cjs scripts/test-admin-read-api.cjs scripts/test-platform-dashboard.cjs scripts/test-platform-organizations.cjs C:\DEV\HamonymStudio-fin11-deploy-candidate\hamonym-backend\scripts\test-platform-dashboard-unit.cjs
node node_modules/@angular/cli/bin/ng.js test --watch=false --ts-config .angular/admin-continuation/tsconfig.json --include src/app/modules/platform/admin-screens.spec.ts --karma-config .angular/admin-continuation/karma.cjs
node node_modules/@angular/cli/bin/ng.js build --configuration production
```
- Test config files above are local/ignored; they use ChromeHeadless at 1440×1000 and 390×844. Launching Chrome required normal tool escalation outside the restricted sandbox.
- Windows corporate TLS requires a temporary PEM made from already-trusted Windows root certificates via `NODE_EXTRA_CA_CERTS` for Google Fonts inlining. The PEM used is `%TEMP%\hamonym-admin-build-trusted-roots.pem`. Never disable TLS verification. No project/environment file was changed for the build.

## Genuine remaining gaps / constraints
1. Partners: no existing attributed-fundraising data or platform partner-edit endpoint. Do not invent a model or bypass ownership; readonly drawer is available.
2. Users: no existing Platform API to edit primary role or entity affiliation. Current platform-permission and account-management actions remain available. Adding a role/affiliation write flow needs an explicit approved permission contract; do not guess.
3. Donations: full raw provider/reconciliation attempt history is not exposed by the authorized list API. Existing creation/completion, status, failure reason and receipt are shown; no provider requests were added. Unsupported details are labeled unavailable.
4. Findings API remains capped at 200 with no total/pagination. UI explicitly notes truncation at the cap. Cannot claim global count equality with Dashboard for all independent sources or merge distinct cross-source records without reliable relationship IDs.
5. Native date picker appearance follows browser/OS locale; explicit selected business date and all rendered timestamps use Israel DD/MM/YYYY. No shared clock was changed.
6. Authenticated acceptance with real backend data and final visual approval still required. New backend read fields are not deployed. Frontend keeps a truthful legacy mode against current Render.
7. Screenshots were not captured; the per-screen table above provides visual descriptions, and real browser fixtures were verified. Do not claim product-owner visual acceptance for these screens.

## Resume / delivery boundary
- Keep all work uncommitted until explicitly approved. No push/deploy without approval for these new screens.
- Show the new screens for review. Local app route entry points: `/platform/partners`, `/platform/campaigns`, `/platform/users`, `/platform/donations`, `/platform/collection-ops`, `/platform/settings`, `/platform/organizations/:id`.
- Local dev server was not started by this continuation; run the existing Angular start command if requested. Backend must remain on Render unless a separate isolated mocked setup is explicitly used.
- After review, compatible Backend read changes must be included before accepting advanced Frontend filters. No migration needed. Do not change financial schedules, simulation authorization or configuration.

## 2026-10-25 - Authorized financial reset and single-clock continuation
- Shared TEST data reset COMMITTED successfully before the engine changes: 10 donations (6650 total; 5100 paid), 4 receipts, 5 CardCom events, one billing run/period, 4 related email logs and 451 selected financial job logs removed. All reset targets verified empty; four campaigns, entity/users/configuration and financial integrity metadata preserved. No provider calls or clock changes.
- Fresh recoverable backup: C:/HamonymBackups/FIN11-pre075-20261022-01/test-reset-2026-10-25T20-51-26-859Z.dump (1137701 bytes). Restore compared all 47 public tables; isolated reset and rollback verified. Matching .applied.json and .verification.json contain evidence. Do not reset again without a new reason.
- Backend code lives in C:/DEV/HamonymStudio-fin11-deploy-candidate/hamonym-backend, not the stale backend copies under the original repository/frontend.
- Removed FIN11_SIMULATION_* activation configuration and manual entity allowlist from backend src. Active billing accounts are enumerated normally. Both Admin set-fixed and monthly scheduler dispatch monthly-billing-orchestrator.execute, which reads clock.now. Legacy fin11_simulation_clock dispatch checkpoint is no longer used; no new migration.
- Test phase is intrinsic: card adapter resolves to fin11_mock; real CardCom adapter and CardCom HTTP transport remain blocked. Existing approval validation, locks, unique payments, retry schedule and recovery remain.
- UI now reports lifecycle outcomes and skips/errors, without obsolete collection-authorization warning.
- PASS: 76 financial regression cases + 26 clock/provider unit cases; 34 Angular checks (desktop/mobile); production build (fonts inlining disabled only for this build; no TLS/config changes).
- PASS isolated PostgreSQL: Admin 19:59 -> 20:08 and scheduler real-clock progression both collect 180.54 via fin11_mock; existing test platform-fee debt 35.40 also collected; donor records unchanged; duplicates prevented; interrupted finalization recovers same attempt; external calls zero. Dedicated local DB: hamonym_single_clock_verify_20261025 on localhost:5433.
- General Angular spec compilation still encounters existing missing-collected fixture typings in platform-billing-ops-page.component.spec.ts. Focused tsconfig tests pass without modifying unrelated tests.
- No new commit, push or deployment. Render still runs previously deployed code. Preserve all unrelated local changes.
- Existing mock donation provider does not implement new donor checkout creation; this task verified platform-fee billing, not a new mock donor checkout. Do not claim donor checkout support.

## 2026-10-25 - Mock donor checkout fixed and Backend deployed
- Backend branch codex/fin11-single-clock-release: a150dd3 + 01de47e pushed normally to GitHub main. Public Render health verified exact SHA 01de47e788a1722295eb18816f76e021ed4beddd, paymentPhase=test, paymentProvider=mock, billingSchemaReady=true.
- Actual Render Cron wrote a successful billing-monthly-cycle run at 2026-10-25T21:30:38.564Z with shared monthly_billing, recover_mock_attempts, fin11-card-collection and fin11-card-retry-sweep results all successful. No fees collected because shared ledger is empty. No cloud clock change or test transaction was performed.
- New mock donor sessions are persistent low_profile_id hamonym-mock:UUID, confirmed only by existing mock-complete endpoint with matching session. Confirmation persists provider_reference and provider_charged_at from Hamonym clock; existing payment handler/Gate v1/atomic donation+campaign+receipt lifecycle is reused. Historical sessions are rejected. Existing completed_at remains real. No new migration.
- Recurring first payment/signup and pause/resume verified. Subsequent recurring-cycle simulation was not verified; mock history currently returns represented mock records only. Do not claim full future recurring billing verification.
- E2E PASS with actual Express routes and isolated PostgreSQL: new donation 5100, concurrent completion, one receipt, failed payment without receipt, historical-session rejection, cutoff fee180.54, same engine/idempotency, recurring signup/pause/resume, external requests zero. Test scripts/test-mock-donation-billing-e2e.cjs. 102 Backend/unit tests + 38 Angular desktop/mobile checks PASS; production build PASS with build-only font inlining disabled.
- Frontend commits a894932, 39d36f0 and required one-line login CSS build prerequisite b71b906 pushed ONLY to codex/fin11-single-clock-frontend on existing origin (same repository URL as backend; never push frontend history to backend main). Only task hunks committed; unrelated Admin/checkout/diagnostics remain dirty.
- Frontend Render target is still unidentified and authenticated Render API access unavailable (no connector/CLI/key found). Therefore Frontend NOT deployed to Render. Local Angular started PID17692, http://localhost:4200 (HTTP200), settings http://localhost:4200/platform/settings, API points to deployed Render. environment.ts restored to HEAD content.
- Backend donations.service working file still contains unrelated diagnostics edits. Task-only changes were staged from a HEAD-based transformed source to preserve/exclude them. Do not blindly stage the remaining dirty file.
