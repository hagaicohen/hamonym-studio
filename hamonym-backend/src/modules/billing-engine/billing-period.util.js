// Shared billing-period date math + find-or-create, used identically by
// both the automatic monthly job (billing-monthly-cycle.job.js) and the
// manual "בחר חודש" Platform Admin action (billing-ops.service.js) --
// 2026-09-13, Billing Ops operator-control hardening. Extracted from
// billing-monthly-cycle.job.js verbatim (behavior-preserving move, not a
// rewrite) specifically so both paths call the exact same functions and
// structurally cannot diverge on what "August 2026" means. Pure date math
// and period bookkeeping only -- no calculation/fee/VAT/eligibility rules
// live here (those stay in calculation.service.js, untouched).

const PERIOD_OVERLAP = '23P01'; // Postgres exclusion_violation

// Calendar-month UTC boundaries, half-open [start, end) -- matches the
// `billing_periods_no_overlap` EXCLUDE USING gist (tstzrange(..., '[)'))
// constraint (migration 054) exactly. month is 1-12 (human-labeled,
// e.g. August = 8); month - 1 = 0 (i.e. "month 0", December of the
// previous year) is intentionally allowed through unchanged -- Date.UTC
// natively normalizes a negative month index by rolling back the year,
// which is exactly how the job computes "previous month" across a
// January -> December year boundary. Verified byte-identical to the
// original job-local computePreviousMonthUtcBoundary() for every tested
// boundary case (including Jan -> Dec of prior year) before this move.
function computeCalendarMonthUtcBoundary(year, month) {
  const zeroBased = month - 1;
  const periodStart = new Date(Date.UTC(year, zeroBased, 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, zeroBased + 1, 1, 0, 0, 0, 0));
  return { periodStart, periodEnd };
}

// Idempotent find-or-create: looks up an exact (period_start, period_end)
// match among non-retired periods before ever inserting; only inserts if
// missing. If a concurrent insert (job vs. manual, or two manual clicks)
// races past the SELECT, the DB's own EXCLUDE constraint rejects the
// second INSERT -- re-select for the real row rather than guessing, and
// surface a loud, distinct error if the overlap is with a period that has
// different bounds (should be structurally impossible given both callers
// compute boundaries via computeCalendarMonthUtcBoundary above, but never
// silently adopt or duplicate in that case).
async function ensurePeriod(db, periodStart, periodEnd) {
  const existing = await db.query(
    `SELECT id FROM billing_periods WHERE period_start = $1 AND period_end = $2 AND retired = false`,
    [periodStart, periodEnd]
  );
  if (existing.rows[0]) {
    return { periodId: existing.rows[0].id, periodCreated: false };
  }

  try {
    const inserted = await db.query(
      `INSERT INTO billing_periods (period_start, period_end) VALUES ($1, $2) RETURNING id`,
      [periodStart, periodEnd]
    );
    return { periodId: inserted.rows[0].id, periodCreated: true };
  } catch (err) {
    if (err.code !== PERIOD_OVERLAP) throw err;
    const retry = await db.query(
      `SELECT id FROM billing_periods WHERE period_start = $1 AND period_end = $2 AND retired = false`,
      [periodStart, periodEnd]
    );
    if (retry.rows[0]) return { periodId: retry.rows[0].id, periodCreated: false };
    const mismatch = new Error(
      `ensurePeriod: an overlapping billing_period with different bounds already exists for ` +
      `${periodStart.toISOString()}..${periodEnd.toISOString()} -- refusing to guess, needs manual review`
    );
    mismatch.code = 'PERIOD_OVERLAP_MISMATCH';
    throw mismatch;
  }
}

module.exports = { computeCalendarMonthUtcBoundary, ensurePeriod };
