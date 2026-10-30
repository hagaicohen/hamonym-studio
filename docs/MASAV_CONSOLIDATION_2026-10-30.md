# Unified MASAV export and persistent consolidation — LOCAL ONLY

This extends the permanent MASAV section. Nothing in this task is committed, pushed, deployed or applied to the shared pilot database. No shared clock changes or live jobs/provider operations were performed.

## Implemented

- `/platform/collection-ops` has one prominent `הפק קובץ Excel למס״ב` action. It requests a server preview of all eligible approved proposals across organizations/periods, independent of the selected month. The administrator reviews instructions, original Statement amounts, organization/period counts and the total before explicit export confirmation.
- General Settings → גבייה → מס״ב includes `אופן איחוד חובות למס״ב`: `entity` (one instruction per organization, default) or `period` (one instruction per organization/billing period). Both generate one XLSX. The mode is persisted by the existing platform billing settings service. No VAT/card policy is changed.
- Existing preparation and individual proposal approval are reused. `POST /api/platform/finance-ops/masav-proposals/export` delegates to one shared exporter for both existing single-proposal callers and unified exports. `POST .../masav-proposals/export-preview` is read-only and uses the same validation/manifest code.
- Preview/export revalidate the original live outstanding balances, current authorization/bank details, collection holds, unresolved attempts, status and prior exported instructions. A digest covers mode, selected proposals, source amounts and bank details. A changed review requires another preview; no unreviewed instruction is silently added.
- The original 11-column MASAV worksheet remains the bank-processing sheet, with instruction reference in remarks. A second `Debt allocations` sheet provides original Statement/proposal/period IDs and amounts. Bank/branch/account remain text to preserve leading zeros.
- Export does not create payment records, call a payment provider, approve another proposal or mark any Statement paid.

## Local migration 081

`081_masav_export_consolidation.sql` adds the persisted mode and three append-only tables: export batches, instructions, and debt components. Components retain immutable original Statement, proposal, period and amount links. The proposal link is unique. Deferred constraints check instruction/batch totals and original-debt ownership at commit. New tables have RLS and no anon/authenticated/public privileges; bank snapshots are not returned by ordinary preview APIs, which show only account last-four digits.

Each batch freezes its consolidation mode. Changing the platform setting never edits historical instructions. Legacy exported proposals without a new journal remain intact and protected against another export; they are not backfilled or rewritten.

081 was applied only to disconnected PostgreSQL clones of test fixtures. It is required before this backend version can be deployed. It does not alter existing financial records or replace migrations 079/080. No migration has been run on Render/shared Supabase.

## Verified locally

- 24 real-Chrome UI checks: permanent historical debt, preparation/authorization states, explicit approval and batch review/export, duplicate requests, stale preview, failed reads/export timeout, persistent mode setting, and responsive layout.
- 13 real PostgreSQL/XLSX consolidation checks: multiple organizations and periods, three debts of 540 → one instruction of 1620, separate-period instructions in one file, missing mandate, a previously recorded partial payment reducing only its original debt, stale-mode token rejection, actual XLSX content/allocations, concurrent export, rollback on XLSX failure, immutable snapshots, repeat prevention and legacy exported instructions.
- 7 existing manual-export compatibility checks plus 3 database accounting/linkage/projection checks.
- TypeScript and Angular development build are checked. Full default test compilation still has the previously documented unrelated `StatementListItem.collected` fixture errors; the focused tsconfig does not modify them.

## Partial results AFTER export

The owner approved FIFO. Confirmed-result ingestion and its isolated database regressions are now implemented, as described below. Current checks: 26 Chrome UI tests, TypeScript compilation, and isolated PostgreSQL FIFO/idempotency/payment-linkage scenarios pass.

No changes were made to the shared November Statement or its 540 outstanding balance.
# Confirmed partial collection — approved FIFO

Partial amounts are allocated oldest billing period first, only after a Super Admin records an actually confirmed bank result. Excel generation never creates payments. The result form requires a unique bank reference, amount, confirmation time and explicit confirmation. Each allocation links to its original Statement and payment. Identical repeated submissions are idempotent; conflicting references and excess amounts are rejected atomically.

The existing unresolved-export protection remains until explicit finalization. After a finalized partial/failed result, the approved recovery workflow prepares a NEW residual-only proposal with explicit confirmation. Original instructions are never edited or re-exported. See MASAV_PARTIAL_RECOVERY_2026-10-30.md.
