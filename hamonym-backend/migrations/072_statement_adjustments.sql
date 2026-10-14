-- Statement Adjustments (2026-10, FIN — statement correction design).
-- Append-only ledger for correcting an approved Statement WITHOUT ever
-- mutating statements.total_due or any statement_components row (both
-- frozen by migration 054/058's existing immutability triggers, by design).
-- A correction is a new signed row, never an edit of an old one — a
-- mistaken adjustment is offset by a second row, not changed in place.
-- Same append-only idiom as statement_components (054) and payments (059).
--
-- Deliberately no FK to donations/statement_components: an adjustment is a
-- statement-level correction (a fee error, a negotiated credit), not tied
-- to one specific donation. Keeps this table independent of the donation-
-- level write-once rules entirely.
--
-- This migration adds ONLY the table -- no change to statements.status
-- transitions, no change to collection/routing logic, no API route. Wiring
-- getStatementBalance() into collection happens in a later, separate step.
CREATE TABLE IF NOT EXISTS statement_adjustments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id        UUID NOT NULL REFERENCES statements(id),
  delta_amount        NUMERIC(12,2) NOT NULL,
  reason              TEXT NOT NULL,
  created_by_user_id  BIGINT NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_statement_adjustments_statement ON statement_adjustments (statement_id);

CREATE OR REPLACE FUNCTION statement_adjustments_block_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'statement_adjustments is append-only — % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_statement_adjustments_no_update
  BEFORE UPDATE ON statement_adjustments
  FOR EACH ROW EXECUTE FUNCTION statement_adjustments_block_mutation();

CREATE TRIGGER trg_statement_adjustments_no_delete
  BEFORE DELETE ON statement_adjustments
  FOR EACH ROW EXECUTE FUNCTION statement_adjustments_block_mutation();
