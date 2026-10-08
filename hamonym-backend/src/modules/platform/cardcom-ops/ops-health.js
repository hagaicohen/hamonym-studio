// Operational health detection — extracted verbatim from
// cardcom-ops.controller.js (2026-10-07, Admin Notifications P0) so there is
// ONE definition of "a job's last run failed" / "a job is stale" / "the
// scheduler isn't running", shared by:
//   * the read-only Platform Admin health endpoint (GET /health), and
//   * operational-alerting.job.js, which pushes the same conditions as
//     emails from a write path.
// A second, parallel definition in a job file is exactly how a dashboard and
// an alert start disagreeing about whether something is wrong.
//
// Requires jobs/job-runner directly, NOT jobs/index: index.js's own
// module.exports is assigned only after it has required every job file, so a
// job requiring this module while index is still loading would receive a
// half-initialized object. job-runner.js has no dependency on index, and the
// registry it holds is fully populated by the time any handler actually runs.
const jobRunner = require('../../../jobs/job-runner');
const { checkStaleness } = require('../../../jobs/schedule-window');

// Alerts are computed, not stored — Operational Policy (2026-08-16). Three
// conditions, each traceable to a real, already-seen failure mode rather
// than invented for completeness: a job's last run failed outright; an open
// `critical` finding exists; webhook-recovery's own last run ended with
// unresolved `failed`/`notRouted` events (the two outcomes that were
// specifically NOT folded into "recovered" — see webhook-recovery.job.js).
function computeAlerts(jobRuns, criticalOpenCount) {
  const alerts = [];

  for (const job of jobRuns) {
    if (job.status === 'failed') {
      alerts.push({
        type: 'job_failed',
        severity: 'critical',
        jobName: job.job_name,
        message: `${job.job_name} נכשל בריצה האחרונה: ${job.error}`,
      });
    }
    if (job.job_name === 'webhook-recovery' && job.result_summary) {
      const { failed = 0, notRouted = 0 } = job.result_summary;
      if (failed > 0 || notRouted > 0) {
        alerts.push({
          type: 'webhook_recovery_unresolved',
          severity: 'warning',
          jobName: job.job_name,
          failed,
          notRouted,
          message: `webhook-recovery סיים עם ${failed} failed ו-${notRouted} not-routed שלא טופלו`,
        });
      }
    }
  }

  if (criticalOpenCount > 0) {
    alerts.push({
      type: 'critical_findings_open',
      severity: 'critical',
      count: criticalOpenCount,
      message: `${criticalOpenCount} findings פתוחים בחומרה critical`,
    });
  }

  return alerts;
}

// Separate from computeAlerts (which only reads already-fetched job rows) —
// staleness needs its own per-job query via schedule-window.checkStaleness():
// "how long since this job last actually succeeded", not "did its last
// recorded run fail" (a job that simply never got triggered has no failed run
// to catch it, no critical finding either — exactly the 2026-08-18 gap). 2x
// the job's own schedule interval before alarming — one missed cycle is
// within normal trigger jitter, two in a row means the trigger itself likely
// isn't firing.
//
// Takes db explicitly (2026-10-07) instead of closing over the pool, so the
// alerting job and the tests can pass their own handle — same injectable
// convention checkStaleness and getSchedulerHeartbeat already use. A job with
// `schedule: null` (the three frozen reconciliation jobs) is skipped, as
// before: a job with no schedule has no window to be late for.
async function computeStaleAlerts(db, now) {
  const alerts = [];

  for (const name of jobRunner.list()) {
    const job = jobRunner.get(name);
    if (!job?.schedule) continue;

    const { stale, msSinceLastSuccess } = await checkStaleness(db, job, now);
    if (!stale) continue;

    const message = msSinceLastSuccess == null
      ? `${name} מעולם לא הצליח לרוץ`
      : `${name} לא רץ בהצלחה ${Math.round(msSinceLastSuccess / 60_000)} דקות`;
    alerts.push({
      type: 'job_stale',
      severity: 'critical',
      jobName: name,
      minutesSinceLastSuccess: msSinceLastSuccess == null ? null : Math.round(msSinceLastSuccess / 60_000),
      // Frozen for the lifetime of the incident (it only moves when the job
      // next succeeds, which is also when the incident ends) — which is what
      // makes it usable as a notification idempotency key.
      lastSuccessAt: msSinceLastSuccess == null ? null : new Date(now.getTime() - msSinceLastSuccess),
      message,
    });
  }

  return alerts;
}

// Scheduler heartbeat (2026-09-08) — distinct from computeStaleAlerts'
// per-job staleness. A job going stale only proves ITS OWN last success is
// old; it says nothing about whether the trigger process (the Render Cron
// Job hitting cron-entry.js every 15 minutes) is running at all. The real
// 2026-08-28..2026-09-07 outage this was built to detect showed up as 8
// separate job_stale alerts with no single fact anyone could point at —
// this reads cron-entry.js's own unconditional heartbeat row instead.
// 30 minutes = 2x the 15-minute tick interval, same "one miss is jitter, two
// in a row means it stopped" tolerance as checkStaleness.
const HEARTBEAT_TOLERANCE_MS = 30 * 60 * 1000;

async function getSchedulerHeartbeat(db, now) {
  const { rows } = await db.query(
    `SELECT MAX(started_at) AS last_heartbeat_at FROM job_runs WHERE job_name = 'scheduler-heartbeat'`
  );
  const lastHeartbeatAt = rows[0].last_heartbeat_at;
  const ageMs = lastHeartbeatAt ? now.getTime() - new Date(lastHeartbeatAt).getTime() : null;
  return {
    lastHeartbeatAt,
    minutesSinceLastHeartbeat: ageMs == null ? null : Math.round(ageMs / 60_000),
    healthy: ageMs != null && ageMs <= HEARTBEAT_TOLERANCE_MS,
  };
}

// The dashboard's scheduler alert, derived from a heartbeat reading — pulled
// out of getHealth's inline literal so the alerting job raises the exact same
// condition with the exact same wording.
function schedulerAlertsFor(heartbeat) {
  if (heartbeat.healthy) return [];
  return [{
    type: 'scheduler_not_running',
    severity: 'critical',
    minutesSinceLastHeartbeat: heartbeat.minutesSinceLastHeartbeat,
    lastHeartbeatAt: heartbeat.lastHeartbeatAt || null,
    message: heartbeat.minutesSinceLastHeartbeat == null
      ? 'ה-Scheduler (Render Cron) מעולם לא דיווח על ריצה'
      : `ה-Scheduler (Render Cron) לא דיווח על ריצה כבר ${heartbeat.minutesSinceLastHeartbeat} דקות`,
  }];
}

module.exports = {
  computeAlerts,
  computeStaleAlerts,
  getSchedulerHeartbeat,
  schedulerAlertsFor,
  HEARTBEAT_TOLERANCE_MS,
};
