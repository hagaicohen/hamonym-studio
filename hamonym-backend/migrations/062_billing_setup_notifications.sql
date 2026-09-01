-- Billing setup notification dedup (2026-09-02) — part of the Billing
-- readiness correction: donation activity discovered for an entity with a
-- missing/suspended billing_account must be reported to Billing Ops AND the
-- entity administrator notified, without ever repeating the same
-- notification on every Production Calculation rerun.
--
-- Deliberately its own table, not reconciliation_findings (migration
-- 052/reconciliation-findings.js): that table's dedup key has no period
-- dimension (job_name, finding_type, subject_type, subject_id only), so a
-- "blocked in August" condition could never be distinguished from "blocked
-- in September" — both would collide on the same open row. This table is
-- insert-once, not open/resolve — a notification either was already sent
-- for this exact (entity, period, reason) or it wasn't; there is no
-- "reopen" verb because the underlying fact (a past calculation run found
-- this entity blocked for this reason, on this date) never stops being
-- true, unlike a reconciliation finding that gets fixed and can recur.
CREATE TABLE IF NOT EXISTS billing_setup_notifications (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id            UUID NOT NULL REFERENCES entities(id),
  billing_period_id    UUID NOT NULL REFERENCES billing_periods(id),
  blocking_reason      VARCHAR(30) NOT NULL
    CHECK (blocking_reason IN ('no_billing_account', 'account_suspended')),
  -- Snapshot at notify time, for support/audit visibility only — never read
  -- back to decide anything; the dedup guarantee is the UNIQUE index below,
  -- not these values.
  donation_count       INT NOT NULL,
  gross_amount         NUMERIC(12,2) NOT NULL,
  notified_admin_count INT NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_id, billing_period_id, blocking_reason)
);

CREATE INDEX IF NOT EXISTS idx_billing_setup_notifications_entity ON billing_setup_notifications (entity_id);
CREATE INDEX IF NOT EXISTS idx_billing_setup_notifications_period ON billing_setup_notifications (billing_period_id);
