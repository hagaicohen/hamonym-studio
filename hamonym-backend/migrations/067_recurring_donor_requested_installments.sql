-- ─────────────────────────────────────────────────────────
-- 067_recurring_donor_requested_installments.sql
-- Lets a donor choose their own number of monthly charges at signup
-- time, independent of the campaign owner's configured default
-- (campaigns.recurring_installments_count). NULL means the donor didn't
-- choose one — completeSignup() falls back to the campaign's own setting,
-- exactly as before. Does not change how CardCom is billed (still its own
-- TotalNumOfBills cycle-count instruction, never a credit-limit hold) —
-- only which number feeds that instruction.
-- ─────────────────────────────────────────────────────────

ALTER TABLE recurring_instructions
  ADD COLUMN IF NOT EXISTS donor_requested_installments SMALLINT
    CHECK (donor_requested_installments >= 1);
