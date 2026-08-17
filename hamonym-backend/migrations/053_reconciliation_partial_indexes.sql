-- Partial indexes for two of the four reconciliation jobs' core queries
-- (Scale Review, 2026-08-16). Chosen empirically, not by default — three
-- candidates were dry-run tested inside rolled-back transactions with
-- EXPLAIN (donations.status alone / composite (status, created_at) / this
-- partial index), comparing plans:
--   plain status            -> Bitmap Heap Scan + separate Sort + Filter
--   composite (status, cat) -> Index Scan, no Sort, but still a Filter for
--                              low_profile_id IS NOT NULL, and indexes every
--                              donation regardless of status
--   this partial index      -> plain ordered Index Scan, no Sort, no Filter
-- A general index on `status` would also carry an entry for every 'paid'/
-- 'failed' donation forever, even though this job only ever reads the
-- always-small 'pending' slice — the partial predicate keeps the index
-- itself small no matter how large `donations` grows.
CREATE INDEX IF NOT EXISTS idx_donations_stale_pending
  ON donations (created_at)
  WHERE status = 'pending' AND low_profile_id IS NOT NULL;

-- Same reasoning for webhook-recovery's query (error IS NOT NULL AND
-- received_at > cutoff ORDER BY received_at LIMIT 50): most webhook events
-- succeed and are never re-examined by this job, so a partial index on just
-- the currently-erroring slice stays small. Confirmed via EXPLAIN with
-- bitmap scan disabled that this index supports a plain ordered Index Scan
-- (no Sort) once the planner isn't biased toward a seq scan by the
-- table's tiny current size.
CREATE INDEX IF NOT EXISTS idx_cardcom_webhook_events_unresolved_errors
  ON cardcom_webhook_events (received_at)
  WHERE error IS NOT NULL;
