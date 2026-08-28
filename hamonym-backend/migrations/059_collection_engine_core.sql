-- Collection Engine — core schema (2026-08-28).
-- docs/HAMONYM_COLLECTION_ENGINE_DESIGN_2026-08-28.md — design draft, sections 3-4.
-- Covers only what's needed for the domain/state-machine to exist and be
-- testable against a mock adapter: collection_attempts + payments.
-- billing_receipts is deliberately NOT created here -- the design doc
-- explicitly deferred it (unverified document/numbering requirements), and
-- nothing in this migration or the code built on it depends on it existing.
--
-- NOT RUN YET — presented for review only.

-- ─────────────────────────────────────────────────────────
-- collection_attempts — one row per actual attempt to collect a Statement's
-- total_due. attempt_number (not "latest row wins") makes "which attempt is
-- the active one" an atomic, race-free question under concurrent workers —
-- see the Router's own locking (collection.service.js).
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS collection_attempts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id        UUID NOT NULL REFERENCES statements(id),
  collection_method   VARCHAR(10) NOT NULL CHECK (collection_method IN ('card', 'masav')),
  attempt_number      INT NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'declined', 'technical_failure', 'ambiguous')),
  provider            VARCHAR(20) NOT NULL DEFAULT 'cardcom',
  provider_reference  TEXT,
  provider_raw_status TEXT,
  failure_reason      TEXT,
  requested_amount    NUMERIC(12,2) NOT NULL,
  initiated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (statement_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_collection_attempts_statement ON collection_attempts (statement_id);
-- Router's own pre-check ("is there already an active attempt on this
-- statement?") and the reconciliation job's "stuck" scan both filter on
-- this exact predicate.
CREATE INDEX IF NOT EXISTS idx_collection_attempts_active
  ON collection_attempts (statement_id)
  WHERE status IN ('pending', 'ambiguous');

-- provider_reference is set at most once, same write-once idiom as
-- donations.provider_charged_at (058) -- it's the one fact that proves a
-- provider-side event actually happened, once known it must never change.
CREATE OR REPLACE FUNCTION collection_attempts_provider_reference_write_once()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.provider_reference IS NOT NULL
     AND NEW.provider_reference IS DISTINCT FROM OLD.provider_reference THEN
    RAISE EXCEPTION 'collection_attempt % already has provider_reference set -- write-once', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_collection_attempts_provider_reference_write_once
  BEFORE UPDATE ON collection_attempts
  FOR EACH ROW EXECUTE FUNCTION collection_attempts_provider_reference_write_once();

-- ─────────────────────────────────────────────────────────
-- payments — the financial fact. Append-only forever (same idiom as
-- statement_components, 054) -- a payment is proof money moved, never
-- edited or removed once written. 1:1 with the collection_attempt that
-- produced it; a Statement can accumulate more than one payment only if a
-- deliberate partial-collection scheme is ever designed (not today -- see
-- the design doc's section 4 on open -> paid).
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id          UUID NOT NULL REFERENCES statements(id),
  collection_attempt_id UUID NOT NULL UNIQUE REFERENCES collection_attempts(id),
  amount                NUMERIC(12,2) NOT NULL,
  provider              VARCHAR(20) NOT NULL,
  provider_reference    TEXT NOT NULL,
  received_at           TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_reference)
);

CREATE INDEX IF NOT EXISTS idx_payments_statement ON payments (statement_id);

CREATE OR REPLACE FUNCTION payments_block_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'payments is append-only — % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payments_no_update
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_block_mutation();

CREATE TRIGGER trg_payments_no_delete
  BEFORE DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_block_mutation();
