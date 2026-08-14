-- Campaign-level policy for monthly donations: unlimited (existing
-- behavior) or a fixed number of installments. See
-- docs/CARDCOM_RECURRING_IMPLEMENTATION_PLAN.md §9.3 — the Cardcom
-- TotalNumOfBills=N-1 contract this feeds is Verified end-to-end
-- (2026-08-14). Default matches today's only behavior exactly, so existing
-- campaigns are unaffected without any backfill.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS recurring_billing_mode VARCHAR(20) NOT NULL DEFAULT 'until_cancelled'
    CHECK (recurring_billing_mode IN ('until_cancelled', 'fixed_installments')),
  ADD COLUMN IF NOT EXISTS recurring_installments_count INT NOT NULL DEFAULT 12
    CHECK (recurring_installments_count >= 1);
