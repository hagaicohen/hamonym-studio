# MASAV manual export UX - local changes only

The permanent Super Admin section reuses existing proposal, approval, export, authorization and balance APIs. System activity now returns actual FIN-11 last-run diagnostics, including per-Statement preparation reasons.

Isolated real XLSX verification exposed a duplicate-instruction gap: preparation did not account for an already exported proposal. Preparation, approval and export now reuse hasExportedMasavProposal while holding the existing Statement lock. Preparation returns awaiting_masav_results as a healthy idempotent wait; no new proposal or payment is created. Legacy duplicate approval/export is blocked. No migration, financial calculation or provider behavior change.

7 disconnected PostgreSQL checks verify actual 540 XLSX export, retained 540 debt, unchanged single 3000 mock payment/attempt, repeat-export rejection, post-export preparation wait and legacy duplicate guards. 11 full isolated clock/engine/diagnostic checks and 39 Cron regressions passed. The frontend has 18 focused Chrome checks including mobile/desktop layouts. See the Frontend docs/MASAV_COLLECTION_UX_2026-10-30.md for UI and workflow details.

Tests: scripts/test-masav-manual-export-isolated.cjs and scripts/test-fin11-masav-clock-integration.cjs require their explicitly named disconnected fixture databases. They must never target shared pilot data.

No shared financial data, mandate, proposal or clock was modified by this task. No financial jobs ran against shared data. No commit, push, deploy or external provider operation.
