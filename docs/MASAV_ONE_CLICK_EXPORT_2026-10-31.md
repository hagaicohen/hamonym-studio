# MASAV: single-action approval and Excel download

Local implementation only. No pilot data, clock, Cron, commits or deployments were changed.

## Administrator experience

`/platform/collection-ops` has one RTL collection card showing the ready amount,
organizations, instructions and original billing-period count. **אשר והורד קובץ מס״ב**
calls one server operation and starts the download. The approval modal, comment field,
technical preview and second export confirmation were removed.

Ineligible/unprepared debts show explicit blockers and disable the whole export;
the UI does not silently export the remaining subset. Existing pending exports are
shown separately as awaiting results, with exported amount/date and current outstanding
balance. **רישום תוצאות הגבייה** opens the existing confirmed-results/finalization/retry
workflow. History balances are never added together to calculate current debt.

Export does not collect money. Recording actual bank-confirmed results and explicitly
finalizing them remain separate actions. Residual recovery still requires its existing
confirmation, then the new proposals join the next single-action export.

## Backend contract and database prerequisite

- `GET /api/platform/finance-ops/masav-export/summary`: read-only eligibility summary.
- `POST /api/platform/finance-ops/masav-export/approve-and-download`:
  `{ requestId: UUID, expectedPreviewToken: SHA256 }` → XLSX bytes.
- Both endpoints retain existing authenticated Super Admin permissions.
- The server selects all pending/approved proposals; clients cannot supply a subset or
  approval actor. The summary token detects changed balances, bank details or consolidation.
- Existing export validation/workbook generation and existing approval policy execute
  in **one transaction**. Statements lock in stable order; mandates/settings are locked;
  unresolved collections, holds, stale balances and duplicate active proposals block export.
- File generation and immutable request-journal persistence happen before COMMIT.
  Any failure rolls back approvals, export records and audit writes together.

**Migration 083** (`083_masav_one_click_exports.sql`) must follow 081 and 082.
It only adds `masav_export_requests`: request UUID, authenticated actor, summary token,
batch FK, exact XLSX bytes and timestamp. It changes no existing Statements, proposals,
payments or balances. It has RLS, no public/anon/authenticated grants, and the existing
append-only trigger. Files contain bank details and must remain protected like the
existing immutable bank snapshots and backups; no file contents enter logs/browser storage.

This journal is necessary to recover from a lost HTTP response **after COMMIT**. The same
request/actor/token returns the original bytes, without approving or exporting anything
again. Different concurrent requests serialize on Statements and cannot export the same
debts. A request with another actor/token is rejected. This is retrieval of one existing
artifact, not a second instruction or bank submission.

The browser retains only the request UUID/token in tab session storage until a successful
download initiation. Unknown failures retain that identity for safe retry; known validation
application rejections clear it and refresh eligibility. Generic proxy failures, including
an ambiguous 503, retain the same request identity. A 120-second download timeout stops the spinner
without initiating another request. The browser cannot verify whether a user ultimately
saves or externally processes the downloaded file.

## Verification

- Real PostgreSQL/XLSX one-click suite: 13 scenarios in a fresh local Docker clone,
  including missing preparation/mandate, changed mode, XLSX failure, journal failure,
  same/different-key concurrency, lost-response replay, exact allocations and FIFO retries.
- Existing PostgreSQL recovery, consolidation and legacy export suites: 33 scenarios.
- New API contract suite: 5 scenarios; services stubbed, no database queries.
- Angular focused suite: 33 tests covering single API action, no preview/modal, duplicate clicks,
  errors/retries, actual-results safeguards, historic debts, RTL/mobile and HTTP timeout.
- Production Angular build uses the existing trusted-root bundle for Google Fonts;
  TLS verification remains enabled. Existing campaign-preview CSS size warning is unrelated.

All SQL verification used network-isolated local databases; external payment requests
were prohibited. The original 21 donation rows in the test fixture remained unchanged.

## Review/deployment boundary

Do not enable this UI against an older server. Missing 083 causes an explicit unavailable
response with no approval fallback. After separate deployment approval: verified backup,
apply additive 083 with the documented migration process, deploy matching backend/frontend,
then manually review the new UI. This task did not run 083 on Render, approve/export the
shared ₪540 proposal, contact a bank, or change FIN-11 card rules, FIFO or recovery.
