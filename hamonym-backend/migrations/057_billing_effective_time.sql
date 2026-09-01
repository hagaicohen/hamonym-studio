-- Billing Engine — F2 Billing Effective Time schema (frozen, approved
-- 2026-08-28). Adds the column pair the Calculation Service will read from:
-- provider_charged_at (nullable — population from CardCom's own
-- TranzactionInfo.CreateDate is a separate, still-BLOCKED step, see
-- docs/HAMONYM_BILLING_ENGINE_TECHNICAL_DESIGN.md; nothing writes to this
-- column yet) and billing_effective_at (GENERATED, the single value Billing
-- selection actually reads).
--
-- Leaving provider_charged_at NULL everywhere means billing_effective_at
-- falls back to completed_at unconditionally for every row that exists
-- today — i.e. this migration changes no observable behavior by itself.
-- Only a later migration that teaches a specific ingestion path (LowProfile
-- first) how to populate provider_charged_at changes anything real.

ALTER TABLE donations ADD COLUMN IF NOT EXISTS provider_charged_at TIMESTAMPTZ;

ALTER TABLE donations ADD COLUMN IF NOT EXISTS billing_effective_at TIMESTAMPTZ
  GENERATED ALWAYS AS (COALESCE(provider_charged_at, completed_at)) STORED;

-- Replaces migration 054's idx_donations_billing_select, which selected on
-- completed_at (the pre-F2 model, frozen before F2 was refined). Billing
-- must select on billing_effective_at instead. No application code reads
-- either the old or new index yet (Calculation Service unwritten), so this
-- is a pure schema correction, not a behavior change for anything live.
DROP INDEX IF EXISTS idx_donations_billing_select;
CREATE INDEX IF NOT EXISTS idx_donations_billing_select
  ON donations (entity_id, billing_effective_at)
  WHERE status = 'paid' AND is_mock = false;

-- statement_components — Invariant #8 traceability snapshot needs the
-- period-selection value itself alongside the raw processing time, so a
-- future audit can see "which value put this donation in this period"
-- without recomputing anything. completed_at_snapshot stays for the same
-- forensic reason it already existed. Table has zero rows in production
-- (no Calculation Service writes to it yet), so NOT NULL without a default
-- is safe here exactly as it was for the table's original snapshot columns.
ALTER TABLE statement_components ADD COLUMN IF NOT EXISTS billing_effective_at_snapshot TIMESTAMPTZ NOT NULL;
