const db = require('../../../db/db');
const jobRunner = require('../../../jobs');
const donationsService = require('../../donations/donations.service');

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

// Alert DETECTION now lives in ./ops-health.js (extracted 2026-10-07,
// unchanged logic) because operational-alerting.job.js has to raise the exact
// same conditions as push notifications from a write path — two definitions
// of "stale" is how a dashboard and an alert start disagreeing. This
// controller stays what it always was: READ-ONLY. It computes and returns;
// it stores nothing, pushes nothing and sends no email. Do not add a
// notification call anywhere in this file — see
// src/modules/email/admin-notification.service.js's guarantee #4.
const opsHealth = require('./ops-health');

// Signature preserved as (now) for scripts/test-cardcom-ops-cadence-
// classification.js, which monkey-patches the shared pool and calls this
// with one argument; ops-health takes db explicitly so a job/test can pass
// its own handle.
const computeStaleAlerts = (now) => opsHealth.computeStaleAlerts(db, now);

// Exported for scripts/test-cardcom-ops-cadence-classification.js and
// scripts/test-billing-monthly-cycle.js only — all three are pure (given
// their already-fetched rows/db), no route depends on these exports existing.
exports.computeAlerts = opsHealth.computeAlerts;
exports.computeStaleAlerts = computeStaleAlerts;
exports.getSchedulerHeartbeat = opsHealth.getSchedulerHeartbeat;

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
    const schedulerHeartbeat = await opsHealth.getSchedulerHeartbeat(db, new Date());
    const schedulerAlerts = opsHealth.schedulerAlertsFor(schedulerHeartbeat);

    res.json({
      webhooks: lastWebhooks.rows,
      jobs: lastJobRuns.rows,
      knownJobs: jobRunner.list(),
      schedulerHeartbeat,
      alerts: [...schedulerAlerts, ...opsHealth.computeAlerts(lastJobRuns.rows, criticalOpenRes.rows[0].count), ...staleAlerts],
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

// Cross-entity, read-only donations browser (2026-09-15 product decision --
// "תרومות" should primarily let an operator find/identify a real donation).
// requireSuperAdmin only (mounted at router level, same as every other
// route in this file) -- deliberately not requireEntityOwnership(), since
// the whole point is browsing across every entity at once.
exports.listDonations = async (req, res) => {
  try {
    const page = parseInt(req.query.page || '0', 10);
    const limit = parseInt(req.query.limit || '25', 10);
    const { status, entityId, campaignId, period, search, sortBy, sortDir } = req.query;
    const result = await donationsService.getPlatformDonations({ status, entityId, campaignId, period, search, sortBy, sortDir, page, limit });
    res.json(result);
  } catch (err) {
    console.error('[cardcom-ops.listDonations]', err.message);
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
