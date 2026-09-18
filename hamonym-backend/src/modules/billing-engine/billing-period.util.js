// Shared billing-period date math + find-or-create, used identically by
// both the automatic monthly job (billing-monthly-cycle.job.js) and the
// manual "בחר חודש" Platform Admin action (billing-ops.service.js) --
// 2026-09-13, Billing Ops operator-control hardening. Extracted from
// billing-monthly-cycle.job.js verbatim (behavior-preserving move, not a
// rewrite) specifically so both paths call the exact same functions and
// structurally cannot diverge on what "August 2026" means. Pure date math
// and period bookkeeping only -- no calculation/fee/VAT/eligibility rules
// live here (those stay in calculation.service.js, untouched).
//
// 2026-09-18 -- 28->28 restoration. The frozen business rule (see
// docs/HAMONYM_BILLING_ENGINE_SPEC.md / HAMONYM_BILLING_ENGINE_TECHNICAL_
// DESIGN.md, both 2026-08-20) is a rolling cutoff -- [28th 20:00 Israel,
// next 28th 20:00 Israel) -- not a full calendar month. The implementation
// had drifted to calendar months (an undocumented simplification, never a
// deliberate spec change); this restores the frozen model.
// `computeCalendarMonthUtcBoundary` is KEPT, unchanged, forever: every
// real historical billing_period through September 2026 is genuinely
// calendar-month-shaped, immutable financial history that must keep
// displaying/behaving correctly. It is simply no longer used to create
// NEW periods going forward -- see `computeCycleBoundary` below.

const PERIOD_OVERLAP = '23P01'; // Postgres exclusion_violation

function computeCalendarMonthUtcBoundary(year, month) {
  const zeroBased = month - 1;
  const periodStart = new Date(Date.UTC(year, zeroBased, 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, zeroBased + 1, 1, 0, 0, 0, 0));
  return { periodStart, periodEnd };
}

// The exact UTC instant for "28th of {year}-{month}, 20:00 Israel time" --
// via Postgres's own tzdata (AT TIME ZONE), the only DST-correct way to do
// this without adding a timezone library. Node's Intl can format a Date
// INTO a zone but not build one FROM a zone's wall-clock time, and this
// exact `... AT TIME ZONE 'Asia/Jerusalem'` pattern is already proven in
// production (dashboard.service.js). Verified directly against the real
// DB for both DST (Aug: UTC+3) and standard time (Jan/Oct/Dec: UTC+2)
// before this shipped -- never assumed.
async function computeIsraeliCutoffUtcInstant(db, year, month) {
  const res = await db.query(
    `SELECT (make_date($1::int, $2::int, 28) + TIME '20:00') AT TIME ZONE 'Asia/Jerusalem' AS cutoff`,
    [year, month]
  );
  return new Date(res.rows[0].cutoff);
}

// The ONE isolated, explicitly-documented transition exception in the
// entire boundary model (2026-09-18 restoration) -- every other month,
// past or future, falls through to the general 28->28 formula below.
// "Selecting October 2026" (the cycle ending in October) must resolve to
// the one-time bridge interval, not a normal 28->28 window: the last real
// old-model period (September 2026, calendar-month-shaped) already ends
// at exactly 2026-10-01T00:00:00Z, so the bridge has to start there --
// starting it at "28 September 20:00 Israel" instead would either
// overlap September's real period or leave a gap, depending on which side
// of Sep 28 you'd naively pick. This is looked up by exact (year, month)
// key, never a date-range check, so it can never accidentally match
// anything else.
const TRANSITION_OVERRIDE = {
  '2026-10': { periodStart: new Date('2026-10-01T00:00:00.000Z') },
};

// The 28->28 cycle whose CUTOFF (period_end) falls in {year}-{month} --
// i.e. "the cycle the operator means by selecting this month" (frozen
// decision: the operator keeps picking a month; internally it resolves to
// the cycle ending in it). periodEnd is always the real 28th-20:00-Israel
// instant for that month. periodStart is the previous month's own
// 28th-20:00-Israel instant, UNLESS the transition override above applies.
async function computeCycleBoundary(db, year, month) {
  const periodEnd = await computeIsraeliCutoffUtcInstant(db, year, month);
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const override = TRANSITION_OVERRIDE[key];
  if (override) {
    return { periodStart: override.periodStart, periodEnd };
  }
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const periodStart = await computeIsraeliCutoffUtcInstant(db, prevYear, prevMonth);
  return { periodStart, periodEnd };
}

// The single place that decides "old calendar-month model, or new 28->28
// model" for an operator-selected (year, month) -- used by BOTH manual
// "בחר חודש" period creation and the "כל החיובים" month filter, so they
// can never diverge on which model applies to a given month. Real history
// through September 2026 is calendar-month-shaped and must resolve that
// way forever (selecting "August 2026" must keep finding the real,
// immutable August billing_period, never a mismatched new-shaped one);
// October 2026 onward resolves through computeCycleBoundary (which itself
// applies the one transition override, above, only for October).
const LAST_CALENDAR_MONTH_MODEL_MONTH = { year: 2026, month: 9 }; // September 2026
function isBeforeCycleModel(year, month) {
  return year < LAST_CALENDAR_MONTH_MODEL_MONTH.year
    || (year === LAST_CALENDAR_MONTH_MODEL_MONTH.year && month <= LAST_CALENDAR_MONTH_MODEL_MONTH.month);
}
async function resolveSelectedMonthBoundary(db, year, month) {
  if (isBeforeCycleModel(year, month)) {
    return computeCalendarMonthUtcBoundary(year, month);
  }
  return computeCycleBoundary(db, year, month);
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

module.exports = {
  computeCalendarMonthUtcBoundary,
  computeIsraeliCutoffUtcInstant,
  computeCycleBoundary,
  resolveSelectedMonthBoundary,
  isBeforeCycleModel,
  ensurePeriod,
};
