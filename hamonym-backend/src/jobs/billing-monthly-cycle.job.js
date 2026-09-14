// Billing Monthly Cycle v1 (2026-09-08) -- the automated entry point for
// Billing's month-start steps: ensure a billing_period exists for the
// immediately preceding calendar month, then run production calculation
// against it exactly once. Everything after that -- Statement approval,
// CARD collection, MASAV export/submission -- stays a deliberate, manual
// Super Admin action; this job never calls any of those services, so it is
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
const { computeCalendarMonthUtcBoundary, ensurePeriod } = require('../modules/billing-engine/billing-period.util');

// UTC calendar-month boundaries, matching the exact convention already used
// by every real billing_period in production (period_start/period_end sit
// on UTC month boundaries -- confirmed directly against the live July/
// August 2026 rows). Computed from `now`'s own UTC year/month rather than
// from the cron's theoretical scheduled window (job-runner.js's handler
// signature is `(db) => result`, it does not thread windowStart through) --
// correct as long as the job actually executes within its intended month,
// which schedule-window.js's 40-day catch-up lookback (raised alongside
// this job) comfortably covers for any realistic Render Cron outage.
//
// 2026-09-13: date math itself (computeCalendarMonthUtcBoundary) and the
// find-or-create (ensurePeriod) moved to billing-period.util.js, shared
// verbatim with the new manual "בחר חודש" Platform Admin action
// (billing-ops.service.js#createPeriodForMonth) -- so both paths compute
// the exact same boundaries for the same calendar month and structurally
// cannot create two different billing_periods for it. Confirmed
// byte-identical to the pre-move implementation for every boundary case
// including the January -> December-of-prior-year rollover (passing
// month - 1 = 0 straight through to Date.UTC, which normalizes it
// natively -- no special-casing needed) before this refactor.
function computePreviousMonthUtcBoundary(now) {
  const year = now.getUTCFullYear();
  const currentMonth1to12 = now.getUTCMonth() + 1;
  return computeCalendarMonthUtcBoundary(year, currentMonth1to12 - 1);
}

// `now` is injectable (defaults to the real clock) so
// scripts/test-billing-monthly-cycle.js can target a fixed, far-future
// fixture month instead of racing whatever real July/August/September 2026
// billing_periods already exist in production -- job-runner.js still calls
// `job.handler(db)` with a single argument in production, so this default
// is what actually runs on a real schedule tick.
async function handler(db, { now = new Date() } = {}) {
  const { periodStart, periodEnd } = computePreviousMonthUtcBoundary(now);

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
  schedule: '0 3 1 * *', // 03:00 UTC on the 1st calendar day of every month
  timeoutMs: 5 * 60 * 1000, // same order as the other billing jobs; calculation loops per billing_account
  handler,
  // Exported for scripts/test-billing-monthly-cycle.js only.
  computePreviousMonthUtcBoundary,
  ensurePeriod,
};
