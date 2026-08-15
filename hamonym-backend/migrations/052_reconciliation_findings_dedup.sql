-- Dedup for reconciliation_findings (docs/CARDCOM_OPERATIONAL_PROCESSES.md,
-- Operational Policy 2026-08-16). Every detect-only job so far INSERTed a
-- fresh row on every run for the same still-open problem — confirmed
-- duplicate rows in practice during the previous session's manual testing.
-- Before running jobs on any real schedule, "still the same open problem"
-- must update one row, not create a new one.
--
-- last_seen_at tracks "still true as of this run" without disturbing
-- found_at, which stays the honest "first detected" timestamp for the
-- lifetime of one open finding.
ALTER TABLE reconciliation_findings ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE reconciliation_findings SET last_seen_at = found_at WHERE last_seen_at IS DISTINCT FROM found_at;

-- At most one OPEN (resolved_at IS NULL) finding per
-- (job_name, finding_type, subject_type, subject_id) — a partial unique
-- index, not just application-level care, so two job runs racing each
-- other (scheduler tick + admin "Run now") can never create two open rows
-- for the same subject; Postgres's ON CONFLICT handles the race atomically.
--
-- Recurrence policy (explicit, 2026-08-16): once a finding is resolved
-- (system auto-resolve or admin action), the partial index no longer
-- covers that row, so if the same problem reappears later it gets a NEW
-- finding row rather than reopening the old one. found_at/resolved_at on
-- the old row stay an accurate record of that specific incident's
-- lifetime — reopening it would blur "when did THIS occurrence start".
CREATE UNIQUE INDEX IF NOT EXISTS idx_reconciliation_findings_open_unique
  ON reconciliation_findings (job_name, finding_type, subject_type, subject_id)
  WHERE resolved_at IS NULL;
