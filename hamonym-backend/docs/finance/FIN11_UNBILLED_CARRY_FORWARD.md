# FIN-11: Unbilled paid donation carry-forward

Implemented locally: 2026-10-29. Not deployed. No migration required.

## Reproducible defect

PostgreSQL NOW() is the payment confirmation transaction start time. A confirmation
can begin before cutoff, wait for the campaign row, and commit after a Statement
has been calculated and approved. Its original billing_effective_at belongs to the
closed period. Reusing the closed Statement must not erase this unclaimed activity.

## Minimal correction

The existing calculation and activity discovery now select all paid,
unclaimed donations with billing_effective_at strictly before the selected period
end. The previous lower-bound exclusion is removed. The account, approval policy,
fee/VAT arithmetic and cutoff remain unchanged. Future, pending and failed donations remain
excluded. A new cycle includes both its current activity and older unclaimed activity
in its ONE normal Statement: no supplemental Statement, no reopening, no new engine.

Existing Statements are still reused. Their additional unclaimed activity is reported
in result_summary.deferredUnbilled, with entity, count, gross and an explicit reason;
it is deferred to a subsequent cycle rather than modifying an effective Statement.

Approval still locks component donations and atomically claims them through the
existing write-once effective_statement_id. Already claimed donations cannot be
billed again. Same-cycle calculations retain the existing per-account advisory lock.
Checkout and confirmation transactions acquire no new locks from this correction.

## Audit trail

statement_components preserves the original donation ID, amount, payment-completion
snapshot, billing_effective_at_snapshot and origin_type. These timestamps are NEVER
moved into the new cycle. The new Statement and its billing run identify the cycle
that actually bills the donation. result_summary.carriedForward records each older
component with its original effective timestamp and original billing_period ID,
when a corresponding non-retired period exists (otherwise NULL, never invented).
This report is reconstructed from components on repeated runs, so reuse does not
remove the audit trail. This is an auditable carry-forward adjustment; no monetary
statement_adjustments entry is needed because that would double-add the amount.

The shared orchestrator returns both carriedForward and deferredUnbilled reports.
Paid Statements, payments, donor amounts and original timestamps remain untouched.
Card cap, collection/retry locks, outstanding balances and MASAV services are unchanged.

## Verification

Run scripts/test-fin11-carry-forward-postgres.cjs with HAMONYM_TEST_PG_MODULE pointing
to an installed pg module when this worktree has no node_modules. It connects ONLY to
127.0.0.1:5433 / hamonym_fin11_masav_20261028 with the existing isolated test credentials.
It never loads .env. It creates and drops a unique private test schema; existing
public records and Render are untouched. No payment provider is called.

Eighteen checks passed with existing calculation, approval, donation confirmation,
balance, capped-attempt opening and MASAV proposal source loaded against isolated
PostgreSQL fixture tables. Boundary conversion uses PostgreSQL Asia/Jerusalem tzdata.
Coverage: cutoff +/-1 ms, delayed Cron, DST, real concurrent payment transaction blocked
across cutoff, following-cycle recovery, concurrent repeated calculations, stable audit,
duplicate confirmation, paid-Statement protection, card cap boundaries, unresolved
attempt lock, MASAV remainder and repeated proposal, pending/failed/future exclusions.

October amounts were reproduced with NEW isolated fixture IDs: paid gross 8000 and
fee 283.20 remain unchanged; eight older unclaimed donations totaling 7249 are approved
in the following cycle for 256.61 (217.47 fee + 39.14 VAT), once only.
A 100000 carry-forward generates 3540 due; actual capped-attempt code requests 3000.
A synthetic confirmed-payment fixture then leaves 540 for the actual MASAV proposal
service. Proposal creation does not close the Statement and is idempotent.

## Limits / deployment review

No existing October records have been repaired and no collection was executed.
Historical unclaimed eligible donations will be included in the NEXT new cycle after
deployment, potentially increasing its debt. Paid Statements stay immutable; FIN-11
caps and mandate requirements continue to apply. Fee/VAT use the existing new-cycle
calculation policy, not a newly invented historical rate rule. No web or mobile UI
change is required. Tests use lightweight isolated table fixtures and mock boundaries;
they do not constitute a migration/full-production-schema or live-provider test.

Migration 080 supersedes donation-level test classification. Historical paid rows
previously flagged as mock are eligible through the same carry-forward path.
