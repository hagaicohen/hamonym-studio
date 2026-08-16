-- Recurring donations — CardCom-managed (docs/CARDCOM_RECURRING_IMPLEMENTATION_PLAN.md).
-- status is a Hamonym-internal signup lifecycle, not CardCom's own Master
-- lifecycle (that one stays Provisional — see the Architecture doc): a row
-- exists before CardCom ever confirms anything, so we need our own states to
-- track "did the first payment succeed" and "did the Recurring Create call
-- succeed" independently and recoverably.
CREATE TABLE IF NOT EXISTS recurring_instructions (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           UUID         NOT NULL REFERENCES entities(id)  ON DELETE CASCADE,
  campaign_id         UUID         NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  donor_name          VARCHAR(255),
  donor_email         VARCHAR(255),
  donor_phone         VARCHAR(50),
  amount              DECIMAL(10,2) NOT NULL,
  time_interval_id    INT          NOT NULL DEFAULT 1,  -- 1 = monthly, the only Verified value
  status              VARCHAR(20)  NOT NULL DEFAULT 'pending_payment',
  -- pending_payment  → recurring_instructions row created, first LowProfile not completed yet
  -- pending_creation → first payment succeeded, Recurring Create not attempted/succeeded yet
  -- active           → cardcom_recurring_id populated
  -- creation_failed  → Recurring Create attempted and failed, see failure_reason
  cardcom_account_id   INT,
  cardcom_recurring_id INT,
  next_date_to_bill    DATE,
  failure_reason        TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recurring_instructions_cardcom_recurring_id
  ON recurring_instructions(cardcom_recurring_id) WHERE cardcom_recurring_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recurring_instructions_campaign ON recurring_instructions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_recurring_instructions_entity   ON recurring_instructions(entity_id);
CREATE INDEX IF NOT EXISTS idx_recurring_instructions_status   ON recurring_instructions(status);

-- Links a donation (the first LowProfile charge, or later a Detail-charge
-- donation once Phase 3 exists) back to the recurring signup it belongs to.
-- NULL for every ordinary one-time donation — no behavior change for them.
ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS recurring_instruction_id UUID REFERENCES recurring_instructions(id);

CREATE INDEX IF NOT EXISTS idx_donations_recurring_instruction ON donations(recurring_instruction_id);
