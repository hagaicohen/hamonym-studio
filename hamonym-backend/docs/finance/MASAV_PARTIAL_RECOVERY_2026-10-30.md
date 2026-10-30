# MASAV Partial Collection Recovery — local implementation

## Workflow
1. Export creates immutable bank instructions and debt snapshots, never payments.
2. Record only actual confirmed amounts through the existing collection resolver. FIFO applies by original period end/start and stable Statement ID.
3. Explicitly finalize the instruction after all actual bank results have been recorded. Finalization derives failed/partial/completed from recorded payments; it never creates a payment. A zero-collection failure is finalized without inventing one.
4. A finalized partial/failed instruction can prepare a new proposal for the currently unpaid residual only. The administrator confirms this action. Existing mandate, hold, unresolved-attempt and balance checks still apply.
5. Approve new proposals manually, review the unified export, and export once. Existing per-organization/per-period consolidation setting applies to the new file only.

## Architecture and audit
- New append-only tables in migration 082: masav_instruction_finalizations, masav_retry_requests, masav_retry_proposals. Existing instructions, components and payments remain immutable.
- Exactly one retry request per original instruction. Requests and all generated proposals commit atomically or roll back together.
- Reuses prepareMasavProposal with a supplied transaction and the existing approve/export/statement-balance services. No second billing engine, payment provider or bank transport.
- Original Statements/periods retained; child instructions link through retry proposals to the original instruction. The existing Debt allocations XLSX sheet adds Original instruction. Bank sheet remains the same eleven columns.
- Finalized instructions reject new results; identical existing result/finalization references replay idempotently. Conflicting references are rejected. Instruction locks and stable Statement locks serialize competing result/retry/export operations.
- Legacy exports without an immutable instruction journal remain locked. No inferred results or historical backfill.
- History balances are shown per instruction and are NOT summed into additional debt. Primary financial totals remain Statement-based to avoid double counting across retry generations.

## Protected Super Admin endpoints
GET /api/platform/finance-ops/masav-instructions
POST /api/platform/finance-ops/masav-instructions/:id/finalize
POST /api/platform/finance-ops/masav-instructions/:id/retry
Existing confirmed-result/approval/export endpoints remain in use.
Finalization body: reference, confirmedAt, confirmed=true. Retry body: confirmed=true. Actor always comes from the authenticated user, never the request body.

## Local verification
Offline Docker PostgreSQL, network none, no published ports. Fresh clones only; DB name and loopback assertions in tests, HTTP/HTTPS provider requests forbidden.
- test-masav-recovery-isolated.cjs: 13 end-to-end scenarios PASS on hamonym_masav_recovery_20261030_v4. Actual 1620 -> confirmed 900 -> new debts 180+540. Failed 1080 -> retry 1080. Both consolidation modes, organization-to-period and period-to-organization actual XLSX exports, repeated partial recovery, FIFO, duplicate references, concurrent results/finalizations/retries/exports, rollback on second component, revoked mandate, overcollection, completed-instruction rejection and immutable history.
- Existing consolidation regression: 13 PASS on hamonym_masav_consolidation_20261030_v5.
- Existing manual export regression: 7 PASS on hamonym_masav_ux_export_20261030_v3, including legacy duplicate protection and no automatic approval/export/collection.
- Focused Chrome UI covers confirmation, original/collected/outstanding amounts, pending/partial/failed/completed, failed-result finalization without payment, retry errors, next-proposal visibility and responsive layout.

## Deployment prerequisites — not performed
Apply local migration 081 before 082, with normal verified-backup/deployment procedure and suspended financial writers during schema transition. Both are prerequisites for this backend version; neither was run on shared Supabase/Render. Frontend/backend feature versions must match.
No shared pilot records, business clock, Render settings or services were modified. No live jobs, external payments, commits, pushes or deployments performed.

Final focused UI run: 33 Chrome tests PASS (including mobile 375px and desktop 1200px with the new instruction history/result form). TypeScript compilation PASS. This task's completed PostgreSQL/XLSX suites total 33 checks: 13 recovery + 13 consolidation + 7 manual-export compatibility.
