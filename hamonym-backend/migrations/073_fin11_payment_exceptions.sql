-- FIN-11 Stage 2B — Overpayment exception tracking (2026-10).
-- docs/finance/FIN11_STAGE2B_TECHNICAL_DESIGN.md has the full design and
-- rationale. NOT APPLIED to any shared/production database by this
-- change -- prepared and tested only (inside rollback-only transactions),
-- per the explicit instruction not to apply a new migration without
-- separate approval. Run via scripts/migrate-073.js once approved.
--
-- Two tables, same append-only-detection / append-only-action-log pattern
-- already used by statement_adjustments (migration 072):
--   payment_exceptions        -- one row per DETECTED overpayment event.
--                                 status/hold_new_collection are the only
--                                 mutable fields (current lifecycle state);
--                                 everything else is a frozen fact about
--                                 the detection itself, never rewritten.
--   payment_exception_actions -- append-only audit trail of every
--                                 Super Admin action taken against an
--                                 exception (hold override, resolution).
--                                 Never updated or deleted, same as
--                                 statement_adjustments.

CREATE TABLE IF NOT EXISTS payment_exceptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id        UUID NOT NULL REFERENCES statements(id),
  collection_attempt_id UUID NOT NULL REFERENCES collection_attempts(id),
  payment_id          UUID NOT NULL REFERENCES payments(id),
  -- Denormalized from statements->billing_accounts->entities: the hold
  -- (rule 4.9, FIN-11 decisions) is enforced per-ENTITY across all of its
  -- Statements, not just this one -- openAttempt's hold-check runs on
  -- every collection attempt open, so this must be a cheap direct column,
  -- not a 3-table join repeated on every call.
  entity_id           UUID NOT NULL REFERENCES entities(id),
  -- Frozen facts about the detection itself -- never rewritten once
  -- written. collected_amount is the FULL verified amount actually
  -- recorded in `payments` for this event (never clamped -- rule A).
  outstanding_before  NUMERIC(12,2) NOT NULL,
  collected_amount    NUMERIC(12,2) NOT NULL,
  overpayment_amount  NUMERIC(12,2) NOT NULL CHECK (overpayment_amount > 0),
  detected_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Mutable lifecycle state. 'open' = awaiting Super Admin review (the
  -- default, set the instant an overpayment is detected -- never created
  -- any other way). 'resolved' = a resolution decision has been recorded
  -- (see payment_exception_actions) -- this is a BOOKKEEPING closure, it
  -- does NOT assert that a refund/credit was actually executed; no such
  -- execution mechanism exists yet (see the technical design doc).
  status              VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved')),
  -- Rule 4.9: new platform-fee collection from this ENTITY is held the
  -- instant this row is created (default true). Rule 4.10: a Super Admin
  -- may explicitly lift the hold BEFORE final resolution, with a recorded
  -- reason (payment_exception_actions, action_type='override_hold') --
  -- that action flips this to false without touching `status`.
  hold_new_collection BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_exceptions_entity_open
  ON payment_exceptions (entity_id)
  WHERE status = 'open' AND hold_new_collection = true;

CREATE INDEX IF NOT EXISTS idx_payment_exceptions_statement
  ON payment_exceptions (statement_id);

-- status/hold_new_collection are the ONLY columns ever updated on this
-- table -- every other column is a frozen fact about the detection event.
-- Enforced the same way trg_statements_enforce_immutability enforces its
-- own frozen columns (migration 054), not by convention alone.
CREATE OR REPLACE FUNCTION payment_exceptions_enforce_immutable_facts()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.statement_id IS DISTINCT FROM OLD.statement_id
     OR NEW.collection_attempt_id IS DISTINCT FROM OLD.collection_attempt_id
     OR NEW.payment_id IS DISTINCT FROM OLD.payment_id
     OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
     OR NEW.outstanding_before IS DISTINCT FROM OLD.outstanding_before
     OR NEW.collected_amount IS DISTINCT FROM OLD.collected_amount
     OR NEW.overpayment_amount IS DISTINCT FROM OLD.overpayment_amount
     OR NEW.detected_at IS DISTINCT FROM OLD.detected_at
  THEN
    RAISE EXCEPTION 'payment_exceptions %: only status/hold_new_collection may ever be updated', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_exceptions_enforce_immutable_facts
  BEFORE UPDATE ON payment_exceptions
  FOR EACH ROW EXECUTE FUNCTION payment_exceptions_enforce_immutable_facts();

CREATE TABLE IF NOT EXISTS payment_exception_actions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_id        UUID NOT NULL REFERENCES payment_exceptions(id),
  -- 'override_hold'  -- rule 4.10, lifts hold_new_collection without resolving.
  -- 'resolve_refund' / 'resolve_credit' / 'resolve_no_overpayment' --
  --   records WHICH resolution a Super Admin selected. This is a DECISION
  --   record only -- it never asserts that a refund/credit was actually
  --   paid out; no execution mechanism exists (see the technical design
  --   doc's explicit limitation). 'resolve_no_overpayment' is the
  --   administrative-closure path: investigation established the
  --   detection was a false positive.
  action_type         VARCHAR(30) NOT NULL
    CHECK (action_type IN ('override_hold', 'resolve_refund', 'resolve_credit', 'resolve_no_overpayment')),
  super_admin_user_id BIGINT NOT NULL,
  reason              TEXT NOT NULL,
  evidence_notes      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_exception_actions_exception
  ON payment_exception_actions (exception_id);

CREATE OR REPLACE FUNCTION payment_exception_actions_block_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'payment_exception_actions is append-only — % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_exception_actions_no_update
  BEFORE UPDATE ON payment_exception_actions
  FOR EACH ROW EXECUTE FUNCTION payment_exception_actions_block_mutation();

CREATE TRIGGER trg_payment_exception_actions_no_delete
  BEFORE DELETE ON payment_exception_actions
  FOR EACH ROW EXECUTE FUNCTION payment_exception_actions_block_mutation();
