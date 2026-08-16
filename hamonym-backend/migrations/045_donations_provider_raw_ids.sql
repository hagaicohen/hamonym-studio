-- Raw provider-side identifiers for a payment attempt, generic (not
-- Cardcom-specific) — donations already stores one such identifier
-- (provider_reference). These two cover the remaining raw fields useful for
-- debugging/reconciliation on Detail-recurring events (both SUCCESSFUL and
-- failure): CardCom's RowID (billing-attempt record id) and its raw
-- response/status code (e.g. the credit-card processor's own code, distinct
-- from provider_reference). Not part of idempotency — provider_reference
-- stays the sole key for that.
ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS provider_row_id      VARCHAR(50),
  ADD COLUMN IF NOT EXISTS provider_status_code VARCHAR(50);
