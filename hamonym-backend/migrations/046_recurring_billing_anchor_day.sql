-- The donor's monthly billing day-of-month, as a Hamonym business fact —
-- deliberately independent of Cardcom's own next_date_to_bill, which is
-- just an operational mirror that gets overwritten on every Update/webhook.
-- Nullable: existing rows get it lazily on first Pause/Resume use, not
-- backfilled here (see docs/CARDCOM_RECURRING_IMPLEMENTATION_PLAN.md §9.1).
ALTER TABLE recurring_instructions
  ADD COLUMN IF NOT EXISTS billing_anchor_day SMALLINT
    CHECK (billing_anchor_day BETWEEN 1 AND 31);
