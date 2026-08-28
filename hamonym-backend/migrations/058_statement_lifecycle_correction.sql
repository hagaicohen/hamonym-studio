-- Statement lifecycle correction (frozen 2026-08-28) --
-- docs/HAMONYM_BILLING_ENGINE_TECHNICAL_DESIGN.md.
--
-- The original 054 design conflated "left draft" with "financially
-- consumed": idx_statements_final_per_account_period keyed uniqueness off
-- status != 'draft', and the planned eligibility check
-- (NOT EXISTS statement_components) would have meant a donation that only
-- ever appeared in an abandoned/superseded draft could never be billed
-- again -- because statement_components is unconditionally append-only
-- (054's trg_statement_components_no_update/no_delete), a bad or
-- superseded draft's components can never be removed.
--
-- Fix: a donation's actual consumption is tracked as its own explicit,
-- write-once fact on donations itself (effective_statement_id) -- set only
-- by a future Approval action, never by Calculation, never by this
-- migration. "Financially effective" statement statuses are exactly the
-- ones downstream of approval: approved, open, paid, cancelled,
-- written_off. draft and abandoned are not -- a donation whose only
-- statement_components rows sit under abandoned/draft statements remains
-- eligible for a future calculation attempt.

-- 1. status vocabulary: 'finalized' -> 'approved', add terminal 'abandoned'.
ALTER TABLE statements DROP CONSTRAINT IF EXISTS statements_status_check;
ALTER TABLE statements ADD CONSTRAINT statements_status_check
  CHECK (status IN ('draft', 'approved', 'abandoned', 'open', 'paid', 'cancelled', 'written_off'));

-- 2. Uniqueness must only ever apply to the financially effective statuses --
-- an abandoned attempt must never block a later real approved Statement for
-- the same (account, period).
DROP INDEX IF EXISTS idx_statements_final_per_account_period;
CREATE UNIQUE INDEX IF NOT EXISTS idx_statements_effective_per_account_period
  ON statements (billing_account_id, billing_period_id)
  WHERE status IN ('approved', 'open', 'paid', 'cancelled', 'written_off');

-- 3. 'abandoned' is fully terminal (Invariant, 2026-08-28 correction) -- no
-- further change of any kind, not just the money fields the original
-- immutability check already covered for every non-draft status.
CREATE OR REPLACE FUNCTION billing_statements_enforce_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'abandoned' THEN
    RAISE EXCEPTION 'statement % is abandoned and terminal -- no further changes allowed', OLD.id;
  END IF;

  IF OLD.status != 'draft' THEN
    IF NEW.gross_raised       IS DISTINCT FROM OLD.gross_raised
       OR NEW.fee_rate        IS DISTINCT FROM OLD.fee_rate
       OR NEW.vat_rate        IS DISTINCT FROM OLD.vat_rate
       OR NEW.fee_amount      IS DISTINCT FROM OLD.fee_amount
       OR NEW.vat_amount      IS DISTINCT FROM OLD.vat_amount
       OR NEW.total_due       IS DISTINCT FROM OLD.total_due
       OR NEW.billing_period_id  IS DISTINCT FROM OLD.billing_period_id
       OR NEW.billing_account_id IS DISTINCT FROM OLD.billing_account_id
       OR NEW.billing_run_id     IS DISTINCT FROM OLD.billing_run_id
    THEN
      RAISE EXCEPTION 'statement % is frozen once status is not draft', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. donations.effective_statement_id -- the real, DB-enforced financial-
-- consumption marker. NULL means "not yet consumed by any effective
-- Statement, still eligible". Set exactly once, by a future Approval
-- action -- Calculation never writes it. Write-once (not "frozen once
-- paid" like 055/056's columns): it legitimately starts NULL on a
-- long-paid donation and is set once, later, whenever that donation is
-- actually approved into a Statement.
ALTER TABLE donations ADD COLUMN IF NOT EXISTS effective_statement_id UUID REFERENCES statements(id);

CREATE OR REPLACE FUNCTION donations_effective_statement_write_once()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.effective_statement_id IS NOT NULL
     AND NEW.effective_statement_id IS DISTINCT FROM OLD.effective_statement_id THEN
    RAISE EXCEPTION 'donation % already has an effective statement -- write-once', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_donations_effective_statement_write_once
  BEFORE UPDATE ON donations
  FOR EACH ROW EXECUTE FUNCTION donations_effective_statement_write_once();

-- 5. provider_charged_at -- same write-once pattern, closing the explicit
-- debt flagged when F2's schema (057) shipped without it: once a future
-- CardCom-timestamp adapter sets this the first time, it must never be
-- changed again, even though nothing populates it yet.
CREATE OR REPLACE FUNCTION donations_provider_charged_at_write_once()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.provider_charged_at IS NOT NULL
     AND NEW.provider_charged_at IS DISTINCT FROM OLD.provider_charged_at THEN
    RAISE EXCEPTION 'donation % already has provider_charged_at set -- write-once', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_donations_provider_charged_at_write_once
  BEFORE UPDATE ON donations
  FOR EACH ROW EXECUTE FUNCTION donations_provider_charged_at_write_once();

-- 6. Billing's selection index must exclude already-consumed donations too,
-- keeping it small forever and matching the Calculation Service's actual
-- eligibility predicate exactly.
DROP INDEX IF EXISTS idx_donations_billing_select;
CREATE INDEX IF NOT EXISTS idx_donations_billing_select
  ON donations (entity_id, billing_effective_at)
  WHERE status = 'paid' AND is_mock = false AND effective_statement_id IS NULL;
