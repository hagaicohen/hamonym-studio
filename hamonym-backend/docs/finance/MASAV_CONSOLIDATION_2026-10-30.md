# Unified MASAV export - local implementation and review boundary

One existing export API now delegates to a shared preview/export service. All eligible approved proposals are reviewed/exported together. Persistent platform_billing_settings.masav_consolidation_mode is entity by default, optionally period; it affects only future exports. A preview digest prevents changes in setting, amounts, selected proposals or bank details from silently changing the reviewed file.

Migration 081 is additive: it adds the mode setting and immutable masav_export_batches, masav_export_instructions and masav_export_components. Unique proposal allocation, original Statement/period references, bank snapshots and mode are retained. Deferred constraints validate instruction and batch sums and original debt ownership. The new tables are RLS protected and unavailable to anon/authenticated/PUBLIC. Existing exported instructions remain protected, unchanged and unbackfilled.

Shared financial calculations/providers/card rules are untouched. Existing locks, balance/mandate checks, active-attempt/hold checks and exported-debt guards are reused. Export creates an XLSX and journal atomically, not payments or paid statuses. The existing 11-column MASAV sheet is preserved and a debt allocation sheet is added. Existing proposal GET includes journal references for auditability.

Tests: 24 Chrome UI checks, 13 disconnected PostgreSQL consolidation/XLSX scenarios, 7 prior manual-export compatibility checks and 3 SQL/projection constraints. Includes concurrent exports, missing mandate, partial payment already recorded against an original Statement, rollback on XLSX failure and immutability after a mode change. Migration applied only in disconnected Docker fixture clones; never shared Supabase/Render.


Required before any later deployment: resolve that financial policy, finish result handling as approved, review migration 081 and back up/apply it under explicit deployment authorization. Current task has no commit, push, deploy, shared data/clock changes or live jobs. Full UI details: frontend docs/MASAV_CONSOLIDATION_2026-10-30.md.

## Approved FIFO result allocation
The owner approved oldest-period-first allocation, only for actually confirmed bank collection results. Export never records a payment.
The new Super Admin confirmed-result endpoint requires an instruction, unique bank reference, confirmed amount/time and explicit confirmation. It locks the instruction and original Statements, revalidates balances, and calls the existing collection resolver in one transaction. Immutable result/payment allocation links preserve auditability. Repeated identical references return the original allocation; conflicting references or excess amounts are rejected.
Verified in offline Docker database hamonym_masav_fifo_20261030: FIFO 540+360 for the owner's example; real existing-export fixture 440+460, then 80+540; concurrent duplicate submission; unconfirmed/excess/conflicting results rejected; exact payment linkage. Shared pilot untouched.
Superseded by approved partial recovery: after explicit finalization, prepare a NEW residual-only proposal through the existing workflow. See MASAV_PARTIAL_RECOVERY_2026-10-30.md. Original instructions remain immutable.
Final follow-up verification: 26 Chrome UI regressions PASS; TypeScript app compilation PASS; isolated FIFO and concurrent-reference integration PASS with deferred result/payment integrity checks; injected failure on the second allocation rolled back the first payment, all attempts, result and allocations. The rollback check ran on fresh isolated clone hamonym_masav_fifo_20261030_v3.
