-- Generic scheduled-job execution log — not Cardcom-specific, meant to
-- serve any future background job the same way. See
-- docs/CARDCOM_OPERATIONAL_PROCESSES.md (Part F). One row per run, whether
-- triggered by the in-process scheduler or an admin's manual "Run now" —
-- same code path, so there's never drift between the two.
CREATE TABLE IF NOT EXISTS job_runs (
  id             SERIAL PRIMARY KEY,
  job_name       TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'failed', 'skipped_locked')),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at    TIMESTAMPTZ,
  duration_ms    INT,
  result_summary JSONB,
  error          TEXT,
  triggered_by   TEXT NOT NULL DEFAULT 'scheduler'
);

CREATE INDEX IF NOT EXISTS idx_job_runs_job_name_started ON job_runs (job_name, started_at DESC);
