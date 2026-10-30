# Permanent Super Admin MASAV workflow — local review

## Screen and behavior

`/platform/collection-ops` now includes a permanent Hebrew RTL MASAV section immediately after the main financial summary and before the billing table. It is independent of the selected overview month, and loads historical Statements through the existing unfiltered list API. It shows two summary cards (live outstanding amount and distinct organizations), original billing periods, real proposal states, authorization/read errors and explicit next actions. Statement IDs deduplicate rows; entity IDs deduplicate the organization count.

The component reads existing APIs only: billing Statements/periods/MASAV configuration, finance MASAV proposals/Statement balance, the Hamonym clock and system activity. It does not calculate platform fees, prepare proposals, create financial records, approve mandates or trigger jobs. Balances come from the existing backend balance service. Loading/failed reads never imply zero debt or successful collection.

Actions reuse the existing `POST /api/platform/finance-ops/masav-proposals/:id/approve` and `POST /api/platform/finance-ops/masav-proposals/export`. Approval requires an explicit inline reason and action. Export requires explicit inline confirmation and downloads the returned XLSX. No modal or separate management module is introduced. Pending requests disable duplicate actions. An export response/error is followed by read-only refresh; export never changes the displayed debt to collected. A completed label requires backend `paid` status, zero balance and confirmed MASAV payment method. There is no new result-ingestion or mark-paid action.

MASAV attention cards were moved to this permanent section, avoiding duplicate approval/export actions. Other exception cards remain in Requires Attention. An empty exceptions area no longer claims all actions are complete while MASAV remains unresolved.

## Why the pilot proposal was not initially visible

Read-only inspection found the mandate approved at 2026-10-30 11:18:50 Israel. The last run before that approval had correctly reported missing configuration. The natural Cron run at 11:30 then created one proposed instruction of 540 for the November Statement. The original page loaded attention on entry and after its own actions; it did not refresh when a later background preparation created a proposal. The new permanent section offers an explicit read-only refresh and a clear waiting state instead of hiding the process.

No shared mutation or job execution was performed during this task. The pilot Statement remains the source of truth; all mutation tests use disconnected clones or browser API mocks.

## Narrow Backend changes in the Backend worktree

- Existing system-activity GET now includes actual FIN-11 last-run status, result summary and error instead of registry membership alone. This allows the UI to display the preparation reason for the corresponding Statement without introducing a new API.
- Isolated duplicate-prevention verification found preparation could create a second proposal after an earlier instruction was exported. The existing exported-proposal guard is now reused under the existing Statement lock in preparation, approval and export. Preparation returns `awaiting_masav_results`, a legitimate idempotent wait. The scheduler does not report that wait as a failure. Legacy duplicate proposals cannot be approved or exported while an earlier instruction remains unresolved.
- No schema, provider, fee calculation, automatic approval/export, bank submission or payment-status policy changes.

Backend local files are in `C:/DEV/HamonymStudio-fin11-masav-deploy/hamonym-backend`; no changes from this task are committed or deployed. The exported-instruction fix must be reviewed before exercising export against the shared pilot backend. Existing deployed proposal and authorization APIs are otherwise reused unchanged.

## Verification

- 18 focused real-Chrome checks: 15 permanent-section UI tests plus 3 period-label tests. Includes no proposal, missing/unapproved authorization, manual approval, explicit export confirmation, awaiting results with debt retained, confirmed completion, stale/rejected approval, unknown/read failures, export timeout, duplicate requests/records and historical periods. Responsive layout checked in browser frames at 375px and 1200px without horizontal overflow.
- 7 real PostgreSQL/XLSX checks: explicit approval, actual 11-column XLSX with exactly one 540 instruction, unchanged open Statement/payment/attempt and 540 balance, rejected repeat export, idempotent preparation after export, and rejected legacy duplicate approval/export.
- 11 isolated November/December engine/API checks plus 39 existing Cron checks. Fixtures preserve the 100000 donation total, 3540 fee, one 3000 `fin11_mock` payment and 540 outstanding. HTTP/HTTPS denied and disconnected Docker networking used for financial tests.
- Frontend targeted command: `npx ng test --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.masav-workflow.spec.json --include=src/app/modules/platform/components/masav-collection-section/masav-collection-section.component.spec.ts --include=src/app/modules/platform/services/billing-period-label.spec.ts`.
- Default full test compilation still has the previously documented unrelated `StatementListItem.collected` fixture errors. The focused tsconfig excludes those fixtures; their code was not changed.

No shared clock changes, shared test data creation, actual approvals/exports, external collections, Commit, Push or Deploy are part of this task.
