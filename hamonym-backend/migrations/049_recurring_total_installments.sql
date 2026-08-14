-- Snapshot of the total installment count promised at signup — including
-- the first LowProfile payment. NULL = until cancelled (existing
-- behavior). Independent of campaigns.recurring_installments_count so a
-- later change to the campaign's own policy never affects an
-- already-active donor's plan — same principle as billing_anchor_day
-- (migration 046). See docs/CARDCOM_RECURRING_IMPLEMENTATION_PLAN.md §9.3.
ALTER TABLE recurring_instructions
  ADD COLUMN IF NOT EXISTS total_installments SMALLINT
    CHECK (total_installments >= 1);
