const db = require('../../../db/db');
const jobRunner = require('../../../jobs');
const { checkStaleness } = require('../../../jobs/schedule-window');

// Read-only + "repair local state" actions only — see
// docs/CARDCOM_OPERATIONAL_PROCESSES.md Part G. Every job reachable through
// run() here is detect-only or re-processes Hamonym's own already-received
// data (webhook-recovery); none of them call a Cardcom endpoint that
// creates or changes a charge. That boundary is enforced by what's
// registered in src/jobs/index.js, not by a check in this controller — do
// not register a financial-action job there without updating this comment
// and getting explicit product sign-off first.
//
// Two temporary diagnostics lived here 2026-08-30 (hamonym-terminal-auth,
// hamonym-token-charge) to prove the 603 fix and the CardCom adapter
// against the real API -- both removed after use, once they'd served their
// purpose (a standing endpoint capable of a real charge has no reason to
// stay in production). Evidence preserved in
// docs/BILLING_ENGINE_SESSION_HANDOFF_2026-08-28.md's MILESTONE sections.

// Alerts are computed here, not stored/pushed anywhere — Operational Policy
// (2026-08-16): no new notification system yet, the Platform Admin
// dashboard reading this endpoint IS the alert surface for now. Three
// conditions, each traceable to a real, already-seen failure mode rather
// than invented for completeness: a job's last run failed outright; an
// open `critical` finding exists; webhook-recovery's own last run ended
// with unresolved `failed`/`notRouted` events (the two outcomes that were
// specifically NOT folded into "recovered" when its metrics were fixed —
// see webhook-recovery.job.js).
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

// Separate from computeAlerts (which only reads the already-fetched
// lastJobRuns rows) — staleness needs its own per-job query via
// schedule-window.checkStaleness(): "how long since this job last actually
// succeeded", not "did its last recorded run fail" (a job that simply never
// got triggered has no failed run to catch it, no critical finding either —
// exactly the 2026-08-18 gap). 2x the job's own schedule interval before
// alarming — one missed cycle is within normal trigger jitter, two in a row
// means the trigger itself likely isn't firing.
async function computeStaleAlerts(now) {
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
// this reads cron-entry.js's own unconditional heartbeat row instead, so
// "is the trigger itself alive" is one direct answer, not an inference from
// several jobs all going quiet together. 30 minutes = 2x the 15-minute tick
// interval, same "one miss is jitter, two in a row means it stopped"
// tolerance as checkStaleness.
const HEARTBEAT_TOLERANCE_MS = 30 * 60 * 1000;

// Takes db explicitly (same injectable convention as schedule-window.js's
// checkStaleness(db, job, now)) so scripts/test-billing-monthly-cycle.js can
// exercise this against a fake db instead of racing real production
// job_runs rows (a real MAX(started_at) in a shared table can't be held
// still for a "not healthy" assertion once the real scheduler is running).
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

// Exported for scripts/test-cardcom-ops-cadence-classification.js only —
// all three functions are pure (given their already-fetched rows/db), no
// route depends on these exports existing.
exports.computeAlerts = computeAlerts;
exports.computeStaleAlerts = computeStaleAlerts;
exports.getSchedulerHeartbeat = getSchedulerHeartbeat;

exports.getHealth = async (req, res) => {
  try {
    const lastWebhooks = await db.query(
      `SELECT COALESCE(record_type, 'LowProfile') AS type, MAX(received_at) AS last_received_at, COUNT(*) FILTER (WHERE received_at > NOW() - INTERVAL '24 hours') AS count_24h
       FROM cardcom_webhook_events
       GROUP BY COALESCE(record_type, 'LowProfile')`
    );
    const lastJobRuns = await db.query(
      `SELECT DISTINCT ON (job_name) job_name, status, started_at, finished_at, duration_ms, error, result_summary
       FROM job_runs ORDER BY job_name, started_at DESC`
    );
    const criticalOpenRes = await db.query(
      `SELECT count(*)::int AS count FROM reconciliation_findings WHERE resolved_at IS NULL AND severity = 'critical'`
    );
    const staleAlerts = await computeStaleAlerts(new Date());
    const schedulerHeartbeat = await getSchedulerHeartbeat(db, new Date());
    const schedulerAlerts = schedulerHeartbeat.healthy ? [] : [{
      type: 'scheduler_not_running',
      severity: 'critical',
      minutesSinceLastHeartbeat: schedulerHeartbeat.minutesSinceLastHeartbeat,
      message: schedulerHeartbeat.minutesSinceLastHeartbeat == null
        ? 'ה-Scheduler (Render Cron) מעולם לא דיווח על ריצה'
        : `ה-Scheduler (Render Cron) לא דיווח על ריצה כבר ${schedulerHeartbeat.minutesSinceLastHeartbeat} דקות`,
    }];

    res.json({
      webhooks: lastWebhooks.rows,
      jobs: lastJobRuns.rows,
      knownJobs: jobRunner.list(),
      schedulerHeartbeat,
      alerts: [...schedulerAlerts, ...computeAlerts(lastJobRuns.rows, criticalOpenRes.rows[0].count), ...staleAlerts],
    });
  } catch (err) {
    console.error('[cardcom-ops.getHealth]', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.getJobRuns = async (req, res) => {
  try {
    const { jobName } = req.query;
    const limit = Math.min(parseInt(req.query.limit || '25', 10), 100);
    const params = jobName ? [jobName, limit] : [limit];
    const where = jobName ? 'WHERE job_name = $1' : '';
    const runs = await db.query(
      `SELECT id, job_name, status, started_at, finished_at, duration_ms, result_summary, error, triggered_by
       FROM job_runs ${where} ORDER BY started_at DESC LIMIT $${params.length}`,
      params
    );
    res.json({ runs: runs.rows });
  } catch (err) {
    console.error('[cardcom-ops.getJobRuns]', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.runJob = async (req, res) => {
  try {
    const { name } = req.params;
    if (!jobRunner.list().includes(name)) {
      return res.status(404).json({ error: `Unknown job: ${name}` });
    }
    const result = await jobRunner.run(name, { triggeredBy: `admin:${req.user.id}` });
    res.json(result);
  } catch (err) {
    console.error('[cardcom-ops.runJob]', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.getFindings = async (req, res) => {
  try {
    const includeResolved = req.query.includeResolved === 'true';
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const findings = await db.query(
      `SELECT id, job_name, finding_type, severity, subject_type, subject_id, details, found_at, last_seen_at, resolved_at, resolved_by
       FROM reconciliation_findings
       ${includeResolved ? '' : 'WHERE resolved_at IS NULL'}
       ORDER BY last_seen_at DESC LIMIT $1`,
      [limit]
    );
    res.json({ findings: findings.rows });
  } catch (err) {
    console.error('[cardcom-ops.getFindings]', err.message);
    res.status(500).json({ error: err.message });
  }
};

// Bookkeeping only — marks a finding as looked-at/handled. Never touches
// donations/campaigns/recurring_instructions itself.
exports.resolveFinding = async (req, res) => {
  try {
    await db.query(
      `UPDATE reconciliation_findings SET resolved_at=NOW(), resolved_by=$1 WHERE id=$2`,
      [`admin:${req.user.id}`, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[cardcom-ops.resolveFinding]', err.message);
    res.status(500).json({ error: err.message });
  }
};
