-- Detect-only reconciliation output — see
-- docs/CARDCOM_OPERATIONAL_PROCESSES.md (Part B). A finding is a discrepancy
-- or a flagged stale record; writing one never touches donations/campaigns/
-- recurring_instructions itself (Phase 1's policy for this first pass —
-- report, don't auto-repair money). resolved_at is set manually by an admin
-- action or a later job run that no longer finds the same issue.
CREATE TABLE IF NOT EXISTS reconciliation_findings (
  id           SERIAL PRIMARY KEY,
  job_name     TEXT NOT NULL,
  finding_type TEXT NOT NULL,
  severity     TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  subject_type TEXT NOT NULL, -- 'donation' | 'recurring_instruction' | 'campaign' | ...
  subject_id   UUID,
  details      JSONB,
  found_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ,
  resolved_by  TEXT
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_findings_unresolved
  ON reconciliation_findings (job_name, found_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reconciliation_findings_subject
  ON reconciliation_findings (subject_type, subject_id);
