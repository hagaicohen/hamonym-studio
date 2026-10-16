-- FIN-11 Stage 3 — Complementary MASAV collection proposals (2026-10).
-- docs/finance/FIN11_STAGE3_TECHNICAL_DESIGN.md has the full design. NOT
-- APPLIED to any shared/production database by this change -- prepared
-- and tested only (inside rollback-only transactions). Run via
-- scripts/migrate-074.js once approved.
--
-- This table is DELIBERATELY SEPARATE from collection_attempts -- it does
-- not reuse the old masav_collection.service.js#openMasavAttempt mechanism
-- (collection_attempts with collection_method='masav', pending forever per
-- the 2026-09-01 V1 boundary decision) at all. That old mechanism exists
-- for the OLD binary routing model (masav instead of card, above a
-- threshold) and is left completely untouched. This is a NEW, parallel
-- concept: one row per computed MASAV collection PROPOSAL for a Statement,
-- with its own explicit approve/export lifecycle, following the exact
-- same pattern Stage 2A/2B already established (a new isolated mechanism
-- alongside the old one, never modifying it).
CREATE TABLE IF NOT EXISTS masav_collection_proposals (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id            UUID NOT NULL REFERENCES statements(id),
  entity_id               UUID NOT NULL REFERENCES entities(id),
  -- Frozen facts about THIS proposal, computed once at prepare time from
  -- getStatementBalance() -- never a fixed "total minus card cap"
  -- assumption (rule A). A later change in the Statement's real balance
  -- does not rewrite this row -- it supersedes it (see `status` below) and
  -- a fresh proposal must be prepared.
  proposed_amount         NUMERIC(12,2) NOT NULL CHECK (proposed_amount > 0),
  outstanding_at_proposal NUMERIC(12,2) NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Mutable lifecycle. 'proposed' = freshly computed, awaiting Super Admin
  -- review (the only way a row is ever created). 'approved' = Super Admin
  -- explicitly approved it for export (re-verified fresh at that instant --
  -- see the service). 'exported' = included in a real export file --
  -- terminal from THIS system's own responsibility boundary (matches the
  -- existing, unchanged V1 MASAV boundary: Hamonym's job ends at export,
  -- see masav-collection.service.js's own header comment). 'superseded' =
  -- a newer proposal was prepared for the same Statement because the
  -- balance/eligibility changed -- this row is kept forever for audit,
  -- never deleted. 'cancelled' = a Super Admin explicitly rejected this
  -- specific proposal (e.g. determined it should not be collected).
  status                  VARCHAR(20) NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'exported', 'superseded', 'cancelled')),
  status_reason           TEXT,
  approved_at             TIMESTAMPTZ,
  approved_by_user_id     BIGINT,
  exported_at             TIMESTAMPTZ,
  exported_by_user_id     BIGINT
);

-- Duplicate-prevention + idempotency, the same way ACTIVE_ATTEMPT_STATUSES
-- prevents two simultaneous collection_attempts on one Statement: at most
-- ONE active (proposed or approved) proposal per Statement at any time.
-- A second prepare on an already-active proposal is a safe no-op/refresh,
-- never a duplicate row; an export can only ever happen from exactly one
-- 'approved' row per Statement, enforced structurally, not just by
-- application logic.
CREATE UNIQUE INDEX IF NOT EXISTS idx_masav_proposals_active_per_statement
  ON masav_collection_proposals (statement_id)
  WHERE status IN ('proposed', 'approved');

CREATE INDEX IF NOT EXISTS idx_masav_proposals_entity ON masav_collection_proposals (entity_id);
CREATE INDEX IF NOT EXISTS idx_masav_proposals_status ON masav_collection_proposals (status);

-- Frozen facts (statement_id/entity_id/proposed_amount/outstanding_at_
-- proposal/created_at) can never change once written -- only the
-- lifecycle fields can. Same enforcement style as
-- trg_payment_exceptions_enforce_immutable_facts (migration 073).
CREATE OR REPLACE FUNCTION masav_proposals_enforce_immutable_facts()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.statement_id IS DISTINCT FROM OLD.statement_id
     OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
     OR NEW.proposed_amount IS DISTINCT FROM OLD.proposed_amount
     OR NEW.outstanding_at_proposal IS DISTINCT FROM OLD.outstanding_at_proposal
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'masav_collection_proposals %: only lifecycle fields (status/approved_*/exported_*/status_reason) may ever be updated', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_masav_proposals_enforce_immutable_facts
  BEFORE UPDATE ON masav_collection_proposals
  FOR EACH ROW EXECUTE FUNCTION masav_proposals_enforce_immutable_facts();
