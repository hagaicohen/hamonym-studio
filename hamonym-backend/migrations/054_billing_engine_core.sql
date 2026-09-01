-- Billing Engine — Phase 1 (Calculation Core only).
-- docs/HAMONYM_BILLING_ENGINE_TECHNICAL_DESIGN.md — DB Schema v1, Frozen.
-- Deliberately does NOT create routing_decisions/collection_attempts/
-- payments/billing_receipts (Phase 2) — those come after Calculate→
-- Statement is proven correct end-to-end via Dry Run + Finalize.
--
-- NOT RUN YET — presented for review only.

-- ─────────────────────────────────────────────────────────
-- billing_accounts — the billing relationship, entity <-> Hamonym.
-- fee_rate/vat_rate stored as fractions (0.0300 = 3%), NOT NULL with no
-- default — every account must set its own rate explicitly at creation,
-- never inherit a silent global default.
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_accounts (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id                   UUID NOT NULL UNIQUE REFERENCES entities(id),
  fee_rate                    NUMERIC(6,4) NOT NULL,
  vat_rate                    NUMERIC(6,4) NOT NULL,
  preferred_collection_method VARCHAR(10) NOT NULL DEFAULT 'card'
    CHECK (preferred_collection_method IN ('card', 'masav')),
  enforcement_status          VARCHAR(10) NOT NULL DEFAULT 'active'
    CHECK (enforcement_status IN ('active', 'suspended')),
  masav_ceiling                NUMERIC(12,2),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────
-- billing_periods — pure temporal frame, global, shared by every account.
-- No status column (see Technical Design doc: no real business action ever
-- "closes" a period — multiple Billing Runs, dry and production, can
-- legitimately target the same period over time). Immutable from creation.
--
-- The exclusion constraint is the actual DB-level guarantee behind
-- Invariant #4 (every raised component belongs to exactly one period) —
-- Postgres rejects any INSERT/UPDATE whose [period_start,period_end) range
-- overlaps an existing row's range, using the built-in range_ops GiST
-- support (no extension required for a same-type range comparison).
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_periods (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start TIMESTAMPTZ NOT NULL,
  period_end   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end > period_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_periods_bounds
  ON billing_periods (period_start, period_end);

ALTER TABLE billing_periods
  ADD CONSTRAINT billing_periods_no_overlap
  EXCLUDE USING gist (tstzrange(period_start, period_end, '[)') WITH &&);

-- ─────────────────────────────────────────────────────────
-- billing_runs — one concrete execution of the engine against a period.
-- as_of is the asOf/effectiveAt value the whole run reasons from — the
-- engine must never read the wall clock directly, only this column
-- (Testability principle, Technical Design doc).
--
-- result_summary JSONB doubles as Billing Preview's storage for
-- mode='dry_run' runs (same proven pattern as job_runs.result_summary) —
-- deliberately not a separate billing_previews table, so there is no
-- table a Preview could ever be mistaken for or linked from.
--
-- The two-branch CHECK keeps each mode's status vocabulary distinct at the
-- DB level, not just by convention.
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_period_id UUID NOT NULL REFERENCES billing_periods(id),
  mode              VARCHAR(10) NOT NULL CHECK (mode IN ('dry_run', 'production')),
  as_of             TIMESTAMPTZ NOT NULL,
  status            VARCHAR(20) NOT NULL,
  approved_by       BIGINT REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  result_summary    JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (mode = 'dry_run'    AND status IN ('running', 'completed'))
    OR
    (mode = 'production' AND status IN ('draft', 'reviewed', 'approved', 'collection_started', 'completed'))
  )
);

CREATE INDEX IF NOT EXISTS idx_billing_runs_period ON billing_runs (billing_period_id);
CREATE INDEX IF NOT EXISTS idx_billing_runs_mode_status ON billing_runs (mode, status);

-- ─────────────────────────────────────────────────────────
-- statements — the debt. Money fields + fee_rate/vat_rate/billing_period_id/
-- billing_account_id/billing_run_id are frozen forever once status leaves
-- 'draft' (enforced below by trigger, not just documented as a rule).
--
-- billing_period_id has NO application-supplied value — it is populated by
-- the BEFORE INSERT trigger below, copied from the referenced billing_run,
-- specifically so the two columns can never disagree. It still needs to be
-- a real column (not just derivable via JOIN) because the idempotency
-- partial unique index below can't span a join.
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS statements (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_account_id UUID NOT NULL REFERENCES billing_accounts(id),
  billing_period_id  UUID NOT NULL REFERENCES billing_periods(id),
  billing_run_id     UUID NOT NULL REFERENCES billing_runs(id),
  gross_raised       NUMERIC(12,2) NOT NULL,
  fee_rate           NUMERIC(6,4) NOT NULL,
  vat_rate           NUMERIC(6,4) NOT NULL,
  fee_amount         NUMERIC(12,2) NOT NULL,
  vat_amount         NUMERIC(12,2) NOT NULL,
  total_due          NUMERIC(12,2) NOT NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'finalized', 'open', 'paid', 'cancelled', 'written_off')),
  finalized_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (total_due = fee_amount + vat_amount)
);

-- Idempotency (Invariant #1) — at most one non-draft Statement per
-- (Billing Account, Billing Period), atomically enforced by Postgres even
-- under two racing transactions. Same proven idiom as
-- idx_reconciliation_findings_open_unique (migration 052).
CREATE UNIQUE INDEX IF NOT EXISTS idx_statements_final_per_account_period
  ON statements (billing_account_id, billing_period_id)
  WHERE status != 'draft';

CREATE INDEX IF NOT EXISTS idx_statements_account ON statements (billing_account_id);
CREATE INDEX IF NOT EXISTS idx_statements_period ON statements (billing_period_id);

-- Enforces: a Statement can only be created from a PRODUCTION billing_run
-- (a partial-unique-index FK target doesn't exist in Postgres — UNIQUE
-- CONSTRAINTs can't carry a WHERE clause, and FK requires a real
-- constraint, not just any unique index — hence a trigger instead).
-- Also derives billing_period_id from the run, so the app never supplies
-- it directly and the two columns can't drift apart.
CREATE OR REPLACE FUNCTION billing_statements_enforce_production_run()
RETURNS TRIGGER AS $$
DECLARE
  run_mode      VARCHAR(10);
  run_period_id UUID;
BEGIN
  SELECT mode, billing_period_id INTO run_mode, run_period_id
  FROM billing_runs WHERE id = NEW.billing_run_id;

  IF run_mode IS NULL THEN
    RAISE EXCEPTION 'billing_run_id % does not exist', NEW.billing_run_id;
  END IF;

  IF run_mode != 'production' THEN
    RAISE EXCEPTION 'statements can only be created from a production billing_run (got mode=%)', run_mode;
  END IF;

  NEW.billing_period_id := run_period_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_statements_enforce_production_run
  BEFORE INSERT ON statements
  FOR EACH ROW EXECUTE FUNCTION billing_statements_enforce_production_run();

-- Enforces: once status leaves 'draft', the money/rate/linkage fields
-- freeze forever (Invariant #5). status itself, and any future non-money
-- column, may still change.
CREATE OR REPLACE FUNCTION billing_statements_enforce_immutability()
RETURNS TRIGGER AS $$
BEGIN
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

CREATE TRIGGER trg_statements_enforce_immutability
  BEFORE UPDATE ON statements
  FOR EACH ROW EXECUTE FUNCTION billing_statements_enforce_immutability();

-- ─────────────────────────────────────────────────────────
-- statement_components — Invariant #8 (immutable traceability). The
-- historical explanation of a Statement's gross_raised comes from
-- amount_snapshot/completed_at_snapshot, copied at Finalize time — NOT
-- from re-reading donations. donation_id stays as an FK purely for
-- support/investigation convenience (jump to the original record); it is
-- never the source of the historical numbers.
--
-- ON DELETE RESTRICT — a donation can never be silently deleted out from
-- under a Statement that already explains itself through it.
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS statement_components (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id          UUID NOT NULL REFERENCES statements(id),
  donation_id           UUID NOT NULL REFERENCES donations(id) ON DELETE RESTRICT,
  amount_snapshot       NUMERIC(10,2) NOT NULL,
  completed_at_snapshot TIMESTAMPTZ NOT NULL,
  origin_type           VARCHAR(20) NOT NULL
    CHECK (origin_type IN ('card_onetime', 'recurring_charge', 'manual_entry')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (statement_id, donation_id)
);

CREATE INDEX IF NOT EXISTS idx_statement_components_statement ON statement_components (statement_id);
CREATE INDEX IF NOT EXISTS idx_statement_components_donation ON statement_components (donation_id);

-- Append-only at the DB level, not just by convention — once a component
-- is linked to a finalized Statement it must never change or disappear.
CREATE OR REPLACE FUNCTION billing_statement_components_block_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'statement_components is append-only — % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_statement_components_no_update
  BEFORE UPDATE ON statement_components
  FOR EACH ROW EXECUTE FUNCTION billing_statement_components_block_mutation();

CREATE TRIGGER trg_statement_components_no_delete
  BEFORE DELETE ON statement_components
  FOR EACH ROW EXECUTE FUNCTION billing_statement_components_block_mutation();

-- ─────────────────────────────────────────────────────────
-- Select-stage index on the existing donations table — not a new domain
-- table, but required for Billing's core query to be fast at scale.
-- Partial (status='paid' AND is_mock=false only), matching the existing
-- idx_donations_stale_pending idiom in this codebase (migration 053):
-- keeps the index small regardless of how many failed/pending/mock rows
-- accumulate, since Billing only ever reads the paid-and-real slice.
-- ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_donations_billing_select
  ON donations (entity_id, completed_at)
  WHERE status = 'paid' AND is_mock = false;
