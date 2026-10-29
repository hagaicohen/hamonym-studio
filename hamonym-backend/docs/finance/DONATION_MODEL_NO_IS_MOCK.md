# Donation model: no donation-level mock flag (2026-10-29)

Business rule: one donor payment flow. Verified paid status determines financial
eligibility, whether CardCom's terminal is TEST or production. Pending, failed and
unconfirmed donations never contribute to paid totals or platform-fee Statements.
The separate fin11_mock platform-fee collection provider is unchanged.

## Changes

Backend: donation creation (initial, manual, registration, recurring success/failure),
entity/platform donation and donor lists, dashboard read summaries, billing provisioning,
calculation/carry-forward, Statement approval, late-donation balance selection and
collection reporting no longer read/write/filter donations.is_mock. Donor aggregation
no longer exposes has_mock. Frontend donation/donor interfaces and TEST badges removed.
Payment verification, status transitions, official receipts and recurring idempotency
remain unchanged. Historical paid donations without effective_statement_id are eligible
through the shared carry-forward calculation, including formerly flagged rows.

## Migration 080 and controlled rollout (not executed on shared DB)

Deploy compatible Backend code before dropping the column: new code works both before
and after migration. Old code is incompatible with the column removal. Update the
local Frontend to remove classification badges. Quiesce remaining old application/job
processes before applying 080 in a maintenance window using the established backup
procedure. Do not run billing as part of the migration.

080 is transactional, with 5-second lock timeout and 60-second statement timeout.
It removes only the obsolete field comparison from the EXISTING paid-immutability
function definition, retaining other existing protections. Unexpected references fail
closed. DROP COLUMN uses no CASCADE; unexpected dependent views block the transaction.
The eligibility index is recreated with paid + unclaimed predicates. No donation
statuses, amounts, ownership, payments or receipts are updated. The removed boolean
values can only be recovered from a pre-migration backup; do not roll back the app
alone to a version requiring this column after migration.

Historical migrations 011/054-058 remain immutable and intentionally mention the old
field; applying the full sequence then 080 produces the new schema. Legacy-schema
migration/reset test fixtures retain the old field only when exercising these historical
migrations. Old MD specifications mentioning mock exclusion are superseded by this file.

## Verification

- Migration applied only to private temporary schema and a new isolated Docker copy.
- 60 pre-existing donations in that copy retained identical hashes for every field
  other than the removed flag; paid immutability remained enforced.
- FIN-11 PostgreSQL tests seed a legacy true paid donation before migration and prove
  it is calculated/approved afterward. Cutoff, carry-forward, duplicate protection,
  card-cap request and MASAV remainder tests run without the column.
- Official receipt suite exercises initial donation, verified webhook, guest linking,
  protected PDF, recurring receipt/idempotency, amount mismatch and pending exclusion,
  against migrated isolated PostgreSQL, with blocked external HTTPS and fixture provider.
- No CardCom requests or changes to shared financial records were performed.

Final checks: 18 isolated PostgreSQL FIN-11/migration checks, 15 billing-readiness
unit tests, 5 bulk-approval unit tests and 14 Dashboard unit tests passed. Official
receipt/recurring PostgreSQL suite passed. Angular production build passed.
The separate frontend scripts/test-admin-read-api.cjs suite reports 8 failures;
all 8 also fail against unmodified Backend HEAD (7049841), whose API contract
predates the extra filtering/summary fields expected by that suite. No unrelated
API feature was implemented to conceal that baseline mismatch.
