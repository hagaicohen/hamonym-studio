// Billing Monthly Cycle v1 (2026-09-08; restored to the frozen 28->28
// cutoff model 2026-09-18) -- the automated entry point for Billing's
// cutoff step: ensure a billing_period exists for the most recently-passed
// 28th-20:00-Israel-time cutoff, then run production calculation against
// it exactly once. Everything after that -- Statement approval, CARD
// collection, MASAV export/submission -- stays a deliberate, manual Super
// Admin action; this job never calls any of those services, so it is
// structurally incapable of approving anything, collecting anything, or
// creating a Payment. See docs/HAMONYM_BILLING_ENGINE_SPEC.md and the
// 2026-09-07 Billing v1 Operational Cycle Audit for why this is the
// smallest automation that removes the two most fragile "operator has to
// remember" steps (create the period, run Calculate) without touching the
// approval boundary.
//
// Reuses calculation.service.js#runProductionCalculation verbatim -- no
// financial logic is reimplemented here. Deliberately does NOT call
// billing-ops.service.js#createPeriod/calculatePeriod (the human-triggered,
// audit-logged wrappers used by the Super Admin UI): platform_audit_log.
// super_admin_user_id is BIGINT NOT NULL REFERENCES users(id) (migration
// 012), so those wrappers structurally cannot be called by an unattended
// job without inventing a fake "system" super admin user -- which would
// misrepresent an automated action as a human one in an audit trail whose
// entire purpose is tracking real admin decisions. This job's own
// job_runs.result_summary is the correct, already-established audit trail
// for automated actions, same as every other job in this directory.
//
// Idempotency (mandatory -- see the 2026-09-08 brief). Safe to run any
// number of times, including via Admin "Run now" while the Render Cron is
// also ticking (job-runner.js's advisory lock already serializes that):
//   - Period: looked up by exact (period_start, period_end) match among
//     non-retired periods before ever inserting; only inserted if missing.
//   - Calculation: only ever invoked if this period has ZERO billing_runs
//     so far. Calling runProductionCalculation twice on the same period is
//     NOT safe on its own -- a donation still eligible after an earlier,
//     still-unapproved draft Statement (see calculation.service.js's own
//     header comment: eligibility is effective_statement_id IS NULL, not
//     "not already in some statement_components row") would be pulled into
//     a SECOND draft Statement, double-listing it. The Super Admin UI
//     guards this with a confirm dialog; an unattended caller has no dialog
//     to show, so this job supplies its own guard instead: skip
//     calculation entirely if a billing_run already exists, whether that
//     run was created by this job or by a human.
//   - Never approves, never collects, never touches MASAV, never creates a
//     Payment -- structurally impossible, since this job never calls any of
//     those services.
const calculation = require('../modules/billing-engine/calculation.service');
const { resolveSelectedMonthBoundary, ensurePeriod } = require('../modules/billing-engine/billing-period.util');

// The cycle whose cutoff has MOST RECENTLY passed, at-or-before `now` --
// the correct target for a real 20:00-Israel-time cutoff run (2026-09-18
// 28->28 restoration). The scheduler itself only knows "day 28, UTC, some
// hour" (see `schedule` below) -- it cannot know the exact DST-dependent
// cutoff instant, so the job checks every hour on that day and the real
// decision of "has the cutoff actually happened yet" lives here, in
// business logic, via resolveSelectedMonthBoundary's own Postgres-backed
// Asia/Jerusalem conversion. Tries THIS calendar month's cycle first; if
// its own cutoff (periodEnd) is still in the future relative to `now`, the
// cutoff hasn't happened yet this month, so falls back to the PREVIOUS
// cycle instead (normally already ensured+calculated by an earlier hourly
// check the same day -- a safety-net no-op, not the primary path). This
// is what makes an early-in-the-day check (e.g. 03:00 UTC on the 28th,
// hours before the real 17:00/18:00 UTC cutoff) a harmless no-op instead
// of prematurely closing a cycle that hasn't finished yet.
async function computeMostRecentCycleBoundary(db, now) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const thisCycle = await resolveSelectedMonthBoundary(db, year, month);
  if (thisCycle.periodEnd.getTime() <= now.getTime()) {
    return thisCycle;
  }
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return resolveSelectedMonthBoundary(db, prevYear, prevMonth);
}

// `now` is injectable (defaults to the real clock) so
// scripts/test-billing-monthly-cycle.js can target a fixed, far-future
// fixture month instead of racing whatever real billing_periods already
// exist in production -- job-runner.js still calls `job.handler(db)` with
// a single argument in production, so this default is what actually runs
// on a real schedule tick.
async function handler(db, { now = new Date() } = {}) {
  const { periodStart, periodEnd } = await computeMostRecentCycleBoundary(db, now);

  const { periodId, periodCreated } = await ensurePeriod(db, periodStart, periodEnd);

  const existingRun = await db.query(
    `SELECT id FROM billing_runs WHERE billing_period_id = $1 LIMIT 1`,
    [periodId]
  );

  if (existingRun.rows[0]) {
    return {
      periodId,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      periodCreated,
      calculationRan: false,
      reason: 'already_calculated',
      existingRunId: existingRun.rows[0].id,
    };
  }

  const result = await calculation.runProductionCalculation(periodId, now.toISOString());

  return {
    periodId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    periodCreated,
    calculationRan: true,
    billingRunId: result.billingRunId,
    accountsEvaluated: result.accountsEvaluated,
    statementsCreated: result.statementsCreated,
    blockedEntitiesCount: result.blockedEntities.length,
    activityDiscovered: result.activityDiscovered,
  };
}

module.exports = {
  name: 'billing-monthly-cycle',
  // Every hour, but only on UTC day-of-month 28 (2026-09-18 28->28
  // restoration; was '0 3 1 * *', calendar-month model). schedule-window.js's
  // matcher (cronMatches) is UTC-only with no timezone concept -- it can
  // only ever express "day 28, some UTC hour", never "20:00 Israel time"
  // directly. The real cutoff (17:00 UTC in DST, 18:00 UTC in standard
  // time -- verified against the real DB, never assumed) always falls
  // safely inside UTC day 28 in both seasons, so checking every hour that
  // day and letting computeMostRecentCycleBoundary decide the real instant
  // is the smallest reliable fix -- no rewrite of the cron matcher, no new
  // timezone library, same idempotent-run pattern as before. Costs 24
  // cheap idempotent checks/month instead of 1; the existing 40-day
  // schedule-window lookback already comfortably covers the largest gap
  // between two day-28 matches (under 31 days), so no change needed there.
  schedule: '0 * 28 * *',
  timeoutMs: 5 * 60 * 1000, // same order as the other billing jobs; calculation loops per billing_account
  handler,
  // Exported for scripts/test-billing-monthly-cycle.js only.
  computeMostRecentCycleBoundary,
  ensurePeriod,
};
