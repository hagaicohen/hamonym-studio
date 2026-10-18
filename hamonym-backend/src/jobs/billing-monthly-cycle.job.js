// Billing Monthly Cycle v1 (2026-09-08; restored to the frozen 28->28
// cutoff model 2026-09-18; automatic eligibility transition added 2026-10,
// FIN-11 closure) -- the automated entry point for Billing's cutoff step:
// ensure a billing_period exists for the most recently-passed
// 28th-20:00-Israel-time cutoff, run production calculation against it
// exactly once, then auto-approve every draft Statement that passes the
// EXACT SAME validation a human "אשר חיוב" click already used (see
// autoApproveDraftStatementsForRun below). CARD collection and MASAV
// export/submission still stay deliberate, separate actions (this job
// never calls either service) -- only the draft->approved eligibility
// step, which the approved FIN-11 contract explicitly says should not be
// a routine manual task, moved into this job. See
// docs/HAMONYM_BILLING_ENGINE_SPEC.md and the 2026-09-07 Billing v1
// Operational Cycle Audit for the original two-step automation this
// extends.
//
// Reuses calculation.service.js#runProductionCalculation and
// approval.service.js#approveStatement verbatim -- no financial logic is
// reimplemented here. Deliberately does NOT call billing-ops.service.js#
// createPeriod/calculatePeriod/approveStatement (the human-triggered,
// audit-logged WRAPPERS used by the Super Admin UI): platform_audit_log.
// super_admin_user_id is BIGINT NOT NULL REFERENCES users(id) (migration
// 012), so those wrappers structurally cannot be called by an unattended
// job without inventing a fake "system" super admin user. This job instead
// calls approval.service.js#approveStatement directly -- that underlying
// function never wrote platform_audit_log to begin with (confirmed by
// reading it), so there is no such audit problem to work around for the
// approval step itself. This job's own job_runs.result_summary is the
// correct, already-established audit trail for automated actions, same as
// every other job in this directory.
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
//   - Approves (2026-10+) draft Statements created by THIS run's own
//     calculation, via the same approveStatement() idempotency a human
//     click already relies on (re-approving an already-approved Statement
//     is a safe no-op, see that function's own header) -- but never
//     collects, never touches MASAV, never creates a Payment, since this
//     job still never calls any of those services.
const calculation = require('../modules/billing-engine/calculation.service');
const { resolveSelectedMonthBoundary, ensurePeriod } = require('../modules/billing-engine/billing-period.util');
const { autoApproveDraftStatementsForRun } = require('../modules/billing-engine/approval.service');
const { recordFinding } = require('../jobs/reconciliation-findings');
const pool = require('../db/db');

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

// `now` is the BUSINESS instant the cutoff decision is made against, and is
// injectable so scripts/test-billing-monthly-cycle.js can target a fixed,
// far-future fixture month instead of racing whatever real billing_periods
// already exist in production.
//
// Updated 2026-10-09 (business clock, Phase A): job-runner.js now calls
// `job.handler(db, { now })` with business time from src/lib/clock.js, so on
// a real schedule tick this receives that value rather than falling through
// to the default. With simulation off clock.now() returns a plain
// `new Date()`, so the value — and therefore which cycle this job closes —
// is bit-for-bit what it was before. The `new Date()` default is retained
// for direct callers (scripts, a future admin action) that invoke the
// handler without a context object.
//
// Everything this `now` feeds is genuinely business time: the cutoff
// comparison in computeMostRecentCycleBoundary below, and the asOf argument
// to runProductionCalculation. The calculation/period/approval services
// themselves take their time parametrically (year/month, asOf) and are not
// modified here.
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

  // Automatic eligibility transition (2026-10, FIN-11 closure) -- "routine
  // monthly Statement approval is NOT part of the intended business
  // workflow" per the approved contract. Calls the EXACT SAME validated
  // approveStatement() a human click already used (approval.service.js),
  // never a parallel/looser check -- so this can only ever auto-approve a
  // Statement that was already eligible by the existing rules. A Statement
  // that fails validation stays 'draft' ("calculated but not yet
  // eligible") and gets ONE recorded finding per statement, surfaced to
  // the Super Admin as a genuine exception -- never retried blindly, never
  // forced through. This does NOT write platform_audit_log (unlike the
  // human-triggered billing-ops.service.js wrapper) -- approval.service.js
  // #approveStatement never did, by design (see its own header), so there
  // is no "fake system super admin" audit problem to invent a workaround
  // for. job_runs.result_summary (below) is this job's own already-
  // established audit trail for automated actions, same as every other
  // job in this directory.
  //
  // DEPLOYMENT-SAFETY GUARD (2026-10, controlled production deployment) --
  // billing-monthly-cycle is ALREADY registered and running on its real
  // schedule in production. Unlike FIN-11's 3 new jobs (safe simply by
  // staying unregistered), this job's NEXT real tick would otherwise run
  // the auto-approval logic above immediately once this code is deployed
  // -- deploying is not the same decision as activating. FIN11_AUTO_
  // APPROVAL_ENABLED defaults OFF (unset or anything other than the exact
  // string 'true'): deploying this commit changes NOTHING about what a
  // real scheduled run does until a SEPARATE, explicit Render env-var
  // change turns it on -- the smallest possible guard, not a new
  // architecture. When OFF, this job's behavior is byte-for-byte what it
  // was before this stage (create period, run calculation, stop).
  const autoApprovalEnabled = process.env.FIN11_AUTO_APPROVAL_ENABLED === 'true';
  let autoApproval = { approved: [], failed: [] };
  if (autoApprovalEnabled) {
    autoApproval = await autoApproveDraftStatementsForRun(result.billingRunId);
    for (const failure of autoApproval.failed) {
      await recordFinding(pool, {
        jobName: 'billing-monthly-cycle',
        findingType: 'statement_auto_approval_failed',
        severity: 'warning',
        subjectType: 'statement',
        subjectId: failure.statementId,
        details: { code: failure.code, message: failure.message },
      });
    }
  }

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
    autoApprovalEnabled,
    statementsAutoApproved: autoApproval.approved.length,
    statementsAutoApprovalFailed: autoApproval.failed.length,
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
  // Explicit staleness policy (2026-10-11). Required because this schedule is
  // dense-within-a-rare-window: schedule-window.js's intervalMsFor() reads the
  // gap to the previous matching MINUTE, which for '0 * 28 * *' is 1 hour, so
  // the generic 2x-interval tolerance declared this job stale on every one of
  // the ~29 days between real runs -- a confirmed false positive that queued a
  // real admin-scheduler-stale notification while all 24 day-28 runs had
  // succeeded.
  //
  // 35 days, not 31: the largest HEALTHY gap between two successes is
  // Jan 28 00:00 -> Feb 28 23:00 (31 days 23 hours, the longest day-28-to-
  // day-28 span plus a full day of trigger jitter inside the 24 hourly
  // windows), so 35 days leaves ~3 days of slack above the worst legitimate
  // case and cannot be tripped by scheduling jitter around day 28. It is
  // still far tighter than the next real opportunity to run: a completely
  // missed month is reported ~4 days into the following month, roughly 25
  // days before day 28 comes round again.
  staleAfterMs: 35 * 24 * 60 * 60 * 1000,
  timeoutMs: 5 * 60 * 1000, // same order as the other billing jobs; calculation loops per billing_account
  handler,
  // Exported for scripts/test-billing-monthly-cycle.js only.
  computeMostRecentCycleBoundary,
  ensurePeriod,
};
