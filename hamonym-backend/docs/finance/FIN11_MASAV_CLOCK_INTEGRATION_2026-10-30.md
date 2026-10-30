# FIN-11 MASAV preparation and billing display

Implementation verified in isolation. No manual shared pilot financial data/clock updates or migrations are required.

## Behavior

- Collection reports label rolling 28th/20:00 Asia/Jerusalem periods by their closing month. The October transition and historical calendar-month labels remain correct.
- Financial overview calculates prior open debt before returning an empty selected month. Prior periods are strictly earlier than the selected closing boundary and exclude retired periods. Current-period amounts never include that historical debt.
- fin11-masav-prepare is registered with the shared effective-clock scheduler. Hourly checks use an Israel-local day >= 6 gate; prior-month cutoff and older open Statements are selected for catch-up. Admin clock orchestration calls the same registered step even when monthly calculation legitimately skips.
- This step only prepares proposals through existing services. It does not approve/export proposals, create collection attempts/payments or contact a bank/provider.
- Existing live-balance calculation, Statement locks, collection holds, unresolved-attempt guards and proposal deduplication are retained.
- Missing/unapproved mandates create the existing deduplicated missing_masav_mandate finding. Blocked preparation fails the job status, preserves reason and leaves debt open. The Admin masav_blocked category incorporates these findings, rechecks current authorization/outstanding and deduplicates by Statement. Fixed authorization hides stale actionable alerts while retaining history.

## Focused verification

- test-fin11-masav-clock-integration.cjs: 10 disconnected PostgreSQL checks. 21 paid fixture donations total 100000; November fee 3540; one fin11_mock card payment 3000; balance 540. December 5 23:59 Israel does not prepare November debt; December 6 crossing and real Cron entry both execute the same preparation. Missing/unapproved mandate remains failed with one finding. Repeated runs do not duplicate payments, attempts or proposals. Authorizing only the isolated fixture produces one proposal 540, without approval/export/collection. December empty overview includes historical 540; November shows it only as current debt.
- test-monthly-cron-result.cjs: 11 checks; test-cron-entry-hardening.js: 28 checks.
- Frontend billing-period-label.spec.ts: rolling November, October transition and historical September calendar month.
- Targeted frontend command: npx ng test --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.billing-label.spec.json --include=src/app/modules/platform/services/billing-period-label.spec.ts
- Full legacy test compilation still has unrelated StatementListItem fixtures missing collected. The targeted tsconfig avoids modifying those fixtures.

## Review boundary

Actual pilot MASAV details/authorization remain absent and must be supplied through the existing authorized workflow before a proposal can be prepared there. This change grants no automatic real MASAV collection permission. No new product decision is required for this preparation-only change. All unrelated pending diagnostics remain separate local work.

## Final local results
52 checks passed (10 PostgreSQL, 39 Cron, 3 Chrome label tests). TypeScript noEmit and Angular development build passed. Full default test compilation remains blocked by the pre-existing collected fixture errors; targeted browser tests passed using the focused tsconfig.

## Controlled deployment scope and clock impact
Backend candidate is based on c99b9ec. Only the MASAV job/registry/shared-dispatch, read-only overview/alert aggregation, this document and the focused integration script are included. Earlier SQL-stage diagnostics are excluded. Frontend period-label changes and tests remain local and are not deployed.

Read-only preflight found business clock 2026-12-06 09:00 Asia/Jerusalem, 21 paid donations, one open Statement total 3540, one succeeded fin11_mock payment 3000 and balance 540, no mandate/proposal. The next natural Cron execution is expected to record a missing-mandate finding and a failed preparation result. This is the approved actionable block, not a collection failure or payment. Existing card idempotency skips the succeeded attempt; the new workflow calls no approval/export/charge function. No manual jobs are permitted during deployment verification.
