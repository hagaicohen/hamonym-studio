-- billing_periods.retired -- reopens the 054 design decision "no status
-- column, immutable, no real business action ever closes a period"
-- (docs/HAMONYM_BILLING_ENGINE_SPEC.md / BILLING_ENGINE_SESSION_HANDOFF).
-- Approved explicitly (2026-09-02, live-smoke-test session) rather than
-- silently overridden: the three billing_periods rows created by an
-- earlier collection-engine test harness (2026-08-28) are sub-second
-- slivers that overlap real August 2026 and block creating it -- see the
-- test-residue investigation the same session ran first (entities named
-- ZZZ_TEST_DATA_DO_NOT_USE, statement_components empty for all three, so
-- no real donation backs any of their amounts).
--
-- retired only ever gates the overlap EXCLUDE below -- nothing in
-- routing.js/collection.service.js/masav-collection.service.js reads
-- billing_period_id at all (verified before writing this migration), so
-- this column has no effect on any Statement/Payment/Collection path.
-- Retiring a period does not touch payments (append-only, migration 059),
-- statements (frozen once non-draft, migrations 054/058), or
-- statement_components (append-only, migration 054) in any way.

ALTER TABLE billing_periods ADD COLUMN IF NOT EXISTS retired BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE billing_periods DROP CONSTRAINT IF EXISTS billing_periods_no_overlap;

ALTER TABLE billing_periods
  ADD CONSTRAINT billing_periods_no_overlap
  EXCLUDE USING gist (tstzrange(period_start, period_end, '[)') WITH &&)
  WHERE (NOT retired);
